import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-utils";
import { AdjustmentReason, ItemStatus } from "@/generated/prisma/enums";
import { deriveRepairTrip } from "@/lib/repairs";

// "เรื่องอะไรกำลังเกิดกับของชิ้นนี้" — the open repair jobs on one item, which the timeline below
// it cannot answer: a history is a pile of events, and reading three of them back into "ยังอยู่ที่
// ร้านตั้งแต่วันที่ 20" is work the reader should not have to do.
//
// A job is open in exactly the two places the worklist reads (see /api/repairs): a tracked piece
// sitting in DAMAGED/UNDER_REPAIR, and a แจ้งชำรุด booking on qty stock with recoveredAt null.
// Both are folded into one shape here, because to the person looking at the item they are the
// same sentence with a different subject.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const { id: itemId } = await params;
  const subItemId = req.nextUrl.searchParams.get("subItemId");

  const OPEN: ItemStatus[] = [ItemStatus.DAMAGED, ItemStatus.UNDER_REPAIR];

  const [pieces, bookings] = await Promise.all([
    prisma.subItem.findMany({
      where: { itemId, status: { in: OPEN }, ...(subItemId ? { id: subItemId } : {}) },
      select: {
        id: true,
        subCode: true,
        status: true,
        // ponytail: 10 rows = 9 แก้ข้อมูลส่งซ่อม edits in one trip; deeper falls back to the
        // oldest fetched row, same budget the worklist uses.
        statusLogs: {
          where: { newStatus: { in: OPEN } },
          orderBy: { changedAt: "desc" },
          take: 10,
          select: {
            previousStatus: true, newStatus: true, reason: true,
            repairVenue: true, repairNote: true, damageNote: true, changedAt: true,
            changer: { select: { name: true } },
          },
        },
      },
      orderBy: { subCode: "asc" },
    }),
    // A tracked item's stock never moves through StockAdjustment, so this half is empty for it —
    // and skipping the query on a piece view keeps the card about that one piece.
    subItemId
      ? Promise.resolve([])
      : prisma.stockAdjustment.findMany({
          where: { itemId, reason: AdjustmentReason.DAMAGED_PENDING_REPAIR, recoveredAt: null },
          select: {
            id: true, previousQty: true, newQty: true, notes: true, adjustedAt: true,
            repairSentAt: true, repairVenue: true, repairNote: true,
            adjuster: { select: { name: true } },
          },
          orderBy: { adjustedAt: "desc" },
        }),
  ]);

  const cases = [
    ...pieces.map((p) => {
      // Only the logs of the status the piece is in now describe the trip it is on now.
      const logs = p.statusLogs.filter((l) => l.newStatus === p.status);
      const trip = deriveRepairTrip(logs, p.status);
      return {
        kind: "PIECE" as const,
        id: p.id,
        stage: p.status as "DAMAGED" | "UNDER_REPAIR",
        subCode: p.subCode,
        qty: 1,
        damageNote: trip.damageNote,
        repairVenue: trip.repairVenue,
        repairNote: trip.repairNote,
        // On a piece the two dates are one date — the status it sits in says which one it is.
        reportedAt: trip.startedAt,
        repairSentAt: p.status === ItemStatus.UNDER_REPAIR ? trip.startedAt : null,
        by: logs.at(-1)?.changer.name ?? null,
      };
    }),
    ...bookings.map((b) => ({
      kind: "QTY" as const,
      id: b.id,
      stage: (b.repairSentAt ? "UNDER_REPAIR" : "DAMAGED") as "DAMAGED" | "UNDER_REPAIR",
      subCode: null,
      qty: b.previousQty - b.newQty,
      damageNote: b.notes,
      repairVenue: b.repairVenue,
      repairNote: b.repairNote,
      reportedAt: b.adjustedAt.toISOString(),
      repairSentAt: b.repairSentAt?.toISOString() ?? null,
      by: b.adjuster.name,
    })),
  ]
    // รอส่งซ่อม first — the half nobody has started yet — then newest trip first inside each.
    .sort((a, b) =>
      (a.stage === b.stage ? 0 : a.stage === "DAMAGED" ? -1 : 1) ||
      (b.repairSentAt ?? b.reportedAt ?? "").localeCompare(a.repairSentAt ?? a.reportedAt ?? ""),
    );

  return NextResponse.json({ cases });
}
