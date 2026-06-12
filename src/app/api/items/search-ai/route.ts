import { NextRequest } from "next/server";
import { requireAuth, json } from "@/lib/api-utils";
import { similaritySearch, hasEmbedding } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

/** Simple text search (fallback / no-API-key mode) */
async function textSearch(q: string, limit: number) {
  const items = await prisma.item.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { nameEn: { contains: q, mode: "insensitive" } },
      ],
    },
    take: limit,
    include: { category: { select: { name: true, category: true } } },
  });

  return items.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    categoryName: r.category?.name ?? "",
    categoryType: r.category?.category ?? "",
    similarity: 1,
  }));
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const q = request.nextUrl.searchParams.get("q");
  const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "5", 10), 1), 20);
  const excludeId = request.nextUrl.searchParams.get("excludeId") ?? undefined;

  if (!q || q.trim().length < 2) {
    return json({ items: [], total: 0 });
  }

  // No API key → text search only
  if (!hasEmbedding()) {
    try {
      const items = await textSearch(q.trim(), limit);
      return json({ items, total: items.length, fallback: true });
    } catch {
      return json({ items: [], total: 0, error: "Search failed" }, 500);
    }
  }

  // Try AI search, fallback to text on failure
  try {
    const items = await similaritySearch(q.trim(), { limit, excludeId });
    if (items.length === 0) {
      const fallback = await textSearch(q.trim(), limit);
      return json({ items: fallback, total: fallback.length, fallback: true });
    }
    return json({ items, total: items.length });
  } catch {
    try {
      const fallback = await textSearch(q.trim(), limit);
      return json({ items: fallback, total: fallback.length, fallback: true });
    } catch {
      return json({ items: [], total: 0, error: "Search failed" }, 500);
    }
  }
}
