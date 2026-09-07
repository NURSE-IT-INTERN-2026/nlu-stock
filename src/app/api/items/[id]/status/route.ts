import { prisma } from "@/lib/prisma";
import { requireAdmin, json, notFound, error, parseBody, handleError } from "@/lib/api-utils";
import { statusChangeSchema } from "@/lib/validators";
import { lockItems, recomputeItemCounts } from "@/lib/stock";
import { canTransition } from "@/lib/status-utils";
import { STATUS_LABELS } from "@/lib/constants";
import { closeOpenLoan, returnLocationUpdate } from "@/lib/returns";
import { kitSetLabelOf } from "@/lib/kits";
import { ItemStatus } from "@/generated/prisma/enums";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(statusChangeSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return notFound("Item not found");

  if (data.subItemId) {
    const found = await prisma.subItem.findUnique({
      where: { id: data.subItemId },
      select: { itemId: true },
    });
    if (!found || found.itemId !== id) return notFound("Sub-item not found");

    try {
      const outcome = await prisma.$transaction(async (tx) => {
        // สถานะรายชิ้นเปลี่ยน → availableQty ถูกนับใหม่จาก sub_items ท้าย transaction.
        // ล็อกต้องมาก่อนการอ่านสถานะที่ใช้ตัดสิน ไม่ใช่แค่ก่อนเขียน: อ่านนอก transaction แล้ว
        // ค่อยล็อกทำให้สองคำขอที่เห็น พร้อมใช้งาน พร้อมกันผ่าน canTransition ทั้งคู่ คนที่สอง
        // เขียนทับคนแรกพร้อม log ที่บอก previousStatus ผิด — แจ้งชำรุดหายไปเงียบๆ
        await lockItems(tx, [id]);
        const subItem = await tx.subItem.findUniqueOrThrow({ where: { id: data.subItemId! } });

        // A piece inside an assembled KIT set may be reported broken from right here — this is
        // the ONE damage path in the app, and a set is no longer taken apart to reach the pieces
        // in it. Saying so leaves the set physically short of that piece; ดูของในชุด lists the
        // gap so whoever refills the box can see it.
        // Leaving the set is handled below (inKitSubItemId cleared, INUSE record closed by
        // closeOpenLoan); a piece that stays put keeps its link.
        const leavingKitSet = !!subItem.inKitSubItemId && data.newStatus !== ItemStatus.IN_USE;

        // A self-edge is a real edit that appends a log row, so it must survive the same-status
        // short-circuit below: แก้ข้อมูลส่งซ่อม (UNDER_REPAIR, ภายใน → ภายนอก) and
        // แก้ข้อมูลส่งบำรุงรักษา (PENDING_MAINTENANCE, corrected shop / scope).
        const isTripEdit =
          data.newStatus === subItem.status && canTransition(subItem.status, data.newStatus);
        if (data.newStatus === subItem.status && !isTripEdit) {
          return { noop: true as const, sub: subItem }; // no log, no recompute
        }

        if (!canTransition(subItem.status, data.newStatus)) {
          throw new Error(
            `เปลี่ยนสถานะจาก "${STATUS_LABELS[subItem.status]}" เป็น "${STATUS_LABELS[data.newStatus]}" ไม่ได้ — ต้องทำตามลำดับ`,
          );
        }

        const setLabel = leavingKitSet ? await kitSetLabelOf(tx, data.subItemId!) : null;
        const updated = await tx.subItem.update({
          where: { id: data.subItemId! },
          data: {
            status: data.newStatus,
            ...(leavingKitSet ? { inKitSubItemId: null } : {}),
            ...returnLocationUpdate({
              previousStatus: subItem.status,
              newStatus: data.newStatus,
              dest: data.locationId,
              itemLocationId: item.locationId,
            }),
          },
        });

        const baseReason = data.notes || `เปลี่ยนสถานะเป็น ${STATUS_LABELS[data.newStatus] ?? data.newStatus}`;
        await tx.itemStatusLog.create({
          data: {
            itemId: id,
            subItemId: data.subItemId,
            // The set is named on the log row rather than left to be inferred: once
            // inKitSubItemId is cleared, this line is the only record the piece was ever in it.
            kitSubItemId: subItem.inKitSubItemId ?? undefined,
            previousStatus: subItem.status,
            newStatus: data.newStatus,
            reason: setLabel ? `${baseReason} — ออกจากชุด ${setLabel}` : baseReason,
            changedBy: auth.user.userId,
            imageUrls: data.imageUrls,
            repairVenue: data.repairVenue ?? undefined,
            repairNote: data.repairNote ?? undefined,
            damageNote: data.damageNote ?? undefined,
          },
        });

        // Leaving ON_LOAN/IN_USE here (คืนเข้าพัสดุ / แจ้งชำรุด-สูญหาย from the detail page)
        // closes the open dispense record so it doesn't linger as a phantom outstanding loan.
        await closeOpenLoan(tx, {
          itemId: id,
          subItemId: data.subItemId!,
          previousStatus: subItem.status,
          newStatus: data.newStatus,
          userId: auth.user.userId,
        });

        // Recompute counts for tracked items after a per-piece status change (no-op for non-tracked).
        await recomputeItemCounts(tx, id);
        return { noop: false as const, sub: updated };
      });

      return json(outcome.sub, outcome.noop ? 200 : 201);
    } catch (err) {
      return handleError(err, "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // ล็อกก่อนอ่านสถานะปัจจุบัน ด้วยเหตุผลเดียวกับสาขารายชิ้นข้างบน — ค่าที่ใช้ตัดสินและค่าที่
      // เขียนลง previousStatus ต้องมาจากการอ่านครั้งเดียวกันหลังล็อกแล้ว
      await lockItems(tx, [id]);
      const cur = await tx.item.findUniqueOrThrow({ where: { id }, select: { status: true } });

      // Same short-circuit as the tracked branch, same exception: a self-edge (แก้ข้อมูลส่งซ่อม /
      // แก้ข้อมูลส่งบำรุงรักษา) is an edit to a trip that is still open, not a no-op.
      if (data.newStatus === cur.status && !canTransition(cur.status, data.newStatus)) {
        throw new Error("New status is the same as current");
      }

      const updated = await tx.item.update({
        where: { id },
        data: { status: data.newStatus },
      });

      await tx.itemStatusLog.create({
        data: {
          itemId: id,
          previousStatus: cur.status,
          newStatus: data.newStatus,
          reason: data.notes || `Status changed to ${data.newStatus}`,
          changedBy: auth.user.userId,
          imageUrls: data.imageUrls,
          repairVenue: data.repairVenue ?? undefined,
          repairNote: data.repairNote ?? undefined,
        },
      });

      return updated;
    });

    return json(result, 201);
  } catch (err) {
    return handleError(err, "เปลี่ยนสถานะไม่สำเร็จ");
  }
}
