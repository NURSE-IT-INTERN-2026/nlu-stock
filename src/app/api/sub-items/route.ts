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

  const subItems = await prisma.subItem.findMany({
    where: { status },
    include: {
      item: {
        select: {
          id: true,
          code: true,
          name: true,
          imageUrl: true,
          issueUnit: { select: { name: true } },
          category: { select: { name: true, profile: { select: { dispenseType: true } } } },
          location: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ subItems });
}
