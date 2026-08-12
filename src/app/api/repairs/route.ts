import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth, requireSuperAdmin, handleError } from "@/lib/api-utils";
import { restoreDamagedQty } from "@/lib/stock";
import { AdjustmentReason, RepairVenue } from "@/generated/prisma/enums";

// The qty half of the repair lifecycle. A tracked piece walks ชำรุด → ส่งซ่อม → รับคืน on
// sub_items.status; non-tracked stock has no row there, so its แจ้งชำรุด booking (a
// StockAdjustment, reason DAMAGED_PENDING_REPAIR, recoveredAt null) carries the same three
// stages on its own columns:
//
//   stage=damaged → repairSentAt null  → ชำรุด รอส่งซ่อม   (/alerts worklist)
//   stage=repair  → repairSentAt set   → อยู่ระหว่างซ่อม    (รับคืนจากส่งซ่อม tab)
//
// GET lists one stage; POST is the ส่งซ่อม step (and later edits to it). รับคืน closes the
// booking through POST /api/items/:id/maintenance with an `adjustmentId`, so the result and
// cost land in maintenance_records exactly like a piece's do.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const stage = req.nextUrl.searchParams.get("stage") === "damaged" ? "damaged" : "repair";

  const rows = await prisma.stockAdjustment.findMany({
    where: {
      reason: AdjustmentReason.DAMAGED_PENDING_REPAIR,
      recoveredAt: null,
      repairSentAt: stage === "damaged" ? null : { not: null },
    },
    select: {
      id: true,
      previousQty: true,
      newQty: true,
      notes: true,
      adjustedAt: true,
      repairSentAt: true,
      repairVenue: true,
      repairNote: true,
      imageEvidence: true,
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
    // Newest first on whichever date the stage is about.
    orderBy: stage === "damaged" ? { adjustedAt: "desc" } : { repairSentAt: "desc" },
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      qty: r.previousQty - r.newQty,
      notes: r.notes,
      adjustedAt: r.adjustedAt.toISOString(),
      repairSentAt: r.repairSentAt?.toISOString() ?? null,
      repairVenue: r.repairVenue,
      repairNote: r.repairNote,
      imageEvidence: r.imageEvidence,
      by: r.adjuster.name,
      item: r.item,
    })),
  });
}

// ส่งซ่อม: hand a damage booking to the repair shop, or correct the details of a trip already
// under way (ซ่อมภายในไม่ได้ → ส่งต่อภายนอก). Both are the same write — the trip's start date is
// stamped once and never moved, so "how long has this been out" stays honest across edits.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.denied) return auth.denied;

  const body = await req.json();
  const adjustmentId = body?.adjustmentId as string | undefined;
  const venue = body?.venue as string | undefined;
  const repairNote = (body?.repairNote as string | undefined)?.trim() || null;
  const damageNote = (body?.damageNote as string | undefined)?.trim() || null;

  if (!adjustmentId || !venue || !Object.keys(RepairVenue).includes(venue) || !repairNote) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  try {
    const adj = await prisma.stockAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!adj || adj.reason !== AdjustmentReason.DAMAGED_PENDING_REPAIR) {
      return NextResponse.json({ error: "ไม่พบรายการชำรุด" }, { status: 404 });
    }
    if (adj.recoveredAt) return NextResponse.json({ error: "รายการนี้ปิดไปแล้ว" }, { status: 409 });

    const updated = await prisma.stockAdjustment.update({
      where: { id: adjustmentId },
      data: {
        repairVenue: venue as RepairVenue,
        repairNote,
        // The symptom is editable: the first แจ้งชำรุด is usually written before anyone has
        // looked at the thing properly. Blank leaves what's on record.
        ...(damageNote ? { notes: damageNote } : {}),
        // Stamped once — an edit is still the same trip.
        ...(adj.repairSentAt ? {} : { repairSentAt: new Date() }),
      },
    });

    return NextResponse.json({ ok: true, repairSentAt: updated.repairSentAt });
  } catch (err) {
    return handleError(err, "ส่งซ่อมไม่สำเร็จ");
  }
}
