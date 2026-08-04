import { prisma } from "@/lib/prisma";
import { error } from "@/lib/api-utils";

// Cart itemIds come from localStorage and can outlive a dev reseed (or a soft-deleted item),
// so a stale line would otherwise hit a raw FK 500. Reject with a message the user can act on.
// Returns an error Response when any id is missing/inactive, else null.
export async function assertTemplateItemsExist(itemIds: string[]) {
  const unique = [...new Set(itemIds)];
  const found = await prisma.item.findMany({
    where: { id: { in: unique }, isActive: true },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    return error("มีพัสดุบางรายการไม่มีในระบบแล้ว (ตะกร้าหรือเทมเพลตเก่า) — ลองล้างตะกร้าแล้วเพิ่มใหม่", 400);
  }
  return null;
}
