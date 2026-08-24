import { GoogleGenAI } from "@google/genai";
import { prisma } from "./prisma";

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const genAI = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

// text-embedding-004 ถูกถอดออกจาก API ไปแล้ว (ยิงไปได้ 404 NOT_FOUND) — ตัวที่เหลือคือ
// gemini-embedding-001 ซึ่งคืน 3072 dims มาเป็นค่า default. ขอ 768 กลับมาแทนเพื่อให้ลงคอลัมน์
// vector(768) ที่มีอยู่ได้พอดี ไม่ต้อง migrate schema
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;

/** Whether Gemini embedding is configured */
export const hasEmbedding = () => !!genAI;

/** Generate embedding for a single text */
export async function embedText(text: string): Promise<number[]> {
  if (!genAI) throw new Error("Gemini API key not configured");
  const result = await genAI.models.embedContent({
    model: EMBED_MODEL,
    contents: text,
    config: { outputDimensionality: EMBED_DIMS },
  });
  // ทุก field ใน response เป็น optional ใน SDK ใหม่ — ปล่อยให้ undefined ไหลลงไปเป็น
  // `[undefined]` ใน vectorStr จะกลายเป็น SQL ที่พังตอน cast ซึ่งอ่านไม่ออกว่าต้นเหตุคืออะไร
  const values = result.embeddings?.[0]?.values;
  if (!values?.length) throw new Error("Gemini returned no embedding");
  return values;
}

/** Generate embedding and save to DB for an item */
export async function embedItem(itemId: string): Promise<void> {
  if (!genAI) return;
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { category: { select: { name: true } } },
  });
  if (!item) return;

  const text = `${item.name} ${item.nameEn ?? ""} ${item.code} ${item.category?.name ?? ""}`.trim();
  const values = await embedText(text);
  const vectorStr = `[${values.join(",")}]`;

  await prisma.$executeRawUnsafe(
    `UPDATE items SET embedding = $1::vector WHERE id = $2`,
    vectorStr,
    itemId,
  );
}

/** Semantic search: embed query → cosine similarity → top K */
export async function similaritySearch(
  query: string,
  opts: { limit?: number; excludeId?: string; threshold?: number } = {},
): Promise<Array<{ id: string; code: string; name: string; categoryName: string; categoryType: string; similarity: number }>> {
  if (!genAI) throw new Error("Gemini API key not configured");

  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 20);
  const { excludeId = null, threshold = 0.5 } = opts;
  const values = await embedText(query);
  const vectorStr = `[${values.join(",")}]`;

  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; code: string; name: string; category_name: string; category_type: string; similarity: number }>
  >(
    // ชื่อ model ใน Prisma กับชื่อตารางจริงไม่ตรงกัน (@@map) — raw SQL ต้องใช้ชื่อตารางจริง
    // ส่วน categoryType คือ dispenseType ที่อยู่บน profile ไม่ได้อยู่บน category
    `SELECT
       i.id,
       i.code,
       i.name,
       c.name AS category_name,
       p."dispenseType" AS category_type,
       1 - (i.embedding <=> $1::vector) AS similarity
     FROM items i
     LEFT JOIN categories c ON c.id = i."categoryId"
     LEFT JOIN category_profiles p ON p.id = c."profileId"
     WHERE i.embedding IS NOT NULL
       AND i."isActive" = true
       AND ($2::text IS NULL OR i.id != $2)
     ORDER BY i.embedding <=> $1::vector
     LIMIT $3`,
    vectorStr,
    excludeId,
    limit,
  );

  return rows
    .filter((r) => r.similarity >= threshold)
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      categoryName: r.category_name ?? "",
      categoryType: r.category_type ?? "",
      similarity: r.similarity,
    }));
}
