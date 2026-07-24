import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, error, parseBody, forbidden } from "@/lib/api-utils";
import { statusChangeSchema } from "@/lib/validators";
import { recomputeItemCounts } from "@/lib/stock";
import { canTransition } from "@/lib/status-utils";
import { STATUS_LABELS } from "@/lib/constants";
import { ReturnCondition } from "@/generated/prisma/enums";
import { ItemStatus } from "@/generated/prisma/enums";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return forbidden();

  const { id } = await params;
  const { data, error: parseError } = await parseBody(statusChangeSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return notFound("Item not found");

  if (data.subItemId) {
    const subItem = await prisma.subItem.findUnique({ where: { id: data.subItemId } });
    if (!subItem || subItem.itemId !== id) return notFound("Sub-item not found");

    // UNDER_REPAIR → UNDER_REPAIR is a real edit (แก้ข้อมูลส่งซ่อม: ภายใน → ภายนอก) that
    // appends a log row, so it must survive the same-status short-circuit below.
    const isRepairEdit =
      subItem.status === ItemStatus.UNDER_REPAIR && data.newStatus === ItemStatus.UNDER_REPAIR;
    if (data.newStatus === subItem.status && !isRepairEdit) return json(subItem); // no-op: no log, no recompute

    if (!canTransition(subItem.status, data.newStatus, { isAdmin: auth.user.role === "ADMIN" })) {
      return error(
        `เปลี่ยนสถานะจาก "${STATUS_LABELS[subItem.status]}" เป็น "${STATUS_LABELS[data.newStatus]}" ไม่ได้ — ต้องทำตามลำดับ`,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.subItem.update({
        where: { id: data.subItemId! },
        data: { status: data.newStatus },
      });

      await tx.itemStatusLog.create({
        data: {
          itemId: id,
          subItemId: data.subItemId,
          previousStatus: subItem.status,
          newStatus: data.newStatus,
          reason: data.notes || `เปลี่ยนสถานะเป็น ${STATUS_LABELS[data.newStatus] ?? data.newStatus}`,
          changedBy: auth.user.userId,
          imageUrl: data.imageUrl,
          repairVenue: data.repairVenue ?? undefined,
          repairNote: data.repairNote ?? undefined,
        },
      });

      // Leaving IN_USE (ตั้งใช้ในห้อง → คืนเข้าพัสดุ / แจ้งชำรุด-สูญหาย) closes the open INUSE
      // dispense record so it doesn't linger as a phantom outstanding loan.
      if (subItem.status === ItemStatus.IN_USE && data.newStatus !== ItemStatus.IN_USE) {
        const open = await tx.dispenseRecord.findFirst({
          where: { itemId: id, subItemId: data.subItemId, returnedAt: null, loanType: "INUSE" },
          orderBy: { dispensedAt: "desc" },
        });
        if (open) {
          const cond = (["AVAILABLE", "DAMAGED", "LOST"] as const).includes(
            data.newStatus as "AVAILABLE" | "DAMAGED" | "LOST",
          )
            ? (data.newStatus as ReturnCondition)
            : undefined;
          await tx.dispenseRecord.update({
            where: { id: open.id },
            data: { resolvedQty: open.quantity, returnedAt: new Date(), ...(cond ? { returnCondition: cond } : {}) },
          });
        }
      }

      // Recompute counts for tracked items after a per-piece status change (no-op for non-tracked).
      await recomputeItemCounts(tx, id);
      return updated;
    });

    return json(result, 201);
  }

  if (data.newStatus === item.status) return error("New status is the same as current");

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.item.update({
      where: { id },
      data: { status: data.newStatus },
    });

    await tx.itemStatusLog.create({
      data: {
        itemId: id,
        previousStatus: item.status,
        newStatus: data.newStatus,
        reason: data.notes || `Status changed to ${data.newStatus}`,
        changedBy: auth.user.userId,
        imageUrl: data.imageUrl,
        repairVenue: data.repairVenue ?? undefined,
        repairNote: data.repairNote ?? undefined,
      },
    });

    return updated;
  });

  return json(result, 201);
}
