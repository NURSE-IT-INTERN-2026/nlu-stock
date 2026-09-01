import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, notFound, parseBody, error } from "@/lib/api-utils";
import { userUpdateSchema } from "@/lib/validators";
import { HISTORY_RELATIONS, hasHistory } from "@/lib/user-history";
import { NextRequest } from "next/server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseErr } = await parseBody(userUpdateSchema)(request);
  if (parseErr) return parseErr;
  if (!data) return error("No data");

  try {
    const user = await prisma.user.update({ where: { id }, data });
    return json(user);
  } catch {
    return notFound("User not found");
  }
}

/**
 * ลบถาวร — ใช้ได้เฉพาะแถวที่ยังไม่มีประวัติอะไรเลย (พิมพ์อีเมลผิดตอนเพิ่มเอง / คนที่ล็อกอิน
 * ครั้งเดียวแล้วไม่ได้ทำอะไร). มีประวัติเมื่อไหร่ FK กันไว้แล้ว และก็ไม่ควรลบอยู่ดี —
 * ปิดใช้งานผ่าน PUT แทน. UI ซ่อนปุ่มลบให้ตามค่า hasHistory การเช็คซ้ำตรงนี้กันเคสที่หน้าจอ
 * ค้างข้อมูลเก่าไว้ ระหว่างนั้นเจ้าตัวเพิ่งกดเบิกไป.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { _count: { select: HISTORY_RELATIONS } },
  });
  if (!user) return notFound("User not found");
  if (hasHistory(user._count)) {
    return error("ผู้ใช้นี้มีประวัติการใช้งานแล้ว ลบไม่ได้ — ใช้ปิดใช้งานแทน");
  }

  await prisma.user.delete({ where: { id } });
  return json({ deleted: true });
}
