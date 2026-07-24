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
}
