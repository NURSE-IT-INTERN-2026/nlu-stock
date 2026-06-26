import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, error, parseBody, forbidden } from "@/lib/api-utils";
import { stockAdjustSchema } from "@/lib/validators";
import { ItemStatus } from "@/generated/prisma/enums";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return forbidden();

  const { id } = await params;
  const { data, error: parseError } = await parseBody(stockAdjustSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({ where: { id } });
    if (!item) throw new Error("NOT_FOUND");
    // Tracked items are adjusted per-piece (status change), not by a blind count.
    if (item.trackIndividually) throw new Error("TRACKED_NOT_ALLOWED");

    // ── Lot-level correction (consumables): set a specific lot's remainingQty.
    if (data.lotId != null && data.lotCount != null) {
      const lot = await tx.lot.findUnique({ where: { id: data.lotId } });
      if (!lot || lot.itemId !== id) throw new Error("NOT_FOUND");
      const prev = lot.remainingQty;
      if (data.lotCount === prev) throw new Error("SAME_QTY");
      const delta = data.lotCount - prev;

      await tx.lot.update({ where: { id: lot.id }, data: { remainingQty: data.lotCount } });
      const sumRem = await tx.lot.aggregate({ where: { itemId: id }, _sum: { remainingQty: true } });
      const newAvailable = sumRem._sum.remainingQty ?? 0;

      const adjustment = await tx.stockAdjustment.create({
        data: {
          itemId: id,
          lotId: lot.id,
          delta,
          previousQty: prev,
          newQty: data.lotCount,
          reason: data.reason,
          notes: data.notes,
          adjustedBy: auth.user.userId,
          imageEvidence: data.imageEvidence,
        },
      });
      await tx.item.update({ where: { id }, data: { availableQty: newAvailable } });
      await tx.itemStatusLog.create({
        data: {
          itemId: id,
          previousStatus: item.status,
          newStatus: item.status,
          reason: `Lot ${lot.lotNumber} adjusted: ${prev} → ${data.lotCount} (${delta >= 0 ? "+" : ""}${delta}) (${data.reason})`,
          changedBy: auth.user.userId,
        },
      });
      return adjustment;
    }

    // ── Item-level shelf count (durables / coarse consumable).
    // For tracked items: count CHECKED_OUT sub-items (dispense changes status, not qty)
    // For non-tracked items: diff between total and available
    const checkedOut = item.trackIndividually
      ? await tx.subItem.count({ where: { itemId: id, status: ItemStatus.CHECKED_OUT } })
      : item.totalQty - item.availableQty;

    const shelfCount = data.shelfCount ?? 0;
    const newAvailable = shelfCount;
    const newTotal = shelfCount + checkedOut;

    if (newAvailable === item.availableQty) throw new Error("SAME_QTY");

    const adjustment = await tx.stockAdjustment.create({
      data: {
        itemId: id,
        previousQty: item.availableQty,
        newQty: newAvailable,
        reason: data.reason,
        notes: data.notes,
        adjustedBy: auth.user.userId,
        imageEvidence: data.imageEvidence,
      },
    });

    await tx.item.update({
      where: { id },
      data: {
        availableQty: newAvailable,
        totalQty: newTotal,
      },
    });

    await tx.itemStatusLog.create({
      data: {
        itemId: id,
        previousStatus: item.status,
        newStatus: item.status,
        reason: `Stock adjusted: ${item.availableQty} → ${newAvailable} on shelf (${newTotal} total, ${checkedOut} checked out) (${data.reason})`,
        changedBy: auth.user.userId,
      },
    });

    return adjustment;
  }).catch((e: Error) => {
    if (e.message === "NOT_FOUND") return null;
    if (e.message === "SAME_QTY") return "SAME_QTY";
    if (e.message === "TRACKED_NOT_ALLOWED") return "TRACKED_NOT_ALLOWED";
    throw e;
  });

  if (result === null) return notFound("Item not found");
  if (result === "SAME_QTY") return error("Shelf count is the same as current available quantity");
  if (result === "TRACKED_NOT_ALLOWED") return error("รายการนับรายชิ้น ใช้การเปลี่ยนสถานะรายชิ้นแทน");

  return json(result, 201);
}
