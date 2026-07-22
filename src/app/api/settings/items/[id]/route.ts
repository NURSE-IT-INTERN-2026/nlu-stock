import { prisma } from "@/lib/prisma";
import { requireAdmin, requireStaff, json, notFound, error, parseBody } from "@/lib/api-utils";
import { itemUpdateSchema } from "@/lib/validators";
import { sanitizeItemByProfile, isItemTracked } from "@/lib/category-profile";
import { nextMaintenanceFromCycle } from "@/lib/maintenance";
import { countCycleFor, nextCountFrom } from "@/lib/stock-count";
import type { DispenseType } from "@/generated/prisma/enums";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      category: true,
      location: true,
      issueUnit: true,
      subItems: { orderBy: { subCode: "asc" } },
      lots: { orderBy: [{ expiryDate: "asc" }, { receivedDate: "asc" }] },
      _count: { select: { subItems: true, dispenseRecords: true, receiveRecords: true } },
    },
  });

  if (!item) return notFound("Item not found");

  return json(item);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(itemUpdateSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  if (data.code) {
    const existing = await prisma.item.findFirst({ where: { code: data.code, NOT: { id } } });
    if (existing) return error("Item code already exists");
  }

  // Enforce profile rules: trackIndividually + flag-gated fields (D4).
  const catId = data.categoryId ?? (await prisma.item.findUnique({ where: { id }, select: { categoryId: true } }))?.categoryId;
  let dispenseType: DispenseType | undefined;
  if (catId) {
    const cat = await prisma.categoryType.findUnique({ where: { id: catId }, include: { profile: true } });
    if (cat?.profile) {
      dispenseType = cat.profile.dispenseType;
      data.trackIndividually = isItemTracked(cat.profile);
      sanitizeItemByProfile(cat.profile, data);
    }
  }
  // Borrow allowance is admin-only; borrowable is derived from the quantity — set
  // after sanitize so it wins over the setTracking-only rule (any category may
  // now have a borrow limit).
  if (auth.user.role !== "ADMIN") delete data.borrowLimit;
  if (data.borrowLimit !== undefined) data.borrowable = data.borrowLimit > 0;

  // Recalc nextMaintenanceDate when the maintenance cycle changes, so overdue/
  // due-soon alerts follow the new cadence immediately — not only after the
  // next maintenance record. Baseline = last performed maintenance; no baseline
  // (never maintained) → leave nextMaintenanceDate untouched (still null).
  // ponytail: extra read on the rare admin update path is fine; no cron exists.
  let recalcNext: Date | undefined;
  if (data.maintenanceCycleMonths !== undefined) {
    const cur = await prisma.item.findUnique({
      where: { id },
      select: { maintenanceCycleMonths: true, lastMaintenanceDate: true },
    });
    if (cur && cur.maintenanceCycleMonths !== data.maintenanceCycleMonths) {
      const next = nextMaintenanceFromCycle(cur.lastMaintenanceDate, data.maintenanceCycleMonths);
      if (next) recalcNext = next;
    }
  }

  // Same idea for the stock-count cadence: a changed cycle re-dates the next count
  // from the last one performed. Never counted → nothing to re-date (still due now).
  let recalcNextCount: Date | undefined;
  if (data.countCycleMonths !== undefined && dispenseType) {
    const cur = await prisma.item.findUnique({
      where: { id },
      select: { countCycleMonths: true, lastCountDate: true },
    });
    if (cur && cur.countCycleMonths !== data.countCycleMonths) {
      const next = nextCountFrom(cur.lastCountDate, countCycleFor(dispenseType, data.countCycleMonths));
      if (next) recalcNextCount = next;
    }
  }

  try {
    const item = await prisma.item.update({
      where: { id },
      data: {
        ...data,
        ...(recalcNext ? { nextMaintenanceDate: recalcNext } : {}),
        ...(recalcNextCount ? { nextCountDate: recalcNextCount } : {}),
      },
      include: { category: { include: { profile: true } }, location: true, issueUnit: true },
    });
    return json(item);
  } catch {
    return notFound("Item not found");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  // Soft delete: deactivate instead of hard-deleting so history (dispense/receive/maintenance/…)
  // stays intact. All operational pages filter isActive:true, so the row disappears from use;
  // settings keeps it faded for admin oversight. update throws P2025 only if the id is gone.
  try {
    await prisma.item.update({ where: { id }, data: { isActive: false } });
    return json({ success: true });
  } catch {
    return notFound("Item not found");
  }
}
