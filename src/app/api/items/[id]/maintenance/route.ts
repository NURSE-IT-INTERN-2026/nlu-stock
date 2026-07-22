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

      // Maintenance completed on a specific sub-item → mark it AVAILABLE + log.
      if (data.subItemId && data.result === "AVAILABLE") {
        const sub = await tx.subItem.findUnique({ where: { id: data.subItemId }, select: { status: true } });
        if (sub && sub.status !== ItemStatus.AVAILABLE) {
          await tx.subItem.update({ where: { id: data.subItemId }, data: { status: ItemStatus.AVAILABLE } });
          await tx.itemStatusLog.create({
            data: {
              itemId,
              subItemId: data.subItemId,
              previousStatus: sub.status,
              newStatus: ItemStatus.AVAILABLE,
              reason: "บำรุงรักษาเสร็จสิ้น",
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

      // Derive item status from current state (tracked: sub-items; COUNT: out-on-loan qty).
      await recomputeItemCounts(tx, itemId);

      return rec;
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error("Maintenance create error:", err);
    return NextResponse.json({ error: "Failed to create maintenance record" }, { status: 500 });
  }
}
