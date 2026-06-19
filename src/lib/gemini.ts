import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "./prisma";

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

const EMBED_MODEL = "text-embedding-004";

/** Whether Gemini embedding is configured */
export const hasEmbedding = () => !!genAI;

/** Generate embedding for a single text */
export async function embedText(text: string): Promise<number[]> {
  if (!genAI) throw new Error("Gemini API key not configured");
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
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
    `UPDATE "Item" SET embedding = $1::vector WHERE id = $2`,
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
    `SELECT
       i.id,
       i.code,
       i.name,
       c.name AS category_name,
       c.category AS category_type,
       1 - (i.embedding <=> $1::vector) AS similarity
     FROM "Item" i
     LEFT JOIN "CategoryType" c ON c.id = i."categoryId"
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
