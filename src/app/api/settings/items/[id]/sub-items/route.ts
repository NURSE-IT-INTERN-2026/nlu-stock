import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireAdmin, json, notFound, error, parseBody } from "@/lib/api-utils";
import { subItemCreateSchema, subItemBatchCreateSchema } from "@/lib/validators";
import { DEFAULT_LOCATION_ID } from "@/lib/default-location";
import { nextMaintenanceFromCycle } from "@/lib/maintenance";
import { lockItems, recomputeItemCounts } from "@/lib/stock";
import type { Prisma } from "@/generated/prisma/client";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const subItems = await prisma.subItem.findMany({
    where: { itemId: id },
    orderBy: { subCode: "asc" },
    include: {
      location: true,
      // อายุของ ในตารางชิ้นย่อย — นับจากใบรับเข้าของชิ้นนั้น (lib/format ageFromReceipt)
      receiveRecord: { select: { receivedAt: true } },
      dispenseRecords: {
        where: { returnedAt: null },
        orderBy: { dispensedAt: "desc" },
        take: 1,
        include: { staff: { select: { name: true } } },
      },
    },
  });

  return json(subItems);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return notFound("Item not found");
  if (!item.trackIndividually) return error("Item does not track individually");

  // Seed the piece's own location from its parent — but skip the seed fallback
  // (see default-location.ts): a parent whose only "location" is the default has
  // no real one to inherit, so the piece starts NULL instead of inheriting wrong.
  const seededLocationId =
    item.locationId && item.locationId !== DEFAULT_LOCATION_ID ? item.locationId : null;

  // A new copy joins the maintenance schedule immediately (source of truth = SubItem).
  // Baseline off the fleet's last service if any, else today, + the shared cycle.
  const seedNextMaintenance = nextMaintenanceFromCycle(
    item.lastMaintenanceDate ?? new Date(),
    item.maintenanceCycleMonths,
  );

  const body = await request.json();

  // Batch create mode
  if (body.prefix !== undefined) {
    const { data, error: parseErr } = await parseBody(subItemBatchCreateSchema)({
      json: () => Promise.resolve(body),
    } as Request);
    if (parseErr) return parseErr;
    if (!data) return error("No data");

    const subItems: Prisma.SubItemCreateManyInput[] = [];
    for (let i = data.startNumber; i <= data.endNumber; i++) {
      const numStr = String(i).padStart(String(data.endNumber).length, "0");
      subItems.push({ itemId: id, subCode: `${data.prefix}${numStr}`, name: item.name, locationId: seededLocationId, nextMaintenanceDate: seedNextMaintenance });
    }

    // A tracked item's availableQty/totalQty ARE the sub-item counts — writing pieces
    // without recomputing leaves the item reading 3 while 5 exist, and dispense/ยืมเอง
    // read those counters to decide what can go out.
    const created = await prisma.$transaction(async (tx) => {
      await lockItems(tx, [id]);
      const result = await tx.subItem.createMany({ data: subItems, skipDuplicates: true });
      await recomputeItemCounts(tx, id);
      return result.count;
    });

    return json({ created }, 201);
  }

  // Single create mode
  const { data, error: parseErr } = await parseBody(subItemCreateSchema)({
    json: () => Promise.resolve(body),
  } as Request);
  if (parseErr) return parseErr;
  if (!data) return error("No data");

  const subItem = await prisma.$transaction(async (tx) => {
    await lockItems(tx, [id]);
    const created = await tx.subItem.create({
      data: { ...data, itemId: id, locationId: seededLocationId, nextMaintenanceDate: seedNextMaintenance ?? undefined },
    });
    await recomputeItemCounts(tx, id);
    return created;
  });

  return json(subItem, 201);
}
