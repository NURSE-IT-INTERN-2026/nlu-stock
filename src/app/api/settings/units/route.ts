import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireAuth, json, error, parseBody } from "@/lib/api-utils";
import { unitCreateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const units = await prisma.unit.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true, kitBomItems: true } } },
  });

  return json(units);
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { data, error: parseErr } = await parseBody(unitCreateSchema)(request);
  if (parseErr) return parseErr;
  if (!data) return error("No data");

  const existing = await prisma.unit.findUnique({ where: { name: data.name } });
  if (existing) return error("มีหน่วยนี้อยู่แล้ว", 409);

  const unit = await prisma.unit.create({ data });

  return json(unit, 201);
}
