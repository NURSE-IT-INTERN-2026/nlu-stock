import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound } from "@/lib/api-utils";
import { NextRequest } from "next/server";

// GET /api/items/:id/sub-items/:subId — single sub-item with parent context + history.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const { id: itemIdRef, subId } = await params;

  // Resolve parent item by id OR code (so URLs can be human-readable codes).
  const parent = await prisma.item.findFirst({
    where: { OR: [{ id: itemIdRef }, { code: itemIdRef }] },
    select: { id: true },
  });
  if (!parent) return notFound("Item not found");

  const sub = await prisma.subItem.findFirst({
    where: { OR: [{ id: subId }, { subCode: subId }], itemId: parent.id },
    include: {
      item: {
        select: {
          id: true,
          code: true,
          name: true,
          nameEn: true,
          trackIndividually: true,
          category: { select: { id: true, name: true, profile: { select: { name: true } } } },
          location: true,
          issueUnit: { select: { id: true, name: true } },
        },
      },
      dispenseRecords: {
        orderBy: { dispensedAt: "desc" },
        include: { staff: { select: { name: true } } },
      },
      statusLogs: {
        orderBy: { changedAt: "desc" },
        include: { changer: { select: { name: true } } },
      },
      maintenanceRecords: {
        orderBy: { performedAt: "desc" },
        include: { performer: { select: { name: true } } },
      },
    },
  });

  if (!sub) return notFound("Sub-item not found");
  return json(sub);
}
