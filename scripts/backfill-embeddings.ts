/**
 * Backfill embeddings for all existing items.
 *
 * Usage:
 *   npx tsx scripts/backfill-embeddings.ts          # เฉพาะตัวที่ยังไม่มี embedding
 *   npx tsx scripts/backfill-embeddings.ts --all    # ล้างของเดิมแล้วทำใหม่ทั้งตาราง
 *
 * ใช้ --all เมื่อเปลี่ยน embedding model. vector ที่มาจากคนละ model อยู่คนละสเปซกัน
 * เอามาวัด similarity ข้ามกันไม่ได้ — ผลที่ได้จะดูเหมือนใช้งานได้แต่อันดับมั่วหมด
 *
 * Requires GOOGLE_GENERATIVE_AI_API_KEY in .env
 */
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import pg from "pg";

const { DATABASE_URL, GOOGLE_GENERATIVE_AI_API_KEY } = process.env;
if (!DATABASE_URL || !GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error("Missing DATABASE_URL or GOOGLE_GENERATIVE_AI_API_KEY");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey: GOOGLE_GENERATIVE_AI_API_KEY });
const pool = new pg.Pool({ connectionString: DATABASE_URL });

// ต้องตรงกับ EMBED_MODEL/EMBED_DIMS ใน src/lib/gemini.ts — สคริปต์นี้ไม่ import จากตรงนั้น
// เพราะไฟล์นั้นลาก Prisma client มาด้วย ส่วนสคริปต์นี้คุยกับ pg ตรงๆ
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;

const REDO_ALL = process.argv.includes("--all");

// embedContent รับ contents เป็น array ได้ — ยิงทีเดียวต่อ 10 ชิ้นแทนที่จะยิงทีละชิ้น
// free tier ให้ 100 requests/นาที ของเดิมยิงทีละชิ้นเลยตัน quota ตั้งแต่ยังไม่ถึงครึ่งตาราง
const BATCH_SIZE = 10;
const DELAY_MS = 1000; // 60 batches/นาที เต็มที่ ยังห่างจากเพดาน 100

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface Item {
  id: string;
  name: string;
  code: string;
  nameEn: string | null;
  category_name: string | null;
}

/** ยิง batch เดียว ถ้าโดน 429 รอตามที่ API บอกแล้วลองใหม่ครั้งเดียว */
async function embedBatch(texts: string[]) {
  const call = () =>
    genAI.models.embedContent({
      model: EMBED_MODEL,
      contents: texts,
      config: { outputDimensionality: EMBED_DIMS },
    });
  try {
    return (await call()).embeddings ?? [];
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 429) throw e;
    // ข้อความ error พก retryDelay มาให้ ("Please retry in 19.8s") — ใช้ของจริงถ้าอ่านออก
    const secs = Number(/retry in ([\d.]+)s/.exec(String(e))?.[1]);
    const waitMs = Number.isFinite(secs) ? Math.ceil(secs * 1000) + 1000 : 30_000;
    console.log(`Rate limited — waiting ${Math.round(waitMs / 1000)}s`);
    await sleep(waitMs);
    return (await call()).embeddings ?? [];
  }
}

async function main() {
  if (REDO_ALL) {
    const { rowCount } = await pool.query(`UPDATE items SET embedding = NULL WHERE embedding IS NOT NULL`);
    console.log(`Cleared ${rowCount} existing embeddings (--all)`);
  }

  const { rows: items } = await pool.query(
    `SELECT i.id, i.name, i.code, i."nameEn", c.name AS category_name
     FROM items i
     LEFT JOIN categories c ON c.id = i."categoryId"
     WHERE i.embedding IS NULL AND i."isActive" = true
     ORDER BY i.id`,
  );

  console.log(`Found ${items.length} items without embeddings`);

  let done = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const texts = batch.map(
      (it: Item) => `${it.name} ${it.nameEn ?? ""} ${it.code} ${it.category_name ?? ""}`.trim(),
    );

    try {
      const result = await embedBatch(texts);
      for (const [n, item] of batch.entries()) {
        const values = result[n]?.values;
        if (!values?.length) {
          console.error(`No embedding returned for ${item.code} (${item.name})`);
          failed++;
          continue;
        }
        await pool.query(`UPDATE items SET embedding = $1::vector WHERE id = $2`, [
          `[${values.join(",")}]`,
          item.id,
        ]);
        done++;
      }
    } catch (e) {
      failed += batch.length;
      console.error(`Batch ${i + 1}–${i + batch.length} failed:`, e instanceof Error ? e.message : e);
    }

    console.log(`${Math.min(i + BATCH_SIZE, items.length)} / ${items.length} (ok ${done}, fail ${failed})`);
    if (i + BATCH_SIZE < items.length) await sleep(DELAY_MS);
  }

  console.log("Done!");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
