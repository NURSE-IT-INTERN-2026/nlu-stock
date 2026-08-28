import type { Prisma } from "@/generated/prisma/client";
import { AdjustmentReason, ItemStatus } from "@/generated/prisma/enums";
import { isManualHold, WRITTEN_OFF } from "@/lib/status-utils";

type TxClient = Prisma.TransactionClient;

// Higher rank = wins when an item has sub-items in mixed states.
// "Needs attention" states beat "in use" states beat "available".
// DISPOSED top: once removed from inventory it shouldn't be masked by other states.
export const STATUS_PRIORITY: Record<ItemStatus, number> = {
  AVAILABLE: 1,
  IN_USE: 2,
  ON_LOAN: 3,
  PENDING_MAINTENANCE: 4,
  UNDER_REPAIR: 5,
  DAMAGED: 6,
  LOST: 7,
  DISPOSED: 8,
};

// Aggregate a tracked item's status from its sub-item statuses (highest priority wins).
// Empty sub-item set → AVAILABLE (item exists but has no trackable units yet).
// Written-off pieces (LOST/DISPOSED) are skipped unless every piece is written off —
// one lost copy out of ten must not make the whole item read as สูญหาย. Those pieces stay
// visible through the damaged/lost report and the item's ประวัติสูญหาย tab.
export function deriveStatusFromSubItems(statuses: ItemStatus[]): ItemStatus {
  if (statuses.length === 0) return ItemStatus.AVAILABLE;
  const live = statuses.filter((s) => !WRITTEN_OFF.has(s));
  return (live.length > 0 ? live : statuses).reduce<ItemStatus>(
    (best, s) => (STATUS_PRIORITY[s] > STATUS_PRIORITY[best] ? s : best),
    ItemStatus.AVAILABLE,
  );
}

// Aggregate status for a non-tracked item from its dispense type + quantities.
// COUNT (ยืม-คืน นับจำนวน): some units out on loan → ON_LOAN, all in stock → AVAILABLE.
// CONSUMABLE (ใช้แล้วทิ้ง): never "borrowed" — always AVAILABLE (depletion is not a status).
export function deriveNonTrackedStatus(
  dispenseType: "CONSUMABLE" | "COUNT" | "ITEM",
  availableQty: number,
  totalQty: number,
): ItemStatus {
  if (dispenseType === "COUNT" && availableQty < totalQty) return ItemStatus.ON_LOAN;
  return ItemStatus.AVAILABLE;
}

/**
 * Push a stock delta onto an item's lots.
 *
 * Staff count what is on the shelf, not what is in each lot — the count screen asks
 * for one number and this spreads it:
 *   delta < 0 → drain FEFO (nearest expiry first, undated last), clamped at 0 per lot
 *   delta > 0 → add to the most recently received lot (surplus is most likely from it)
 *
 * Returns false when the item has no lots — the caller then owns availableQty directly
 * (the lot-less consumable case, which is most of them). Callers that write availableQty
 * themselves MUST go through this first: recomputeItemCounts resyncs availableQty from
 * SUM(lots.remainingQty) once an item has lots, so a direct write would be wiped.
 */
export async function allocateAcrossLots(
  tx: TxClient,
  itemId: string,
  delta: number,
): Promise<boolean> {
  const lots = await tx.lot.findMany({
    where: { itemId },
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedDate: "asc" }],
    select: { id: true, remainingQty: true, receivedDate: true },
  });
  if (lots.length === 0) return false;
  if (delta === 0) return true;

  if (delta > 0) {
    const newest = lots.reduce((a, b) => (b.receivedDate > a.receivedDate ? b : a));
    await tx.lot.update({ where: { id: newest.id }, data: { remainingQty: { increment: delta } } });
    return true;
  }

  let left = -delta;
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(lot.remainingQty, left);
    if (take <= 0) continue;
    await tx.lot.update({ where: { id: lot.id }, data: { remainingQty: { decrement: take } } });
    left -= take;
  }
  // ponytail: a shortfall bigger than every lot combined means the caller's numbers were
  // stale; the lots are emptied and the leftover is dropped rather than going negative.
  return true;
}

/**
 * Recompute an item's availableQty/totalQty/status.
 *
 * Tracked items (trackIndividually): all three derive from sub-item statuses:
 *   availableQty = count(status = AVAILABLE)
 *   totalQty     = count(status != DISPOSED)   // DISPOSED = removed from inventory; LOST stays on the books
 *   status       = highest-priority sub-item status
 * Non-tracked items: status derives from dispense type + qty (see deriveNonTrackedStatus);
 *   availableQty/totalQty are managed by receive/dispense/return/adjust and left untouched here.
 * Must run inside the caller's $transaction so the recompute is atomic with the triggering write.
 */
export async function recomputeItemCounts(
  tx: TxClient,
  itemId: string,
): Promise<{ availableQty: number; totalQty: number }> {
  const item = await tx.item.findUnique({
    where: { id: itemId },
    select: {
      trackIndividually: true,
      availableQty: true,
      totalQty: true,
      status: true,
      category: { select: { profile: { select: { dispenseType: true } } } },
    },
  });
  if (!item) {
    return { availableQty: 0, totalQty: 0 };
  }

  if (!item.trackIndividually) {
    // Consumables that track lots: lots are the source of truth for what's
    // physically left, so keep the item's availableQty cache synced to
    // SUM(lots.remainingQty). Items WITHOUT lots manage availableQty directly
    // (receive/dispense/adjust) and must be left alone — resyncing would zero
    // their stock. See ADR-0002.
    let availableQty = item.availableQty;
    if (item.category.profile.dispenseType === "CONSUMABLE") {
      const lotSum = await tx.lot.aggregate({
        where: { itemId },
        _sum: { remainingQty: true },
        _count: true,
      });
      if (lotSum._count > 0) {
        availableQty = lotSum._sum.remainingQty ?? 0;
      }
    }
    // A status a staff member set by hand (ชำรุด/ส่งซ่อม/บำรุงรักษา/สูญหาย/ตัดจำหน่าย) sticks
    // until they clear it — a receive/dispense/adjust is not a reason to silently drop it.
    // CONSUMABLE is exempt: no lifecycle, always derived.
    const dispenseType = item.category.profile.dispenseType;
    const manual = dispenseType !== "CONSUMABLE" && isManualHold(item.status);
    const status = manual
      ? item.status
      : deriveNonTrackedStatus(dispenseType, availableQty, item.totalQty);
    if (availableQty !== item.availableQty || status !== item.status) {
      await tx.item.update({
        where: { id: itemId },
        data: {
          ...(availableQty !== item.availableQty ? { availableQty } : {}),
          ...(status !== item.status ? { status } : {}),
        },
      });
    }
    return { availableQty, totalQty: item.totalQty };
  }

  // Tracked: one query for all sub-item statuses, then derive counts + status in JS.
  const subs = await tx.subItem.findMany({ where: { itemId }, select: { status: true } });
  const availableQty = subs.filter((s) => s.status === ItemStatus.AVAILABLE).length;
  const totalQty = subs.filter((s) => s.status !== ItemStatus.DISPOSED).length;
  const status = deriveStatusFromSubItems(subs.map((s) => s.status));

  await tx.item.update({
    where: { id: itemId },
    data: {
      availableQty,
      totalQty,
      ...(status !== item.status ? { status } : {}),
    },
  });
  return { availableQty, totalQty };
}

// ── Damaged stock (non-tracked items) ──
// แจ้งชำรุด books a StockAdjustment with reason DAMAGED_PENDING_REPAIR that takes the qty
// out of availableQty. The two rules below decide what that means for the item's books, and
// they are stated here rather than at the call sites so the write path (api/.../adjust) and
// the read path (lib/distribution + the item detail response) cannot drift apart.

/**
 * Does an adjustment's qty stay counted in Item.totalQty?
 *
 * Only damage does. สูญหาย / ตัดจำหน่าย / a short count mean the units are gone from the
 * institution, so totalQty follows availableQty down. Damaged units are still owned and
 * still in the storeroom — the reason literally says PENDING_REPAIR — so they stay on the
 * books and reappear as the ชำรุด bucket until รับคืนจากซ่อม hands them back.
 */
export function holdsTotalQty(reason: AdjustmentReason): boolean {
  return reason === AdjustmentReason.DAMAGED_PENDING_REPAIR;
}

/**
 * How much is still broken: the damage bookings that nobody has recovered yet.
 *
 * Derived from the adjustment rows on purpose — no damagedQty column. A counter would be a
 * fourth running total to keep in sync (see lib/distribution.ts and AGENTS.md on
 * availableQty vs SUM(lots)); the open rows already are the answer, the way open loans are.
 * `previousQty - newQty` is the deduction, matching what the recover route hands back.
 */
export function damagedQtyOf(
  rows: { previousQty: number; newQty: number; recoveredAt: Date | null }[],
): number {
  return rows.reduce((sum, r) => (r.recoveredAt ? sum : sum + Math.max(0, r.previousQty - r.newQty)), 0);
}

/**
 * Close an open แจ้งชำรุด booking by putting its units back on the shelf.
 *
 * Two doors lead here — รับคืนจากส่งซ่อม (repaired) and ยกเลิกคำขอชำรุด (never broken) — and
 * they must move stock identically, so the arithmetic lives here rather than in either route.
 * `recoveredAt` is what takes the booking off the ชำรุด bucket (damagedQtyOf above), and it is
 * stamped inside the same transaction as the qty move so the two can never disagree.
 *
 * Caller must have checked the booking is open; `label` heads the audit adjustment row.
 */
export async function restoreDamagedQty(
  tx: TxClient,
  input: {
    adj: { id: string; itemId: string; lotId: string | null; previousQty: number; newQty: number; notes: string | null };
    /** Which door this is — it names the audit row so the history never has to read the note. */
    reason: typeof AdjustmentReason.REPAIR_RETURN | typeof AdjustmentReason.DAMAGE_CANCELLED;
    note?: string | null;
    userId: string;
  },
): Promise<{ qty: number; adjustmentId: string }> {
  const { adj, reason, note, userId } = input;
  const qty = adj.previousQty - adj.newQty;

  await tx.stockAdjustment.update({ where: { id: adj.id }, data: { recoveredAt: new Date() } });

  const before = await tx.item.findUniqueOrThrow({ where: { id: adj.itemId }, select: { availableQty: true } });
  if (adj.lotId) {
    // Booked against a specific lot — put it back there and let the recompute re-derive
    // availableQty from SUM(lots); incrementing the item directly would desync.
    await tx.lot.update({ where: { id: adj.lotId }, data: { remainingQty: { increment: qty } } });
  } else {
    // Item-level damage: land it on a lot when the item has any (otherwise the next recompute
    // resyncs availableQty from SUM(lots) and eats the recovery), else straight onto the item.
    const landed = await allocateAcrossLots(tx, adj.itemId, qty);
    if (!landed) await tx.item.update({ where: { id: adj.itemId }, data: { availableQty: { increment: qty } } });
  }

  // Returned to the caller so a repair job can point at the row that represents it in the
  // item timeline — see MaintenanceRecord.adjustmentId.
  const audit = await tx.stockAdjustment.create({
    data: {
      itemId: adj.itemId,
      delta: qty,
      previousQty: before.availableQty,
      newQty: before.availableQty + qty,
      reason,
      // No "รับคืนจากซ่อม" prefix here — `reason` says that now, and the history prints it as
      // the headline. The note carries only what a human typed: the original symptom, and
      // whatever was said while closing it.
      notes: [adj.notes, note].filter(Boolean).join(" — ") || null,
      adjustedBy: userId,
    },
  });

  await recomputeItemCounts(tx, adj.itemId);
  return { qty, adjustmentId: audit.id };
}
