import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, json, notFound, error } from "@/lib/api-utils";
import { isSelfBorrower } from "@/lib/roles";
import { NextRequest } from "next/server";

// GET /api/items/:id/sub-items/:subId — single sub-item with parent context + history.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const { id: itemIdRef, subId } = await params;
  const borrower = isSelfBorrower(auth.user.role);

  // Resolve parent item by id OR code (so URLs can be human-readable codes).
  const parent = await prisma.item.findFirst({
    where: { OR: [{ id: itemIdRef }, { code: itemIdRef }] },
    select: { id: true },
  });
  if (!parent) return notFound("Item not found");

  const sub = await prisma.subItem.findFirst({
    where: { OR: [{ id: subId }, { subCode: subId }], itemId: parent.id },
    include: {
      location: true,
      item: {
        select: {
          id: true,
          code: true,
          name: true,
          nameEn: true,
          trackIndividually: true,
          imageUrl: true,
          maintenanceCycleMonths: true,
          lastMaintenanceDate: true,
          nextMaintenanceDate: true,
          category: { select: { id: true, name: true, profile: { select: { name: true, dispenseType: true, assetTracking: true } } } },
          location: true,
          issueUnit: { select: { id: true, name: true } },
        },
      },
      // The three per-copy histories, every one of them naming a person — and unlike the item
      // route these are not even capped at 5, so this is the widest view of "who had this".
      // A borrower gets none: the copy's own status still says ถูกยืม, which is all they need
      // to know whether they can take it. Same rule as GET /api/items/:id.
      ...(borrower
        ? {}
        : {
            dispenseRecords: {
              orderBy: { dispensedAt: "desc" as const },
              include: { staff: { select: { name: true } } },
            },
            statusLogs: {
              orderBy: { changedAt: "desc" as const },
              include: { changer: { select: { name: true } } },
            },
            maintenanceRecords: {
              orderBy: { performedAt: "desc" as const },
              include: { performer: { select: { name: true } } },
            },
          }),
    },
  });

  if (!sub) return notFound("Sub-item not found");
  // Keys the piece page indexes into without guarding (sub.maintenanceRecords.filter,
  // sub.dispenseRecords.find) — empty, never missing.
  if (borrower) {
    return json({ ...sub, dispenseRecords: [], statusLogs: [], maintenanceRecords: [] });
  }
  return json(sub);
}

// PUT — move a sub-item to its own location (STAFF+). body: { locationId: string | null }.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id: itemIdRef, subId } = await params;
  const body = await request.json().catch(() => ({}));

  // Partial update — only fields present in the body are written. `locationId`
  // stays the move path (null = clear); serial/condition/notes/imageUrl/images
  // added so STAFF can edit sub-item details + media without the admin-only route.
  const data: Record<string, unknown> = {};
  if (body?.locationId !== undefined) data.locationId = body.locationId === null ? null : String(body.locationId);
  if (body?.serialNumber !== undefined) data.serialNumber = body.serialNumber === null ? null : String(body.serialNumber);
  if (body?.notes !== undefined) data.notes = body.notes === null ? null : String(body.notes);
  if (body?.imageUrl !== undefined) data.imageUrl = body.imageUrl === null ? null : String(body.imageUrl);
  if (body?.condition !== undefined) {
    if (body.condition === null) data.condition = null;
    else if (VALID_CONDITIONS.has(body.condition)) data.condition = body.condition;
    else return error("Invalid condition");
  }
  if (body?.images !== undefined) {
    if (!Array.isArray(body.images)) return error("Invalid images");
    data.images = body.images.map(String);
  }
  if (Object.keys(data).length === 0) return error("No fields to update");

  const parent = await prisma.item.findFirst({ where: { OR: [{ id: itemIdRef }, { code: itemIdRef }] }, select: { id: true } });
  if (!parent) return notFound("Item not found");
  const sub = await prisma.subItem.findFirst({ where: { OR: [{ id: subId }, { subCode: subId }], itemId: parent.id }, select: { id: true } });
  if (!sub) return notFound("Sub-item not found");

  const updated = await prisma.subItem.update({ where: { id: sub.id }, data, include: { location: true } });
  return json(updated);
}

const VALID_CONDITIONS = new Set(["GOOD", "FAIR", "DAMAGED"]);
