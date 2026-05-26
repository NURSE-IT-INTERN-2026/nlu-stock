import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const categories = await prisma.categoryType.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return json(categories);
}
