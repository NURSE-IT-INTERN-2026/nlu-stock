import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, error, forbidden, parseBody } from "@/lib/api-utils";
import { canManageStock } from "@/lib/roles";
import { locationLabel } from "@/lib/constants";
import { getItemDistribution } from "@/lib/distribution";
import { z } from "zod";
import { NextRequest } from "next/server";

// ponytail: only the fields this endpoint mutates — no blanket item update (settings PUT owns the rest).
const patchSchema = z.object({
  imageUrl: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
  locationId: z.string().nullable().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const item = await prisma.item.findFirst({
    where: { OR: [{ id }, { code: id }] },
    include: {
      category: { include: { profile: true } },
      location: true,
      issueUnit: true,
      subItems: { orderBy: { subCode: "asc" } },
      // receivedDate breaks the tie between date-coded lots, which carry no expiry.
      lots: { orderBy: [{ expiryDate: "asc" }, { receivedDate: "asc" }] },
      dispenseRecords: {
        take: 5,
        orderBy: { dispensedAt: "desc" },
        include: { staff: { select: { name: true } } },
      },
      receiveRecords: {
        take: 5,
        orderBy: { receivedAt: "desc" },
        include: { receiver: { select: { name: true } } },
      },
      maintenanceRecords: {
        take: 5,
        orderBy: { performedAt: "desc" },
        include: { performer: { select: { name: true } } },
      },
      statusLogs: {
        take: 5,
        orderBy: { changedAt: "desc" },
        include: { changer: { select: { name: true } } },
      },
      adjustments: {
        take: 5,
        orderBy: { adjustedAt: "desc" },
        include: { adjuster: { select: { name: true } } },
      },
      // ponytail: include ทุก row (ไม่ take) — kit BOM มักไม่กี่แถว, ต้องการ count + full list ใน detail
      kitComponents: {
        orderBy: { sortOrder: "asc" },
        include: {
          componentItem: { select: { code: true, name: true, availableQty: true } },
          unit: { select: { name: true } },
        },
      },
    },
  });

  if (!item) return notFound("Item not found");

  // Derived, not stored — see lib/distribution.ts. Folded into this response rather than
  // given its own endpoint so the detail page can't render a location breakdown that
  // disagrees with the counts printed beside it.
  const distribution = await getItemDistribution(item.id);

  // The individual แจ้งชำรุด bookings behind the ชำรุด row above, still awaiting repair.
  // รับคืนจากซ่อม resolves one booking at a time (it stamps recoveredAt on the row), so the
  // dialog needs the rows, not just the total — same reason the return screen lists loans.
  const openDamage = (
    await prisma.stockAdjustment.findMany({
      where: { itemId: item.id, reason: "DAMAGED_PENDING_REPAIR", recoveredAt: null },
      select: { id: true, previousQty: true, newQty: true, notes: true, adjustedAt: true, adjuster: { select: { name: true } } },
      orderBy: { adjustedAt: "desc" },
    })
  ).map((r) => ({ id: r.id, qty: r.previousQty - r.newQty, notes: r.notes, adjustedAt: r.adjustedAt, by: r.adjuster.name }));

  return json({ ...item, distribution, openDamage });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(patchSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");
  const { imageUrl, images, locationId } = data;

  // #1 location move is privileged — stock roles only (matches UI canMove).
  if (locationId !== undefined && !canManageStock(auth.user.role)) {
    return forbidden();
  }

  // Capture old location + validate target BEFORE update (#2 audit-after, #3 validate existence).
  let prev: { locationId: string | null; location: { building: string; floor: string; room: string; detail: string | null } | null } | null = null;
  let toLabel: string | null = null;
  if (locationId !== undefined) {
    const next = locationId || null;
    prev = await prisma.item.findUnique({ where: { id }, select: { locationId: true, location: true } });
    if (next) {
      const toLoc = await prisma.location.findUnique({ where: { id: next }, select: { building: true, floor: true, room: true, detail: true } });
      if (!toLoc) return error("สถานที่ไม่มีอยู่", 400);
      toLabel = locationLabel(toLoc);
    }
  }

  // Update first — invalid input can't reach here (validated above), so no orphan log on failure.
  const item = await prisma.item.update({
    where: { id },
    data: {
      ...(imageUrl === null ? { imageUrl: null } : imageUrl ? { imageUrl } : {}),
      ...(images !== undefined ? { images } : {}),
      ...(locationId !== undefined ? { locationId: locationId || null } : {}),
    },
  });

  // Audit AFTER successful update.
  if (locationId !== undefined && prev && prev.locationId !== (locationId || null)) {
    await prisma.locationChangeLog.create({
      data: {
        itemId: id,
        fromLabel: prev.location ? locationLabel(prev.location) : null,
        toLabel,
        changedBy: auth.user.userId,
      },
    });
  }

  return json(item);
}
