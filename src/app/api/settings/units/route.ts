import { prisma } from "@/lib/prisma";
import { requireAdmin, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const units = await prisma.unit.findMany({
    orderBy: { name: "asc" },
  });

  return json(units);
}
