import { prisma } from "@/lib/prisma";
import { lockItems, recomputeItemCounts } from "@/lib/stock";
import { requireSuperAdmin, json, notFound, parseBody, error } from "@/lib/api-utils";
import { subItemUpdateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseErr } = await parseBody(subItemUpdateSchema)(request);
  if (parseErr) return parseErr;
  if (!data) return error("No data");

  try {
    const subItem = await prisma.subItem.update({ where: { id }, data });
    return json(subItem);
  } catch {
    return notFound("Sub-item not found");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  // ทุก relation ที่ชี้มาที่ sub_items แล้ว **กันการลบ** (ไม่ได้ตั้ง onDelete = Restrict):
  // เดิมนับแค่ dispenseRecords ชิ้นที่เคยถูกเปลี่ยนสถานะอย่างเดียว (ชำรุด → ส่งซ่อม → รับซ่อม
  // เขียน ItemStatusLog ทุกครั้ง) จึงผ่านด่านนี้ไปตายที่ FK แทน. maintenanceRecords/cartLines
  // ไม่อยู่ในนี้เพราะเป็น Cascade — หายไปพร้อมชิ้น. เพิ่ม relation ใหม่ที่ SubItem เมื่อไหร่
  // ให้กลับมาดูว่ามันเป็น Cascade หรือ Restrict.
  const sub = await prisma.subItem.findUnique({
    where: { id },
    select: {
      itemId: true,
      _count: { select: { dispenseRecords: true, statusLogs: true, returnRecords: true, kitContents: true } },
    },
  });
  if (!sub) return notFound("Sub-item not found");
  if (Object.values(sub._count).some((n) => n > 0)) {
    return error("ลบไม่ได้เพราะชิ้นนี้มีประวัติการใช้งานแล้ว");
  }

  // Same reason as the create side: the parent's counters ARE the sub-item counts.
  try {
    await prisma.$transaction(async (tx) => {
      await lockItems(tx, [sub.itemId]);
      await tx.subItem.delete({ where: { id } });
      await recomputeItemCounts(tx, sub.itemId);
    });
  } catch {
    // ประวัติที่เกิดขึ้นระหว่างเช็คกับลบ (เจ้าหน้าที่อีกคนเพิ่งเบิกชิ้นนี้ไป) — FK กันไว้ให้แล้ว
    return error("ลบไม่ได้เพราะชิ้นนี้มีประวัติการใช้งานแล้ว");
  }

  return json({ success: true });
}
