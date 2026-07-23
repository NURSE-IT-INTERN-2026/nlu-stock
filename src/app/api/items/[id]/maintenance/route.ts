import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { recomputeItemCounts } from "@/lib/stock";
import { nextMaintenanceFromCycle } from "@/lib/maintenance";
import { ItemStatus } from "@/generated/prisma/enums";
import { z } from "zod";

const maintenanceSchema = z.object({
  type: z.enum(["PREVENTIVE", "CORRECTIVE"]),
  result: z.enum(["AVAILABLE", "NEEDS_MORE_REPAIR", "DISPOSED"]),
  performedAt: z.coerce.date(),
  issue: z.string().max(500).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  cost: z.number().min(0).optional().nullable(),
  nextMaintenanceAt: z.coerce.date().optional().nullable(),
  attachmentUrls: z.array(z.string()).default([]),
  subItemId: z.string().optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return forbidden();

  const { id: itemId } = await params;
  const body = await req.json();
  const parsed = maintenanceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;

  try {
    const record = await prisma.$transaction(async (tx) => {
      // Repair finished (result AVAILABLE) but no next date sent → schedule the next
      // preventive round one cycle (default 12 months) from the day it came back.
      // The form normally fills this in; the fallback keeps API-only callers on cadence.
      let nextAt = data.nextMaintenanceAt ?? null;
      if (!nextAt && data.result === "AVAILABLE") {
        const it = await tx.item.findUnique({ where: { id: itemId }, select: { maintenanceCycleMonths: true } });
        nextAt = nextMaintenanceFromCycle(data.performedAt, it?.maintenanceCycleMonths ?? 12);
      }

      // Denormalize the repair venue (ภายใน/ภายนอก) captured at send-to-repair time onto
      // the maintenance record so cost-by-venue reporting works without a fuzzy join.
      const venueLog = await tx.itemStatusLog.findFirst({
        where: { itemId, newStatus: ItemStatus.UNDER_REPAIR, subItemId: data.subItemId ?? null },
        orderBy: { changedAt: "desc" },
        select: { repairVenue: true },
      });

      const rec = await tx.maintenanceRecord.create({
        data: {
          itemId,
          type: data.type,
          result: data.result,
          performedAt: data.performedAt,
          performedBy: auth.user.userId,
          issue: data.issue ?? undefined,
          description: data.description ?? undefined,
          cost: data.cost ?? undefined,
          attachmentUrls: data.attachmentUrls,
          nextMaintenanceAt: nextAt ?? undefined,
          subItemId: data.subItemId ?? undefined,
          repairVenue: venueLog?.repairVenue ?? undefined,
        },
      });

      // The recorded result IS the status change — AVAILABLE puts the piece back in
      // service, DISPOSED (แทงจำหน่าย) removes it from inventory, NEEDS_MORE_REPAIR
      // (ซ่อมแล้วยังไม่หาย) puts it into the repair queue — all here rather than in a
      // second manual trip to the status screen. NEEDS_MORE_REPAIR keeps the due date so
      // the piece stays on the overdue list until it's actually fixed.
      const newStatus =
        data.result === "AVAILABLE" ? ItemStatus.AVAILABLE
        : data.result === "DISPOSED" ? ItemStatus.DISPOSED
        : data.result === "NEEDS_MORE_REPAIR" ? ItemStatus.UNDER_REPAIR
        : null;
      const reason =
        data.result === "DISPOSED" ? "ตัดจำหน่ายจากผลการบำรุงรักษา"
        : data.result === "NEEDS_MORE_REPAIR" ? "ตรวจแล้วต้องซ่อมต่อ"
        : "บำรุงรักษาเสร็จสิ้น";

      if (data.subItemId) {
        // Tracked copy: the schedule lives on the SubItem, so this copy alone gets
        // re-dated — servicing/disposing one piece never moves its siblings.
        if (newStatus) {
          const sub = await tx.subItem.findUnique({ where: { id: data.subItemId }, select: { status: true } });
          if (sub && sub.status !== newStatus) {
            await tx.subItem.update({ where: { id: data.subItemId }, data: { status: newStatus } });
            await tx.itemStatusLog.create({
              data: {
                itemId,
                subItemId: data.subItemId,
                previousStatus: sub.status,
                newStatus,
                reason,
                changedBy: auth.user.userId,
              },
            });
          }
        }
        // Stamp this copy's schedule. DISPOSED → no next round. AVAILABLE → next cycle.
        // NEEDS_MORE_REPAIR → leave nextMaintenanceDate untouched so it stays overdue.
        await tx.subItem.update({
          where: { id: data.subItemId },
          data: {
            lastMaintenanceDate: data.performedAt,
            ...(data.result === "DISPOSED"
              ? { nextMaintenanceDate: null }
              : nextAt
                ? { nextMaintenanceDate: nextAt }
                : {}),
          },
        });
        // Re-derive item status/qty from the aggregated sub-item statuses.
        await recomputeItemCounts(tx, itemId);
      } else {
        // Flat (non-tracked) item: schedule lives on the Item. DISPOSED / UNDER_REPAIR
        // are set here; AVAILABLE is left to qty derivation (recompute) below.
        if (newStatus === ItemStatus.DISPOSED || newStatus === ItemStatus.UNDER_REPAIR) {
          const cur = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: { status: true } });
          if (cur.status !== newStatus) {
            await tx.item.update({ where: { id: itemId }, data: { status: newStatus } });
            await tx.itemStatusLog.create({
              data: {
                itemId,
                previousStatus: cur.status,
                newStatus,
                reason,
                changedBy: auth.user.userId,
              },
            });
          }
        }

        await tx.item.update({
          where: { id: itemId },
          data: {
            lastMaintenanceDate: data.performedAt,
            ...(nextAt && { nextMaintenanceDate: nextAt }),
          },
        });

        // Derive item status (AVAILABLE left to qty derivation, not hardcoded).
        await recomputeItemCounts(tx, itemId);

        // A disposed flat item has no next round.
        const after = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: { status: true } });
        if (after.status === ItemStatus.DISPOSED) {
          await tx.item.update({ where: { id: itemId }, data: { nextMaintenanceDate: null } });
        }
      }

      return rec;
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error("Maintenance create error:", err);
    return NextResponse.json({ error: "Failed to create maintenance record" }, { status: 500 });
  }
}
