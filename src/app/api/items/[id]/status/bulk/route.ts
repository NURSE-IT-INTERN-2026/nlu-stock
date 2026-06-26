import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, error, parseBody, forbidden } from "@/lib/api-utils";
import { bulkSubItemStatusSchema } from "@/lib/validators";
import { recomputeItemCounts } from "@/lib/stock";
import { NextRequest } from "next/server";

// Bulk per-piece status change for tracked items (adjust dialog). One atomic transaction,
// one recompute at the end. Audit = ItemStatusLog per subItem.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return forbidden();

  const { id } = await params;
  const { data, error: parseError } = await parseBody(bulkSubItemStatusSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const item = await prisma.item.findUnique({ where: { id }, select: { id: true, trackIndividually: true } });
  if (!item) return notFound("Item not found");
  if (!item.trackIndividually) return error("รายการนี้ไม่ได้นับรายชิ้น ใช้การปรับสต็อกแทน");

  const counts = await prisma.$transaction(async (tx) => {
    const subs = await tx.subItem.findMany({
      where: { id: { in: data.subItemIds }, itemId: id },
      select: { id: true, status: true },
    });
    if (subs.length !== data.subItemIds.length) return null; // some not found / not owned by this item

    for (const sub of subs) {
      if (sub.status === data.newStatus) continue; // no-op, skip logging
      await tx.subItem.update({ where: { id: sub.id }, data: { status: data.newStatus } });
      await tx.itemStatusLog.create({
        data: {
          itemId: id,
          subItemId: sub.id,
          previousStatus: sub.status,
          newStatus: data.newStatus,
          reason: data.notes || `Adjusted to ${data.newStatus}`,
          changedBy: auth.user.userId,
          imageUrl: data.imageUrl,
        },
      });
    }

    return recomputeItemCounts(tx, id);
  });

  if (counts === null) return notFound("Some sub-items not found");
  return json(counts, 201);
}
