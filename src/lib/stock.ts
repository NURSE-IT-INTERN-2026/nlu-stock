import type { Prisma } from "@/generated/prisma/client";
import { ItemStatus } from "@/generated/prisma/enums";

type TxClient = Prisma.TransactionClient;

/**
 * Recompute an item's availableQty/totalQty from its SubItem statuses.
 * For tracked items (trackIndividually) the counts are derived:
 *   availableQty = count(status = AVAILABLE)
 *   totalQty     = count(status != DISPOSED)   // DISPOSED = removed from inventory; LOST stays on the books
 * Non-tracked items: no-op — their counts are managed by receive/dispense/return/adjust.
 * Must run inside the caller's $transaction so the recompute is atomic with the triggering write.
 */
export async function recomputeItemCounts(
  tx: TxClient,
  itemId: string,
): Promise<{ availableQty: number; totalQty: number }> {
  const item = await tx.item.findUnique({
    where: { id: itemId },
    select: { trackIndividually: true, availableQty: true, totalQty: true },
  });
  if (!item || !item.trackIndividually) {
    return { availableQty: item?.availableQty ?? 0, totalQty: item?.totalQty ?? 0 };
  }

  const availableQty = await tx.subItem.count({ where: { itemId, status: ItemStatus.AVAILABLE } });
  const totalQty = await tx.subItem.count({ where: { itemId, status: { not: ItemStatus.DISPOSED } } });

  await tx.item.update({ where: { id: itemId }, data: { availableQty, totalQty } });
  return { availableQty, totalQty };
}
