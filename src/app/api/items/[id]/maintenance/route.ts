import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { lockItems, recomputeItemCounts, restoreDamagedQty } from "@/lib/stock";
import { canTransition } from "@/lib/status-utils";
import { STATUS_LABELS } from "@/lib/constants";
import { nextDateAfterJob } from "@/lib/maintenance";
import { closeOpenLoan } from "@/lib/returns";
import { AdjustmentReason, ItemStatus } from "@/generated/prisma/enums";
import { z } from "zod";

const maintenanceSchema = z.object({
  type: z.enum(["PREVENTIVE", "CORRECTIVE"]),
  // รับซ่อม closes the repair: the piece either works again or it's written off. A piece that
  // came back still broken is never "received" — it stays UNDER_REPAIR and staff edit the
  // repair details (ภายใน → ภายนอก) instead, so there is no third outcome to record.
  result: z.enum(["AVAILABLE", "DISPOSED"]),
  performedAt: z.coerce.date(),
  issue: z.string().max(500).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  cost: z.number().min(0).optional().nullable(),
  nextMaintenanceAt: z.coerce.date().optional().nullable(),
  attachmentUrls: z.array(z.string()).default([]),
  // ภายใน/ภายนอก. A PREVENTIVE round carries it straight from the form: ภายใน is recorded on
  // the spot, ภายนอก arrives here only when the piece is being received back from the trip
  // that parked it in กำลังบำรุงรักษา. CORRECTIVE ignores it and reads the ส่งซ่อม log instead —
  // that venue is a fact already on record, not something the receiving form gets to restate.
  repairVenue: z.enum(["INTERNAL", "EXTERNAL"]).optional().nullable(),
  subItemId: z.string().optional().nullable(),
  // The แจ้งชำรุด booking this job closes, for non-tracked (qty) stock. Its presence is what
  // makes this a qty repair: the job hands that exact booking's units back (or writes them
  // off) instead of flipping a piece's status. Mutually exclusive with subItemId.
  adjustmentId: z.string().optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth.denied) return auth.denied;

  const { id: itemId } = await params;
  const body = await req.json();
  const parsed = maintenanceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;
  if (data.adjustmentId && (data.subItemId || data.type !== "CORRECTIVE")) {
    return NextResponse.json(
      { error: "adjustmentId ใช้ได้เฉพาะงานซ่อมของพัสดุแบบนับจำนวน" },
      { status: 400 },
    );
  }

  try {
    const record = await prisma.$transaction(async (tx) => {
      await lockItems(tx, [itemId]);
      // Scheduling is the server's call — see nextDateAfterJob for the rule and why.
      // A PREVENTIVE round may carry an override (staff typed their own date); the repair
      // screen has no such field, so any date arriving with a CORRECTIVE job is ignored
      // rather than allowed to shift a cadence the repair isn't supposed to touch.
      // undefined = leave nextMaintenanceDate as it is; null = clear it (written off).
      const isRepair = data.type === "CORRECTIVE";
      // Closing one ชำรุด booking of a qty item says nothing about the item as a whole —
      // 3 of 40 chairs came back from the shop. So it never touches the item's schedule
      // (nextAt stays undefined) and never flips the item's status.
      const qtyRepair = !!data.adjustmentId;
      const it = await tx.item.findUnique({
        where: { id: itemId },
        select: { maintenanceCycleMonths: true, nextMaintenanceDate: true, status: true },
      });
      const subNow = data.subItemId
        ? await tx.subItem.findUnique({ where: { id: data.subItemId }, select: { nextMaintenanceDate: true, status: true } })
        : null;
      const currentNext = data.subItemId
        ? subNow?.nextMaintenanceDate ?? null
        : it?.nextMaintenanceDate ?? null;
      const nextAt = qtyRepair
        ? undefined
        : (isRepair ? null : data.nextMaintenanceAt) ??
          nextDateAfterJob({
            type: data.type,
            result: data.result,
            performedAt: data.performedAt,
            cycleMonths: it?.maintenanceCycleMonths ?? 12,
            currentNext,
          });

      // Denormalize the repair venue (ภายใน/ภายนอก) captured at send-to-repair time onto
      // the maintenance record so cost-by-venue reporting works without a fuzzy join.
      // CORRECTIVE only: this record closes a ส่งซ่อม trip, so the newest UNDER_REPAIR log
      // IS that trip. A PREVENTIVE round has no trip — looking one up would inherit the
      // venue of whatever repair happened last (possibly a year ago) and skew the report.
      // qtyRepair excluded: a qty ชำรุด booking has no ส่งซ่อม log of its own, so this would
      // inherit the venue of whatever whole-item repair happened last.
      const venueLog =
        data.type === "CORRECTIVE" && !qtyRepair
          ? await tx.itemStatusLog.findFirst({
              where: { itemId, newStatus: ItemStatus.UNDER_REPAIR, subItemId: data.subItemId ?? null },
              orderBy: { changedAt: "desc" },
              select: { repairVenue: true },
            })
          : null;

      // A ภายนอก round is the second half of a trip that opened with a ส่งบำรุงรักษาภายนอก log.
      // Link the two: that link is what lets the open trip and this record be ONE case holding
      // one MC number from ส่ง through รับคืน (see MaintenanceRecord.sentLogId).
      // The departure is the row that ENTERED กำลังบำรุงรักษา — the self-edges stacked on top of
      // it are แก้ข้อมูลส่งบำรุงรักษา edits to the same trip, not departures of their own.
      // Guarded on the piece actually being out right now: a ภายนอก round typed straight into
      // the form without ever sending has no trip, and without this it would adopt the log of
      // whichever trip happened last.
      const inTrip =
        (data.subItemId ? subNow?.status : it?.status) === ItemStatus.PENDING_MAINTENANCE;
      const sentLog =
        data.type === "PREVENTIVE" && inTrip
          ? await tx.itemStatusLog.findFirst({
              where: {
                itemId,
                subItemId: data.subItemId ?? null,
                newStatus: ItemStatus.PENDING_MAINTENANCE,
                previousStatus: { not: ItemStatus.PENDING_MAINTENANCE },
              },
              orderBy: { changedAt: "desc" },
              select: { id: true },
            })
          : null;

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
          repairVenue: venueLog?.repairVenue ?? data.repairVenue ?? undefined,
          sentLogId: sentLog?.id,
        },
      });

      // The recorded result IS the status change — AVAILABLE puts the piece back in service,
      // DISPOSED (แทงจำหน่าย) removes it from inventory — done here rather than in a second
      // manual trip to the status screen.
      const newStatus =
        data.result === "AVAILABLE" ? ItemStatus.AVAILABLE : ItemStatus.DISPOSED;
      const reason =
        data.result === "DISPOSED" ? "ตัดจำหน่ายจากผลการบำรุงรักษา" : "บำรุงรักษาเสร็จสิ้น";

      if (qtyRepair) {
        // Qty stock: the job closes one แจ้งชำรุด booking. `recoveredAt` is what takes it off
        // the ชำรุด bucket (lib/stock damagedQtyOf derives that from the open rows), so it is
        // stamped for BOTH outcomes — the units stop waiting for a repair either way.
        const adj = await tx.stockAdjustment.findUnique({ where: { id: data.adjustmentId! } });
        if (!adj || adj.itemId !== itemId) throw new Error("ไม่พบรายการชำรุด");
        if (adj.reason !== AdjustmentReason.DAMAGED_PENDING_REPAIR) throw new Error("ไม่ใช่รายการชำรุด");
        if (adj.recoveredAt) throw new Error("รับคืนแล้ว");

        // Two different adjustments, two different questions.
        //   adjustmentId    — the row this job WROTE (รับคืน / ตัดจำหน่าย). It carries the qty and
        //                     the balance, so the timeline prints it and folds ค่าซ่อม in rather
        //                     than telling the same รับคืนจากซ่อม twice.
        //   repairBookingId — the แจ้งชำรุด row this job CLOSED. That row has been collecting the
        //                     trip's หลักฐาน since it opened (แจ้งชำรุด, ส่งซ่อม, and every
        //                     แก้ข้อมูล edit), and it was the one thing the finished job could not
        //                     point at: staff walk ส่งซ่อม → แก้ไข → รับคืน as one job, then open
        //                     the last row and find it empty. `adj.id` is right here; it was
        //                     simply being dropped.
        const timelineRow = async (adjustmentId: string) =>
          tx.maintenanceRecord.update({
            where: { id: rec.id },
            data: { adjustmentId, repairBookingId: adj.id },
          });

        if (data.result === "AVAILABLE") {
          const back = await restoreDamagedQty(tx, { adj, reason: AdjustmentReason.REPAIR_RETURN, note: data.description, userId: auth.user.userId });
          await timelineRow(back.adjustmentId);
        } else {
          // ซ่อมไม่ได้: แจ้งชำรุด parked these units in totalQty (lib/stock holdsTotalQty) on the
          // promise they'd come back. This is where that promise ends — availableQty already
          // lost them at แจ้งชำรุด time, so only the total drops. The item's own status is left
          // alone: writing off 3 of 40 does not dispose the item.
          const qty = adj.previousQty - adj.newQty;
          await tx.stockAdjustment.update({ where: { id: adj.id }, data: { recoveredAt: new Date() } });
          const before = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: { availableQty: true } });
          await tx.item.update({ where: { id: itemId }, data: { totalQty: { decrement: qty } } });
          const writeOff = await tx.stockAdjustment.create({
            data: {
              itemId,
              delta: 0,
              previousQty: before.availableQty,
              newQty: before.availableQty,
              reason: AdjustmentReason.DISPOSAL,
              notes: `ตัดจำหน่ายจากผลการซ่อม ${qty}${adj.notes ? ` (${adj.notes})` : ""}${data.description ? ` — ${data.description}` : ""}`,
              adjustedBy: auth.user.userId,
            },
          });
          await timelineRow(writeOff.id);
          await recomputeItemCounts(tx, itemId);
        }
      } else if (data.subItemId) {
        // Tracked copy: the schedule lives on the SubItem, so this copy alone gets
        // re-dated — servicing/disposing one piece never moves its siblings.
        {
          const sub = await tx.subItem.findUnique({ where: { id: data.subItemId }, select: { status: true } });
          if (sub && sub.status !== newStatus) {
            // Same lifecycle rules as the status screen: a DAMAGED piece can't be marked
            // fixed here without going through ส่งซ่อม first. A PREVENTIVE round on a piece
            // that is already AVAILABLE changes nothing and skips this branch entirely.
            if (!canTransition(sub.status, newStatus)) {
              throw new Error(
                `บันทึกผลเป็น "${STATUS_LABELS[newStatus]}" ไม่ได้ — ชิ้นนี้สถานะ "${STATUS_LABELS[sub.status]}"`,
              );
            }
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
            // A piece serviced while still out on loan comes back in service here — close the
            // loan too, or it stays on รับคืน forever with the piece already พร้อมใช้งาน.
            await closeOpenLoan(tx, {
              itemId,
              subItemId: data.subItemId,
              previousStatus: sub.status,
              newStatus,
              userId: auth.user.userId,
            });
          }
        }
        // Stamp this copy's schedule. A repair is not a maintenance round, so it leaves both
        // dates alone — ครั้งล่าสุด stays the last real round (it is also the baseline the
        // admin cycle-change recalc reads, so writing the repair date here would shift the
        // cadence by the back door). nextAt undefined = nothing to write.
        await tx.subItem.update({
          where: { id: data.subItemId },
          data: {
            ...(isRepair ? {} : { lastMaintenanceDate: data.performedAt }),
            ...(nextAt !== undefined ? { nextMaintenanceDate: nextAt } : {}),
          },
        });
        // Re-derive item status/qty from the aggregated sub-item statuses.
        await recomputeItemCounts(tx, itemId);
      } else {
        // Flat (non-tracked) item: schedule lives on the Item. DISPOSED is set here, and so is
        // the release from กำลังบำรุงรักษา — recomputeItemCounts keeps a manual hold instead of
        // re-deriving it (lib/status-utils isManualHold), so an item sent out for an external
        // round would sit there forever with nothing able to clear it. Every other AVAILABLE
        // is still left to qty derivation below.
        const cur = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: { status: true } });
        const mustSetStatus =
          cur.status !== newStatus &&
          (newStatus === ItemStatus.DISPOSED || cur.status === ItemStatus.PENDING_MAINTENANCE);
        if (mustSetStatus) {
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

        await tx.item.update({
          where: { id: itemId },
          data: {
            ...(isRepair ? {} : { lastMaintenanceDate: data.performedAt }),
            ...(nextAt !== undefined ? { nextMaintenanceDate: nextAt } : {}),
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
    // Lifecycle violations are thrown inside the transaction — surface their message so the
    // form can tell staff which step is missing instead of a blank 500.
    return handleError(err, "Failed to create maintenance record");
  }
}
