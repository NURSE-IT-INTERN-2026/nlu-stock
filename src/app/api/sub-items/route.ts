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
          _count: { select: { subItems: true } },
        },
      },
      // UNDER_REPAIR: pull the DAMAGED → UNDER_REPAIR log so the card can show
      // venue (ภายใน/ภายนอก) + the repair note captured at send time.
      ...(includeRepairLog && {
        statusLogs: {
          where: { newStatus: ItemStatus.UNDER_REPAIR },
          orderBy: { changedAt: "desc" },
          take: 1,
          select: { repairVenue: true, reason: true, repairNote: true },
        },
      }),
    },
    orderBy: { updatedAt: "desc" },
  });

  // ponytail: conditional include widens the type — flatten the latest log into
  // repairVenue/repairNote on the row so the client type stays uniform.
  const subItemsOut = subItems.map((s) => {
    const log = (s as { statusLogs?: { repairVenue: string | null; reason: string | null; repairNote: string | null }[] }).statusLogs?.[0];
    return {
      ...s,
      repairVenue: log?.repairVenue ?? null,
      damageNote: log?.reason ?? null,
      repairNote: log?.repairNote ?? null,
    };
  });

  return NextResponse.json({ subItems: subItemsOut });
}
