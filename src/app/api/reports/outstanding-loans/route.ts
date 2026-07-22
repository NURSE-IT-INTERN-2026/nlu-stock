import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";

// Borrowable items only — COUNT/ITEM dispense types. Consumables (ใช้แล้วทิ้ง) never "ยืมค้าง".
const BORROWABLE: Prisma.ItemWhereInput = {
  category: { profile: { dispenseType: { in: ["COUNT", "ITEM"] } } },
};

// Lists loans still outstanding (resolvedQty < quantity ⟺ returnedAt null, per schema invariant).
// No server pagination — the open-loan set is bounded by current borrows; client paginates over
// loan groups. ponytail: switch to 2-step server grouping if open loans ever reach thousands.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  try {
    const params = getSearchParams(request);
    const dateFrom = params.get("dateFrom") || undefined;
    const dateTo = params.get("dateTo") || undefined;
    const staffId = params.get("staffId") || undefined;

    const where: Prisma.DispenseRecordWhereInput = {
      returnedAt: null,
      item: BORROWABLE,
      // Exclude only per-unit (trackIndividually) INUSE — returned via คืนเข้าพัสดุ, not here.
      // COUNT-type INUSE returns numerically through this screen, so keep it visible.
      OR: [
        { loanType: null },
        { loanType: "BORROW" },
        { AND: [{ loanType: "INUSE" }, { item: { trackIndividually: false } }] },
      ],
      ...(staffId && { staffId }),
      ...((dateFrom || dateTo) && {
        dispensedAt: {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
        },
      }),
    };

    const records = await prisma.dispenseRecord.findMany({
      where,
      include: {
        item: { select: { code: true, name: true } },
        staff: { select: { name: true } },
      },
      orderBy: { dispensedAt: "desc" },
    });

    const data = records.map((r) => ({
      id: r.id,
      itemCode: r.item.code,
      itemName: r.item.name,
      quantity: r.quantity,
      resolvedQty: r.resolvedQty,
      staffName: r.staff.name,
      dispensedAt: r.dispensedAt.toISOString(),
      dueAt: r.dueAt?.toISOString() ?? null,
      recipient: r.recipient ?? null,
      loanGroupId: r.loanGroupId,
    }));

    return json({ records: data });
  } catch (err) {
    console.error("outstanding-loans error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
