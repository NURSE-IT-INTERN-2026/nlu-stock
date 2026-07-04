import type { Prisma } from "@/generated/prisma/client";
import { ItemStatus } from "@/generated/prisma/enums";

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
export function deriveStatusFromSubItems(statuses: ItemStatus[]): ItemStatus {
  if (statuses.length === 0) return ItemStatus.AVAILABLE;
  return statuses.reduce<ItemStatus>(
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
    const status = deriveNonTrackedStatus(
      item.category.profile.dispenseType,
      item.availableQty,
      item.totalQty,
    );
    if (status !== item.status) {
      await tx.item.update({ where: { id: itemId }, data: { status } });
    }
    return { availableQty: item.availableQty, totalQty: item.totalQty };
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
