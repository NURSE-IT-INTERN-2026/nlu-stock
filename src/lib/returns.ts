import type { Prisma } from "@/generated/prisma/client";
import { ItemStatus } from "@/generated/prisma/enums";

type TxClient = Prisma.TransactionClient;

// A return can only land on these three. ส่งซ่อม is NOT one of them: sending a damaged piece
// for repair is a separate step that records ภายใน/ภายนอก, so a return stops at ชำรุด.
export type ReturnStatus = "AVAILABLE" | "DAMAGED" | "LOST";

const REASON_LABEL: Record<Exclude<ReturnStatus, "AVAILABLE">, string> = {
  DAMAGED: "ชำรุด",
  LOST: "สูญหาย",
};

const LOANED: ReadonlySet<ItemStatus> = new Set([ItemStatus.ON_LOAN, ItemStatus.IN_USE]);

/**
 * True when a status log only restates a loan edge that the เบิก/รับคืน rows already own:
 * entering ON_LOAN/IN_USE is written by api/dispense beside a DispenseRecord, and leaving it
 * is written beside a ReturnRecord by every path that closes a loan (see logReturn below).
 * An item's ประวัติ drops these rows so one event is not printed twice — which holds only
 * while api/dispense stays the sole writer that moves a piece INTO a loaned status.
 */
export function isLoanEdge(log: { previousStatus: ItemStatus; newStatus: ItemStatus }): boolean {
  return LOANED.has(log.previousStatus) || LOANED.has(log.newStatus);
}

/**
 * The รับคืน row for one act of returning stock. Every path that closes a loan writes one,
 * which is what lets the history hide the ON_LOAN → X status log as a duplicate: the return
 * row is guaranteed to be there instead.
 */
async function logReturn(
  tx: TxClient,
  row: {
    itemId: string;
    subItemId?: string | null;
    dispenseRecordId?: string | null;
    quantity: number;
    condition: ReturnStatus;
    notes?: string | null;
    userId: string;
  },
): Promise<void> {
  await tx.returnRecord.create({
    data: {
      itemId: row.itemId,
      subItemId: row.subItemId ?? null,
      dispenseRecordId: row.dispenseRecordId ?? null,
      quantity: row.quantity,
      condition: row.condition,
      notes: row.notes ?? null,
      returnedBy: row.userId,
    },
  });
}

export { logReturn };

/**
 * The `locationId` patch for a piece changing status. Only a piece LEAVING IN_USE gets one:
 * นำไปใช้งาน is the one action that writes a destination onto SubItem.locationId, so it is
 * the one that has to be undone. Leaving ON_LOAN patches nothing — a borrow never moved the
 * piece's registered room in the first place.
 *
 * `dest` is where the piece ends up (คืนเข้าคลัง lets staff pick). Omit it and the piece
 * falls back to its spec's location, which is the right default for the paths with no
 * picker at all (bulk adjust, แจ้งชำรุด on a stationed piece).
 *
 * Writing null rather than copying the spec's own id is deliberate: null means "wherever
 * the spec lives", which is how the whole app reads a piece's room
 * (`sub.location ?? sub.item.location`) and what 1130 of 1132 sub-items hold. Copying the
 * id would freeze the piece in place the next time an admin moves the spec.
 */
export function returnLocationUpdate(opts: {
  previousStatus: ItemStatus;
  newStatus: ItemStatus;
  dest?: string | null;
  itemLocationId: string | null;
}): { locationId?: string | null } {
  const { previousStatus, newStatus, dest, itemLocationId } = opts;
  if (previousStatus !== ItemStatus.IN_USE || newStatus === ItemStatus.IN_USE) return {};
  return { locationId: dest && dest !== itemLocationId ? dest : null };
}

/**
 * Close the open DispenseRecord of a SubItem that just left ON_LOAN/IN_USE through a screen
 * other than รับคืน (status change, bulk adjust, maintenance result). Without this the loan
 * keeps returnedAt = null and lingers on รับคืน / รายการยืมค้าง as a phantom — the piece is
 * back on the shelf but the system still says it is out.
 * No-op when the piece wasn't out, or when nothing is open for it.
 */
export async function closeOpenLoan(
  tx: TxClient,
  opts: { itemId: string; subItemId: string; previousStatus: ItemStatus; newStatus: ItemStatus; userId: string },
): Promise<void> {
  const { itemId, subItemId, previousStatus, newStatus, userId } = opts;
  if (!LOANED.has(previousStatus) || LOANED.has(newStatus)) return;

  const open = await tx.dispenseRecord.findFirst({
    where: { itemId, subItemId, returnedAt: null },
    orderBy: { dispensedAt: "desc" },
  });
  if (!open) return;

  // DISPOSED/UNDER_REPAIR have no ReturnCondition of their own — the loan still ends, and
  // the ItemStatusLog row the caller writes carries the real reason.
  const condition = (["AVAILABLE", "DAMAGED", "LOST"] as const).find((c) => c === newStatus);
  await tx.dispenseRecord.update({
    where: { id: open.id },
    data: {
      resolvedQty: open.quantity,
      returnedAt: new Date(),
      ...(condition ? { returnCondition: condition } : {}),
    },
  });

  await logReturn(tx, {
    itemId,
    subItemId,
    dispenseRecordId: open.id,
    quantity: Math.max(open.quantity - open.resolvedQty, 1),
    condition: condition ?? "AVAILABLE",
    notes: `ปิดรายการยืมอัตโนมัติ (${newStatus})`,
    userId,
  });
}

/**
 * Resolve a per-unit (ITEM-type) return for one SubItem inside the caller's
 * $transaction: validate it's on loan, flip status, log the status change, and
 * resolve its open DispenseRecord (resolvedQty + returnedAt).
 * Caller runs recomputeItemCounts once per affected item after all entries.
 */
export async function resolveSubItemReturn(
  tx: TxClient,
  opts: {
    itemId: string;
    subItemId: string;
    status: ReturnStatus;
    note: string | null;
    userId: string;
    dispenseRecordId?: string;
    proofUrls?: string[];
  },
): Promise<void> {
  const { itemId, subItemId, status, note, userId, dispenseRecordId, proofUrls } = opts;

  const sub = await tx.subItem.findUnique({ where: { id: subItemId } });
  if (!sub) throw new Error("Sub-item not found");
  if (sub.status !== ItemStatus.ON_LOAN) {
    throw new Error(`Sub-item is not on loan (status: ${sub.status})`);
  }

  const newStatus = status as ItemStatus;
  const reason =
    status === "AVAILABLE"
      ? note ? `คืนเข้าสู่ระบบ (${note})` : "คืนเข้าสู่ระบบ"
      : `คืนพร้อมระบุ: ${REASON_LABEL[status]}${note ? ` (${note})` : ""}`;

  await tx.subItem.update({ where: { id: subItemId }, data: { status: newStatus } });
  await tx.itemStatusLog.create({
    data: {
      itemId,
      subItemId,
      previousStatus: ItemStatus.ON_LOAN,
      newStatus,
      reason,
      changedBy: userId,
    },
  });

  const dispense = await tx.dispenseRecord.findFirst({
    where: {
      ...(dispenseRecordId ? { id: dispenseRecordId } : {}),
      itemId,
      subItemId,
      returnedAt: null,
    },
    orderBy: { dispensedAt: "desc" },
  });
  if (dispense) {
    await tx.dispenseRecord.update({
      where: { id: dispense.id },
      data: {
        resolvedQty: dispense.quantity,
        returnedAt: new Date(),
        returnCondition: status,
        ...(proofUrls && proofUrls.length > 0 ? { returnProofUrls: proofUrls } : {}),
      },
    });
  }

  await logReturn(tx, {
    itemId,
    subItemId,
    dispenseRecordId: dispense?.id ?? null,
    quantity: 1, // one tracked piece per return
    condition: status,
    notes: note,
    userId,
  });
}
