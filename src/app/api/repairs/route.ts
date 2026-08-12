import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-utils";
import { AdjustmentReason } from "@/generated/prisma/enums";

// The qty half of the รับคืนจากส่งซ่อม tab: every open แจ้งชำรุด booking on non-tracked stock,
// across all items. Tracked pieces come from /api/sub-items?status=UNDER_REPAIR instead —
// a qty item has no sub_items row to carry an UNDER_REPAIR status, so "still at the repair
// shop" lives on the StockAdjustment (reason DAMAGED_PENDING_REPAIR, recoveredAt null).
// This used to be fetched per-item inside GET /api/items/:id; the tab needs it cross-item.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const rows = await prisma.stockAdjustment.findMany({
    where: { reason: AdjustmentReason.DAMAGED_PENDING_REPAIR, recoveredAt: null },
    select: {
      id: true,
      previousQty: true,
      newQty: true,
      notes: true,
      adjustedAt: true,
      adjuster: { select: { name: true } },
      item: {
        select: {
          id: true,
          code: true,
          name: true,
          imageUrl: true,
          issueUnit: { select: { name: true } },
          location: true,
          // Lets the รับคืนจากส่งซ่อม form preview the next-round date the server will set.
          maintenanceCycleMonths: true,
        },
      },
    },
    orderBy: { adjustedAt: "desc" },
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      qty: r.previousQty - r.newQty,
      notes: r.notes,
      adjustedAt: r.adjustedAt.toISOString(),
      by: r.adjuster.name,
      item: r.item,
    })),
  });
}
