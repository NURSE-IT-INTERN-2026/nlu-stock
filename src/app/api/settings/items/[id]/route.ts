import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireAdmin, json, notFound, error, parseBody } from "@/lib/api-utils";
import { itemUpdateSchema } from "@/lib/validators";
import { sanitizeItemByProfile, isItemTracked } from "@/lib/category-profile";
import { nextMaintenanceFromCycle } from "@/lib/maintenance";
import { countCycleFor, nextCountFrom } from "@/lib/stock-count";
import { allocateAcrossLots, recomputeItemCounts } from "@/lib/stock";
import { STATUS_LABELS } from "@/lib/constants";
import type { DispenseType } from "@/generated/prisma/enums";
import { ItemStatus, AdjustmentReason } from "@/generated/prisma/enums";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
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
  const auth = await requireAdmin(request);
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
  // Recalc nextMaintenanceDate when the maintenance cycle changes, so overdue/
  // due-soon alerts follow the new cadence immediately — not only after the
  // next maintenance record. Baseline = last performed maintenance; no baseline
  // (never maintained) → leave nextMaintenanceDate untouched (still null).
  // Flat items carry the schedule on the Item; tracked items carry it per copy on
  // each SubItem (recalculated below, after the item write).
  // ponytail: extra read on the rare admin update path is fine; no cron exists.
  let recalcNext: Date | undefined;
  let cycleChangedTo: number | undefined;
  if (data.maintenanceCycleMonths !== undefined) {
    const cur = await prisma.item.findUnique({
      where: { id },
      select: { maintenanceCycleMonths: true, lastMaintenanceDate: true },
    });
    if (cur && cur.maintenanceCycleMonths !== data.maintenanceCycleMonths) {
      cycleChangedTo = data.maintenanceCycleMonths;
      if (!data.trackIndividually) {
        const next = nextMaintenanceFromCycle(cur.lastMaintenanceDate, data.maintenanceCycleMonths);
        if (next) recalcNext = next;
      }
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

    // Tracked items keep the schedule per copy — re-date each copy from its own last
    // maintenance + the new cycle. Copies never maintained (no baseline) are left null.
    if (cycleChangedTo !== undefined && data.trackIndividually) {
      const subs = await prisma.subItem.findMany({
        // Written-off copies (DISPOSED/LOST) have no next round — don't re-date them.
        where: { itemId: id, lastMaintenanceDate: { not: null }, status: { notIn: ["DISPOSED", "LOST"] } },
        select: { id: true, lastMaintenanceDate: true },
      });
      await Promise.all(
        subs.map((s) => {
          const next = nextMaintenanceFromCycle(s.lastMaintenanceDate, cycleChangedTo!);
          return next
            ? prisma.subItem.update({ where: { id: s.id }, data: { nextMaintenanceDate: next } })
            : Promise.resolve();
        }),
      );
    }

    return json(item);
  } catch {
    return notFound("Item not found");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  // Write-off + deactivate. Remaining on-shelf stock is cut from the books (tracked pieces →
  // DISPOSED, consumable qty → 0 via StockAdjustment) so an admin removing an item leaves no
  // phantom stock. Pieces currently OUT (ON_LOAN / IN_USE, or open BORROW loans for COUNT)
  // block deletion — they must be returned first. The row is kept (isActive:false) so the
  // full history (dispense/receive/maintenance/audit) stays auditable; the Code can't be reused.
  const item = await prisma.item.findUnique({
    where: { id },
    select: {
      id: true,
      trackIndividually: true,
      availableQty: true,
      code: true,
      category: { select: { profile: { select: { dispenseType: true } } } },
    },
  });
  if (!item) return notFound("Item not found");

  // ── Pre-checks (outside the tx so a refusal doesn't burn a round-trip) ──
  if (item.trackIndividually) {
    const subs = await prisma.subItem.findMany({
      where: { itemId: id, status: { in: [ItemStatus.ON_LOAN, ItemStatus.IN_USE] } },
      select: { id: true },
    });
    if (subs.length > 0) {
      return error(
        `มีพัสดุกำลัง${STATUS_LABELS[ItemStatus.ON_LOAN]}/${STATUS_LABELS[ItemStatus.IN_USE]}อยู่ ${subs.length} ชิ้น กรุณารับคืนก่อนลบ`,
      );
    }
  } else {
    const openLoans = await prisma.dispenseRecord.count({
      where: { itemId: id, returnedAt: null, loanType: "BORROW" },
    });
    if (openLoans > 0) return error(`มีพัสดุถูกยืมอยู่ ${openLoans} รายการ กรุณารับคืนก่อนลบ`);
  }

  const result = await prisma.$transaction(async (tx) => {
    let disposed = 0;

    if (item.trackIndividually) {
      // Dispose every still-on-the-books piece. AVAILABLE/DAMAGED/UNDER_REPAIR all reach
      // DISPOSED legally (status-utils ALLOWED_TRANSITIONS); LOST/DISPOSED are already off
      // the books and skipped. ON_LOAN/IN_USE were refused above.
      const live = await tx.subItem.findMany({
        where: { itemId: id, status: { in: [ItemStatus.AVAILABLE, ItemStatus.DAMAGED, ItemStatus.UNDER_REPAIR] } },
        select: { id: true, status: true },
      });
      for (const sub of live) {
        await tx.subItem.update({ where: { id: sub.id }, data: { status: ItemStatus.DISPOSED } });
        await tx.itemStatusLog.create({
          data: {
            itemId: id,
            subItemId: sub.id,
            previousStatus: sub.status,
            newStatus: ItemStatus.DISPOSED,
            reason: `ตัดจำหน่าย — ลบรายการพัสดุ ${item.code}`,
            changedBy: auth.user.userId,
          },
        });
        disposed++;
      }
    } else if (item.availableQty > 0) {
      // Non-tracked: drain whatever is on the shelf to 0. allocateAcrossLots spreads the
      // negative delta across lots FEFO; for lot-less consumables it returns false and we
      // own availableQty directly (then recompute is a no-op for them — no lots to resync).
      const prev = item.availableQty;
      await allocateAcrossLots(tx, id, -prev);
      await tx.stockAdjustment.create({
        data: {
          itemId: id,
          delta: -prev,
          previousQty: prev,
          newQty: 0,
          reason: AdjustmentReason.DISPOSAL,
          notes: `ตัดจำหน่าย — ลบรายการพัสดุ ${item.code}`,
          adjustedBy: auth.user.userId,
        },
      });
      await tx.item.update({ where: { id }, data: { availableQty: 0 } });
      disposed = prev;
    }

    await recomputeItemCounts(tx, id);
    await tx.item.update({ where: { id }, data: { isActive: false } });
    return { disposed };
  });

  return json({ success: true, disposed: result.disposed });
}
