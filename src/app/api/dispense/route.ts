import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth, handleError } from "@/lib/api-utils";
import { dispenseRequestSchema } from "@/lib/validators";
import { recomputeItemCounts } from "@/lib/stock";
import { isManualHold } from "@/lib/status-utils";
import { STATUS_LABELS } from "@/lib/constants";
import { ItemStatus } from "@/generated/prisma/enums";
import { LoanType } from "@/generated/prisma/enums";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const body = await req.json();
  const parsed = dispenseRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { items, usageType, courseCode, usageNote, notes, recipient, locationId, dueAt } = parsed.data;
  const inRoom = parsed.data.loanType === "INUSE"; // trackIndividually → IN_USE instead of ON_LOAN

  // One loanGroupId per borrow event → groups all lines for the return screen.
  const loanGroupId = randomUUID();
  const dueAtDate = inRoom ? null : dueAt ? new Date(dueAt) : null; // IN_USE: open-ended, no due date

  // Dedup check: no duplicate itemId+lotId+subItemId
  const keys = items.map((i) => `${i.itemId}-${i.lotId ?? ""}-${i.subItemId ?? ""}`);
  if (new Set(keys).size !== keys.length) {
    return NextResponse.json({ error: "Duplicate items in request" }, { status: 400 });
  }

  try {
    const recordIds = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];

      for (const di of items) {
        // Fetch item with relations for validation
        const item = await tx.item.findUnique({
          where: { id: di.itemId },
          include: {
            category: { include: { profile: true } },
            lots: { where: { id: di.lotId ?? undefined } },
            subItems: { where: { id: di.subItemId ?? undefined } },
            issueUnit: true,
          },
        });

        if (!item) throw new Error("ไม่พบพัสดุ");

        // Guard: tracked durable must resolve to a SubItem — never dispense as aggregate.
        if (item.trackIndividually && !di.subItemId) {
          throw new Error(`${item.name}: พัสดุติดตามรายชิ้นต้องเลือกชิ้นย่อยก่อนเบิก (ติดต่อผู้ดูแลเพิ่มชิ้นย่อย)`);
        }

        // Guard: an item pulled from service must not go out. "ทั้งรายการชำรุด" writes
        // Item.status without moving any qty, so availableQty alone can't tell — this is the
        // only check that sees it. Tracked items are covered per piece below (their aggregate
        // status can read DAMAGED while individual pieces are still fine).
        if (!item.trackIndividually && isManualHold(item.status)) {
          throw new Error(`${item.name}: สถานะ ${STATUS_LABELS[item.status]} — เบิกไม่ได้`);
        }

        // Validate quantity vs available
        if (item.trackIndividually && di.subItemId) {
          const sub = item.subItems[0];
          if (!sub) throw new Error("ไม่พบชิ้นย่อย");
          if (sub.status !== ItemStatus.AVAILABLE) throw new Error(`ชิ้นย่อย ${sub.subCode} ไม่พร้อมใช้งาน`);
        } else if (di.lotId) {
          const lot = item.lots[0];
          if (!lot) throw new Error("ไม่พบล็อต");
          if (lot.remainingQty < di.quantity) throw new Error(`ล็อต ${lot.lotNumber} เหลือเพียง ${lot.remainingQty} ${item.issueUnit.name} (ต้องการ ${di.quantity})`);
        } else if (!item.trackIndividually) {
          if (item.availableQty < di.quantity) throw new Error(`${item.name} เหลือเพียง ${item.availableQty} (ต้องการ ${di.quantity})`);
        }

        // Create DispenseRecord
        const record = await tx.dispenseRecord.create({
          data: {
            itemId: di.itemId,
            subItemId: di.subItemId ?? undefined,
            lotId: di.lotId ?? undefined,
            quantity: di.quantity,
            usageType: usageType ?? undefined,
            courseCode: courseCode ?? undefined,
            usageNote: usageNote ?? undefined,
            staffId: auth.user.userId,
            notes: notes ?? undefined,
            recipient: recipient ?? undefined,
            locationId: locationId ?? undefined,
            loanGroupId,
            loanType: inRoom ? LoanType.INUSE : LoanType.BORROW,
            dueAt: dueAtDate ?? undefined,
          },
        });
        ids.push(record.id);

        // Apply stock effects
        if (item.trackIndividually && di.subItemId) {
          // Tracked durable: update sub-item status (ยืม ON_LOAN / ตั้งใช้ในห้อง IN_USE)
          const newStatus = inRoom ? ItemStatus.IN_USE : ItemStatus.ON_LOAN;
          const sub = item.subItems[0];
          await tx.subItem.update({
            where: { id: di.subItemId },
            // นำไปใช้งาน (INUSE) moves this one physical piece — mirror the destination onto
            // the sub-item's own locationId (only when it resolved to a real Location).
            data: { status: newStatus, ...(inRoom && locationId ? { locationId } : {}) },
          });
          // This is the ONLY writer that moves a piece INTO ON_LOAN/IN_USE, which is what lets
          // an item's ประวัติ drop those rows as duplicates of the เบิก row it sits beside
          // (api/items/[id]/history). A second writer would make that event vanish silently.
          await tx.itemStatusLog.create({
            data: {
              itemId: di.itemId,
              subItemId: di.subItemId,
              previousStatus: sub.status,
              newStatus,
              reason: "เบิก",
              changedBy: auth.user.userId,
            },
          });
          // Tracked durable: counts derive from subItem statuses.
          await recomputeItemCounts(tx, di.itemId);
        } else if (di.lotId) {
          // Consumable with lot: deduct lot + item availableQty (optimistic lock)
          const updated = await tx.lot.updateMany({
            where: { id: di.lotId, remainingQty: { gte: di.quantity } },
            data: { remainingQty: { decrement: di.quantity } },
          });
          if (updated.count === 0) {
            const lot = await tx.lot.findUnique({ where: { id: di.lotId } });
            throw new Error(`ล็อต ${lot?.lotNumber ?? di.lotId} เหลือเพียง ${lot?.remainingQty ?? 0} ${item.issueUnit.name} (ต้องการ ${di.quantity})`);
          }
          const itemUpdate = await tx.item.updateMany({
            where: { id: di.itemId, availableQty: { gte: di.quantity } },
            data: { availableQty: { decrement: di.quantity } },
          });
          if (itemUpdate.count === 0) {
            throw new Error(`${item.name} จำนวนคงเหลือไม่ตรง (ตัวนับไม่ sync กับล็อต)`);
          }
        } else {
          // Non-tracked item (COUNT): deduct item availableQty (optimistic lock — no negative)
          const updated = await tx.item.updateMany({
            where: { id: di.itemId, availableQty: { gte: di.quantity } },
            data: { availableQty: { decrement: di.quantity } },
          });
          if (updated.count === 0) {
            throw new Error(`${item.name} เหลือเพียง ${item.availableQty} (ต้องการ ${di.quantity})`);
          }
          // COUNT items: available < total now means units are out on loan → derive ON_LOAN.
          await recomputeItemCounts(tx, di.itemId);
        }
      }

      return ids;
    });

    return NextResponse.json({ success: true, count: recordIds.length, ids: recordIds }, { status: 201 });
  } catch (err) {
    return handleError(err, "Dispense failed");
  }
}
