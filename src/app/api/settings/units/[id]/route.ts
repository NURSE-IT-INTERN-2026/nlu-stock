import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, notFound, error, parseBody } from "@/lib/api-utils";
import { unitUpdateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(unitUpdateSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  if (data.name) {
    const existing = await prisma.unit.findUnique({ where: { name: data.name } });
    if (existing && existing.id !== id) return error("มีหน่วยนี้อยู่แล้ว", 409);
  }

  try {
    const unit = await prisma.unit.update({ where: { id }, data });
    return json(unit);
  } catch {
    return notFound("Unit not found");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const [itemCount, kitCount] = await Promise.all([
    prisma.item.count({ where: { issueUnitId: id } }),
    prisma.kitBom.count({ where: { unitId: id } }),
  ]);
  if (itemCount > 0 || kitCount > 0) return error("ลบไม่ได้เนื่องจากหน่วยนี้มีพัสดุหรือชุดที่ใช้อยู่", 409);

  try {
    await prisma.unit.delete({ where: { id } });
    return json({ success: true });
  } catch {
    return notFound("Unit not found");
  }
}
