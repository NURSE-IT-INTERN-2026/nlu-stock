import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-utils";
import { ItemStatus } from "@/generated/prisma/enums";

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

  const includeRepairLog = status === ItemStatus.UNDER_REPAIR;

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
          where: { newStatus: ItemStatus.UNDER_REPAIR },
          orderBy: { changedAt: "desc" },
          take: 10,
          select: { repairVenue: true, reason: true, repairNote: true, damageNote: true, changedAt: true, previousStatus: true },
        },
      }),
    },
    orderBy: { updatedAt: "desc" },
  });

  // ponytail: conditional include widens the type — flatten the latest log into
  // repairVenue/repairNote on the row so the client type stays uniform.
  const subItemsOut = subItems.map((s) => {
    const logs =
      (s as { statusLogs?: { repairVenue: string | null; reason: string | null; repairNote: string | null; damageNote: string | null; changedAt: Date; previousStatus: string | null }[] }).statusLogs ?? [];
    const log = logs[0];
    // The trip started at the newest log that came from another status; edits keep
    // previousStatus = UNDER_REPAIR, so they're skipped and the day count stays honest.
    const start = logs.find((l) => l.previousStatus !== ItemStatus.UNDER_REPAIR) ?? logs.at(-1);
    return {
      ...s,
      repairVenue: log?.repairVenue ?? null,
      // Venue/note track the newest edit. So does the symptom now that แก้ข้อมูลการส่งซ่อม can
      // correct it — newest non-null damageNote wins, falling back to the trip-opening row's
      // reason for trips recorded before the column existed. The send date always belongs to
      // the row that started the trip.
      damageNote: logs.find((l) => l.damageNote)?.damageNote ?? start?.reason ?? null,
      repairNote: log?.repairNote ?? null,
      repairSentAt: start?.changedAt.toISOString() ?? null,
    };
  });

  return NextResponse.json({ subItems: subItemsOut });
}
