import { prisma } from "@/lib/prisma";
import { requireAdmin, json, notFound, error, parseBody } from "@/lib/api-utils";
import { bulkSubItemStatusSchema } from "@/lib/validators";
import { recomputeItemCounts } from "@/lib/stock";
import { canTransition } from "@/lib/status-utils";
import { STATUS_LABELS } from "@/lib/constants";
import { closeOpenLoan, returnLocationUpdate } from "@/lib/returns";
import { NextRequest } from "next/server";

// Bulk per-piece status change for tracked items (adjust dialog). One atomic transaction,
// one recompute at the end. Audit = ItemStatusLog per subItem.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(bulkSubItemStatusSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const item = await prisma.item.findUnique({ where: { id }, select: { id: true, trackIndividually: true, locationId: true } });
  if (!item) return notFound("Item not found");
  if (!item.trackIndividually) return error("รายการนี้ไม่ได้นับรายชิ้น ใช้การปรับสต็อกแทน");

  const subs = await prisma.subItem.findMany({
    where: { id: { in: data.subItemIds }, itemId: id },
    select: { id: true, subCode: true, status: true },
  });
  if (subs.length !== data.subItemIds.length) return notFound("Some sub-items not found");

  // All-or-nothing: a batch where some pieces can't legally reach the target is refused
  // whole, naming the offenders — half-applying it would leave staff guessing what landed.
  const isSuperAdmin = auth.user.role === "SUPERADMIN";
  const blocked = subs.filter((s) => s.status !== data.newStatus && !canTransition(s.status, data.newStatus, { isSuperAdmin }));
  if (blocked.length > 0) {
    return error(
      `เปลี่ยนเป็น "${STATUS_LABELS[data.newStatus]}" ไม่ได้ ${blocked.length} ชิ้น — ` +
        blocked.map((s) => `${s.subCode} (${STATUS_LABELS[s.status]})`).join(", "),
    );
  }

  const counts = await prisma.$transaction(async (tx) => {
    for (const sub of subs) {
      if (sub.status === data.newStatus) continue; // no-op, skip logging
      await tx.subItem.update({
        where: { id: sub.id },
        // No destination picker in the bulk dialog — a stationed piece pulled out of IN_USE
        // here goes back to its spec's location rather than keeping the room it sat in.
        data: {
          status: data.newStatus,
          ...returnLocationUpdate({
            previousStatus: sub.status,
            newStatus: data.newStatus,
            itemLocationId: item.locationId,
          }),
        },
      });
      await tx.itemStatusLog.create({
        data: {
          itemId: id,
          subItemId: sub.id,
          previousStatus: sub.status,
          newStatus: data.newStatus,
          reason: data.notes || `ปรับสถานะเป็น ${STATUS_LABELS[data.newStatus] ?? data.newStatus}`,
          changedBy: auth.user.userId,
          imageUrl: data.imageUrl,
        },
      });
      await closeOpenLoan(tx, {
        itemId: id,
        subItemId: sub.id,
        previousStatus: sub.status,
        newStatus: data.newStatus,
        userId: auth.user.userId,
      });
    }

    return recomputeItemCounts(tx, id);
  });

  return json(counts, 201);
}
