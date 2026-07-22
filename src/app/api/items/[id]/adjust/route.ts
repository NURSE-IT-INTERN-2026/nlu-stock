import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, error, parseBody, forbidden } from "@/lib/api-utils";
import { stockAdjustSchema } from "@/lib/validators";
import { allocateAcrossLots, recomputeItemCounts } from "@/lib/stock";
import { countCycleFor, nextCountFrom } from "@/lib/stock-count";
import { AdjustmentReason } from "@/generated/prisma/enums";
import { ADJUSTMENT_REASON_LABELS } from "@/lib/constants";
import { NextRequest } from "next/server";

const fmtDate = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return forbidden();

  const { id } = await params;
  const { data, error: parseError } = await parseBody(stockAdjustSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const isCount = data.stockCount === true;

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({
      where: { id },
      include: { category: { select: { profile: { select: { dispenseType: true } } } } },
    });
    if (!item) throw new Error("NOT_FOUND");
    // Tracked items are adjusted per-piece (status change), not by a blind count.
    // A scheduled count still applies though — it just records that the pieces were
    // eyeballed; any missing piece is marked LOST individually from the sub-item UI.
    if (item.trackIndividually && !isCount) throw new Error("TRACKED_NOT_ALLOWED");

    const now = new Date();
    const cycleMonths = countCycleFor(item.category.profile.dispenseType, item.countCycleMonths);
    const nextCount = nextCountFrom(now, cycleMonths)!;
    const countStamp = isCount ? { lastCountDate: now, nextCountDate: nextCount } : {};
    const countSuffix = isCount ? ` (นับรอบถัดไป ${fmtDate(nextCount)})` : "";

    // Resolve the reason for a scheduled count from the direction of the delta:
    // counted over = stock the system didn't know about (always COUNT_MISMATCH_OVER,
    // and it must carry a note so the extra units are explainable after the fact),
    // counted short = สูญหาย unless the UI says the missing stock was thrown away
    // (DISPOSAL) or otherwise accounted for.
    const reasonFor = (delta: number): AdjustmentReason => {
      if (!isCount) return data.reason!;
      if (delta > 0) {
        if (!data.notes?.trim()) throw new Error("NOTES_REQUIRED");
        return AdjustmentReason.COUNT_MISMATCH_OVER;
      }
      return data.reason ?? AdjustmentReason.LOST;
    };

    // ── Tracked item: the count is a confirmation, not a qty write.
    if (item.trackIndividually) {
      await tx.item.update({ where: { id }, data: countStamp });
      await tx.itemStatusLog.create({
        data: {
          itemId: id,
          previousStatus: item.status,
          newStatus: item.status,
          reason: `ตรวจนับ: ยืนยันพร้อมใช้งาน ${item.availableQty} ชิ้น${countSuffix}`,
          changedBy: auth.user.userId,
        },
      });
      return { counted: true, nextCountDate: nextCount };
    }

    // ── Lot-level correction (consumables): set a specific lot's remainingQty.
    if (data.lotId != null && data.lotCount != null) {
      const lot = await tx.lot.findUnique({ where: { id: data.lotId } });
      if (!lot || lot.itemId !== id) throw new Error("NOT_FOUND");
      const prev = lot.remainingQty;
      const delta = data.lotCount - prev;

      if (delta === 0) {
        if (!isCount) throw new Error("SAME_QTY");
        await tx.item.update({ where: { id }, data: countStamp });
        await tx.itemStatusLog.create({
          data: {
            itemId: id,
            previousStatus: item.status,
            newStatus: item.status,
            reason: `ตรวจนับ Lot ${lot.lotNumber}: ตรงยอด ${prev}${countSuffix}`,
            changedBy: auth.user.userId,
          },
        });
        return { counted: true, nextCountDate: nextCount };
      }

      const reason = reasonFor(delta);
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
          reason,
          notes: data.notes,
          adjustedBy: auth.user.userId,
          imageEvidence: data.imageEvidence,
        },
      });
      await tx.item.update({ where: { id }, data: { availableQty: newAvailable, ...countStamp } });
      await recomputeItemCounts(tx, id);
      await tx.itemStatusLog.create({
        data: {
          itemId: id,
          previousStatus: item.status,
          newStatus: item.status,
          reason: `${isCount ? "ตรวจนับ" : "แก้ยอด"} Lot ${lot.lotNumber}: ${prev} → ${data.lotCount} (${delta >= 0 ? "+" : ""}${delta}) (เหตุผล:${ADJUSTMENT_REASON_LABELS[reason] ?? reason})${countSuffix}`,
          changedBy: auth.user.userId,
        },
      });
      return adjustment;
    }

    // ── Item-level shelf count (durables / coarse consumable).
    // checkedOut = the gap between total and available; the count is compared against
    // what should be ON THE SHELF, so total moves with the shelf figure.
    const checkedOut = item.totalQty - item.availableQty;

    const shelfCount = data.shelfCount ?? 0;
    const newAvailable = shelfCount;
    const newTotal = shelfCount + checkedOut;

    if (newAvailable === item.availableQty) {
      if (!isCount) throw new Error("SAME_QTY");
      await tx.item.update({ where: { id }, data: countStamp });
      await tx.itemStatusLog.create({
        data: {
          itemId: id,
          previousStatus: item.status,
          newStatus: item.status,
          reason: `ตรวจนับ: ตรงยอด ${newAvailable} บนชั้นวาง${countSuffix}`,
          changedBy: auth.user.userId,
        },
      });
      return { counted: true, nextCountDate: nextCount };
    }

    const reason = reasonFor(newAvailable - item.availableQty);

    const adjustment = await tx.stockAdjustment.create({
      data: {
        itemId: id,
        delta: newAvailable - item.availableQty,
        previousQty: item.availableQty,
        newQty: newAvailable,
        reason,
        notes: data.notes,
        adjustedBy: auth.user.userId,
        imageEvidence: data.imageEvidence,
      },
    });

    // Staff count the shelf, not each lot. Spread the difference over the lots (FEFO out,
    // newest in) so a lot-tracked consumable can still be counted as one number; without
    // this the recompute below would resync availableQty from SUM(lots) and undo the count.
    await allocateAcrossLots(tx, id, newAvailable - item.availableQty);

    await tx.item.update({
      where: { id },
      data: {
        availableQty: newAvailable,
        totalQty: newTotal,
        ...countStamp,
      },
    });
    await recomputeItemCounts(tx, id);

    await tx.itemStatusLog.create({
      data: {
        itemId: id,
        previousStatus: item.status,
        newStatus: item.status,
        reason: `${isCount ? "ตรวจนับ" : "ปรับสต็อก"}: ${item.availableQty} → ${newAvailable} บนชั้นวาง (รวม ${newTotal}, ถูกเบิก ${checkedOut}) (เหตุผล:${ADJUSTMENT_REASON_LABELS[reason] ?? reason})${countSuffix}`,
        changedBy: auth.user.userId,
      },
    });

    return adjustment;
  }).catch((e: Error) => {
    if (e.message === "NOT_FOUND") return null;
    if (e.message === "SAME_QTY") return "SAME_QTY";
    if (e.message === "TRACKED_NOT_ALLOWED") return "TRACKED_NOT_ALLOWED";
    if (e.message === "NOTES_REQUIRED") return "NOTES_REQUIRED";
    throw e;
  });

  if (result === null) return notFound("Item not found");
  if (result === "SAME_QTY") return error("Shelf count is the same as current available quantity");
  if (result === "TRACKED_NOT_ALLOWED") return error("รายการนับรายชิ้น ใช้การเปลี่ยนสถานะรายชิ้นแทน");
  if (result === "NOTES_REQUIRED") return error("นับได้เกินยอดระบบ ต้องระบุหมายเหตุ");

  return json(result, 201);
}
