/**
 * Backfill embeddings for all existing items.
 *
 * Usage:
 *   npx tsx scripts/backfill-embeddings.ts
 *
 * Requires GOOGLE_GENERATIVE_AI_API_KEY in .env
 */
import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import pg from "pg";

const { DATABASE_URL, GOOGLE_GENERATIVE_AI_API_KEY } = process.env;
if (!DATABASE_URL || !GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error("Missing DATABASE_URL or GOOGLE_GENERATIVE_AI_API_KEY");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GOOGLE_GENERATIVE_AI_API_KEY);
const pool = new pg.Pool({ connectionString: DATABASE_URL });

const BATCH_SIZE = 10;
const DELAY_MS = 500; // Rate limit padding

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { rows: items } = await pool.query(
    `SELECT i.id, i.name, i.code, i."nameEn", c.name AS category_name
     FROM "Item" i
     LEFT JOIN "CategoryType" c ON c.id = i."categoryId"
     WHERE i.embedding IS NULL AND i."isActive" = true
     ORDER BY i.id`,
  );

  console.log(`Found ${items.length} items without embeddings`);

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    console.log(`Processing ${i + 1}–${Math.min(i + BATCH_SIZE, items.length)} / ${items.length}`);

    for (const item of batch) {
      try {
        const text = `${item.name} ${item.nameEn ?? ""} ${item.code} ${item.category_name ?? ""}`.trim();
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const result = await model.embedContent(text);
        const values = result.embedding.values;
        const vectorStr = `[${values.join(",")}]`;

        await pool.query(
          `UPDATE "Item" SET embedding = $1::vector WHERE id = $2`,
          [vectorStr, item.id],
        );
      } catch (e) {
        console.error(`Failed item ${item.id} (${item.name}):`, e);
      }
    }

    if (i + BATCH_SIZE < items.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log("Done!");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
