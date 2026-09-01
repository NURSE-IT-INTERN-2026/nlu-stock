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

// The one same-status log that IS a duplicate: api/items/[id]/adjust writes it beside the
// StockAdjustment that already prints the very same numbers. Matched on the reason it writes
// there ("ปรับสต็อก: 71 → 76 บนชั้นวาง …") because nothing on the row distinguishes it — and
// deliberately NOT on "ตรวจนับ: ตรงยอด …" / "ยืนยันพร้อมใช้งาน …", which have no adjustment
// row of their own and would vanish from the history entirely.
//
// The lot forms carry the lot number between the verb and the numbers ("แก้ยอด Lot L-001:
// 5 → 3"), so a pattern anchored straight to the colon missed them and printed every lot
// correction twice. What decides is the "A → B" that the adjustment row already shows, not
// which of the three verbs wrote it — "ตรงยอด" has no such pair and stays visible.
const ADJUST_MIRROR_REASON = /^(ปรับสต็อก|ตรวจนับ|แก้ยอด)( Lot .+)?: \d+ → \d+/;

// Statuses that end a "loan edge" without a เบิก/รับคืน row standing in for it, so the status
// log is the only record and must survive the duplicate test.
//   DISPOSED — ยกเลิกชุด retires a KIT set and hands its pieces back, closing each one's
//              นำไปใช้งาน record; those ReturnRecords only say the pieces came home.
//   PENDING_MAINTENANCE — ส่งบำรุงรักษาภายนอก on a non-tracked item. Its status is ON_LOAN
//              whenever ANY of its units are out (which is most of the time — lib/status-utils
//              isManualHold), so the send reads as a loan edge and was being swallowed whole:
//              ประวัติ showed the piece coming back from a trip it never recorded leaving on.
const KEPT_LOAN_EDGE: ReadonlySet<ItemStatus> = new Set([
  ItemStatus.DISPOSED,
  ItemStatus.PENDING_MAINTENANCE,
]);

/**
 * Whether an item's ประวัติ should drop this status log as a duplicate.
 * Edges landing on KEPT_LOAN_EDGE above are kept whatever they came from.
 *
 * A same-status row is judged on its reason, not on the loan test: it is an annotation, not a
 * transition, so no เบิก/รับคืน row was ever written in its place. Qty stock stamps its
 * ส่งซ่อม / แก้ข้อมูลส่งซ่อม / ยกเลิกคำขอชำรุด onto exactly this shape (the item's own status,
 * unchanged — 10 of 40 units at the shop does not move the item), and while the loan test ran
 * on those rows every one of them was swallowed on any item that happened to be ON_LOAN.
 */
export function isDuplicateOfLoanRow(log: { previousStatus: ItemStatus; newStatus: ItemStatus; reason?: string | null }): boolean {
  if (log.previousStatus === log.newStatus) return ADJUST_MIRROR_REASON.test(log.reason ?? "");
  return isLoanEdge(log) && !KEPT_LOAN_EDGE.has(log.newStatus);
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
) {
  return tx.returnRecord.create({
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
      // ชำรุด parks the note in damageNote below, so repeating it here would print it twice
      // wherever a reader shows both (the case timeline joins them). สูญหาย has no such column.
      : `คืนพร้อมระบุ: ${REASON_LABEL[status]}${note && status !== "DAMAGED" ? ` (${note})` : ""}`;

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

  // Written before the status log so that log can point at it. A ชำรุด return opens a repair
  // case on the spot, and fromReturnId is the only thing that says which loan it came out of.
  const ret = await logReturn(tx, {
    itemId,
    subItemId,
    dispenseRecordId: dispense?.id ?? null,
    quantity: 1, // one tracked piece per return
    condition: status,
    notes: note,
    userId,
  });

  await tx.subItem.update({ where: { id: subItemId }, data: { status: newStatus } });
  await tx.itemStatusLog.create({
    data: {
      itemId,
      subItemId,
      previousStatus: ItemStatus.ON_LOAN,
      newStatus,
      reason,
      changedBy: userId,
      // The symptom in its own column, not only wrapped in `reason`: the ค้างซ่อม worklist and
      // แก้ข้อมูลส่งซ่อม read damageNote, and a piece that arrived broken from a loan is the
      // same job as one reported broken on the shelf.
      ...(status === "DAMAGED" && note ? { damageNote: note } : {}),
      // The return photo is หลักฐาน for the job this row opens, not just for the loan it closes:
      // ส่งซ่อม reads it off this row. It stays on the DispenseRecord too — that copy answers
      // "what condition did this loan come back in", a different question with a different reader.
      ...(status !== "AVAILABLE" && proofUrls?.length ? { imageUrls: proofUrls } : {}),
      ...(status === "AVAILABLE" ? {} : { fromReturnId: ret.id }),
    },
  });
}
