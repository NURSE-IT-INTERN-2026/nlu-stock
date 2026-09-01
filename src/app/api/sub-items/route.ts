import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-utils";
import { ItemStatus } from "@/generated/prisma/enums";
import { deriveRepairTrip } from "@/lib/repairs";

// Lists per-unit sub-items by status — used by the คืนเข้าพัสดุ (IN_USE), รับซ่อม (UNDER_REPAIR),
// and แจ้งชำรุด (DAMAGED) tabs. ON_LOAN borrows are handled separately via /api/returns (DispenseRecord-based).
const ALLOWED: ItemStatus[] = [ItemStatus.IN_USE, ItemStatus.UNDER_REPAIR, ItemStatus.DAMAGED];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const status = req.nextUrl.searchParams.get("status") as ItemStatus | null;
  if (!status || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Both open repair stages read their trip out of the log: UNDER_REPAIR for venue/note/sent-at,
  // DAMAGED for the one thing the ค้างซ่อม worklist has to show — why the piece was reported
  // broken. sub_items has no column for it; only the แจ้งชำรุด log row does.
  const includeRepairLog = status === ItemStatus.UNDER_REPAIR || status === ItemStatus.DAMAGED;

  const subItems = await prisma.subItem.findMany({
    where: { status },
    include: {
      location: true,
      item: {
        select: {
          id: true,
          code: true,
          name: true,
          imageUrl: true,
          issueUnit: { select: { name: true } },
          category: { select: { name: true, profile: { select: { dispenseType: true } } } },
          location: true,
          // Lets the รับคืนจากส่งซ่อม form preview the next-round date the server will set.
          maintenanceCycleMonths: true,
          _count: { select: { subItems: true } },
        },
      },
      // UNDER_REPAIR: pull the UNDER_REPAIR logs so the card can show venue (ภายใน/ภายนอก),
      // the repair note, and when the piece was sent. แก้ข้อมูลส่งซ่อม appends an
      // UNDER_REPAIR → UNDER_REPAIR row per edit, so the newest row holds the current
      // venue/note but NOT the send date — that's the row that started the trip.
      // ponytail: 10 rows = 9 edits in one trip; deeper falls back to the oldest fetched row.
      ...(includeRepairLog && {
        statusLogs: {
          where: { newStatus: status },
          orderBy: { changedAt: "desc" },
          take: 10,
          select: { id: true, repairVenue: true, reason: true, repairNote: true, damageNote: true, changedAt: true, previousStatus: true, imageUrls: true },
        },
      }),
    },
    orderBy: { updatedAt: "desc" },
  });

  // ponytail: conditional include widens the type — flatten the trip into
  // repairVenue/repairNote/repairSentAt on the row so the client type stays uniform.
  // The folding rules live in lib/repairs, shared with the item's active-case card.
  const subItemsOut = subItems.map((s) => {
    const logs =
      (s as { statusLogs?: Parameters<typeof deriveRepairTrip>[0] }).statusLogs ?? [];
    const trip = deriveRepairTrip(logs, status);
    return {
      ...s,
      repairVenue: trip.repairVenue,
      damageNote: trip.damageNote,
      repairNote: trip.repairNote,
      repairSentAt: trip.startedAt,
      evidenceLogId: trip.openerId,
      evidenceUrls: trip.imageUrls,
    };
  });

  return NextResponse.json({ subItems: subItemsOut });
}
