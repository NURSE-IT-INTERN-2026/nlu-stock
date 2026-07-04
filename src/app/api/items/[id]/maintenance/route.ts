import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { recomputeItemCounts } from "@/lib/stock";
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
          nextMaintenanceAt: data.nextMaintenanceAt ?? undefined,
          subItemId: data.subItemId ?? undefined,
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
              reason: "Maintenance completed",
              changedBy: auth.user.userId,
            },
          });
        }
      }

      await tx.item.update({
        where: { id: itemId },
        data: {
          lastMaintenanceDate: data.performedAt,
          ...(data.nextMaintenanceAt && { nextMaintenanceDate: data.nextMaintenanceAt }),
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
