import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { RETURN_CONDITION_LABELS } from "@/lib/constants";
import { NextRequest } from "next/server";

/**
 * ประวัติการคืนของใบเบิกหนึ่งใบ — fetched lazily when the detail dialog opens.
 *
 * `key` is the same identity the ออกจากคลัง list pages by: COALESCE(loanGroupId, id). One
 * borrow event is several DispenseRecord rows sharing a loanGroupId; a consumable draw with
 * no group is its own key of one.
 *
 * Only the returns live here. The item lines are already in the list's page payload, so
 * re-fetching them would send the same rows twice for no reader.
 *
 * เบิกใช้ never returns anything, so this legitimately answers with an empty list — the
 * dialog still renders a timeline, headed by the จ่ายออก event it builds from the row itself.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const { key } = await params;

  // Both arms of the key: rows grouped under it, and the lone row that IS it.
  const records = await prisma.dispenseRecord.findMany({
    where: { OR: [{ loanGroupId: key }, { loanGroupId: null, id: key }] },
    select: { id: true },
  });
  if (records.length === 0) return json({ returns: [] });

  // ponytail: no index on ReturnRecord.dispenseRecordId — a seq scan on a table that only
  // grows when something is handed back. Add @@index([dispenseRecordId]) if returns outgrow it.
  const returns = await prisma.returnRecord.findMany({
    where: { dispenseRecordId: { in: records.map((r) => r.id) } },
    include: {
      item: { select: { name: true } },
      subItem: { select: { subCode: true } },
      returner: { select: { name: true } },
    },
    orderBy: { returnedAt: "asc" },
  });

  return json({
    returns: returns.map((r) => ({
      id: r.id,
      itemName: r.item.name,
      subCode: r.subItem?.subCode ?? null,
      quantity: r.quantity,
      conditionLabel: RETURN_CONDITION_LABELS[r.condition] ?? r.condition,
      condition: r.condition,
      notes: r.notes ?? "",
      returnerName: r.returner.name,
      returnedAt: r.returnedAt.toISOString(),
    })),
  });
}
