import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, notFound, error, parseBody } from "@/lib/api-utils";
import { categoryUpdateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(categoryUpdateSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  try {
    const category = await prisma.categoryType.update({ where: { id }, data });
    return json(category);
  } catch {
    return notFound("Category not found");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const itemCount = await prisma.item.count({ where: { categoryId: id } });
  if (itemCount > 0) return error("ลบไม่ได้เนื่องจากหมวดหมู่นี้มีพัสดุอยู่", 409);

  // ประเภทที่เหลือศูนย์หมวดย่อยรับพัสดุไม่ได้และหายไปจากตัวกรอง — ลบตัวสุดท้ายทิ้งไม่ได้
  // อยากล้างทั้งประเภทให้ลบที่ประเภทแทน (DELETE /api/settings/profiles/[id] กวาดให้ทีเดียว)
  const category = await prisma.categoryType.findUnique({ where: { id }, select: { profileId: true } });
  if (!category) return notFound("Category not found");
  const siblings = await prisma.categoryType.count({ where: { profileId: category.profileId } });
  if (siblings <= 1) return error("ลบไม่ได้เพราะเป็นหมวดหมู่ย่อยตัวสุดท้ายของประเภทนี้ — ลบที่ประเภทแทน", 409);

  try {
    await prisma.categoryType.delete({ where: { id } });
    return json({ success: true });
  } catch {
    return notFound("Category not found");
  }
}
