import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { stockValueRows } from "@/lib/cost";
import { NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const categoryId = params.get("categoryId") || undefined;
  const profileId = params.get("profileId") || undefined;

  const where: Prisma.ItemWhereInput = { isActive: true };
  if (categoryId) where.categoryId = categoryId;
  else if (profileId) where.category = { profileId };

  // ทั้งแถวและวิธีตีราคามาจาก lib/cost — ไฟล์ export ใช้ตัวเดียวกัน จึงไม่มีทางให้ตัวเลข
  // บนจอกับในไฟล์เถียงกัน. summary ที่นี่เป็นยอดรวมทั้งคลัง; หน้าจอแยกสิ้นเปลือง/คงทน
  // แล้วพับเองจากแถวที่กรองไว้.
  const rows = await stockValueRows(prisma, where);

  const summary = {
    totalValue: rows.reduce((s, r) => s + r.value, 0),
    totalAvailableItems: rows.filter((r) => r.availableQty > 0).length,
    itemsWithoutCost: rows.filter((r) => r.unitCost === null).length,
  };

  return json({ rows, summary });
}
