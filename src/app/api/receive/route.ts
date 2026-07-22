import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, handleError } from "@/lib/api-utils";
import { recomputeItemCounts } from "@/lib/stock";
import { receiveRequestSchema } from "@/lib/validators";
import { autoLotNumber, OPENING_LOT_NUMBER } from "@/lib/lot-code";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return forbidden();

  const body = await req.json();
  const parsed = receiveRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { items, notes } = parsed.data;

  try {
    const recordIds = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];

      for (const ri of items) {
        const item = await tx.item.findUnique({
          where: { id: ri.itemId },
          include: { category: { include: { profile: true } } },
        });

        if (!item) throw new Error("ไม่พบพัสดุ");

        const isConsumable = item.category.profile?.dispenseType === "CONSUMABLE";

        // Lot handling for consumable. Almost nothing in this stockroom has a printed
        // lot number, so a blank one is taken at face value: no lot row, availableQty
        // is the whole story. A lot only appears when there is a reason for one —
        //   1. staff typed a real lot number
        //   2. staff entered an expiry date (something has to hold it; auto date code)
        //   3. the item already has lots — recomputeItemCounts then syncs availableQty
        //      to SUM(lots.remainingQty) (ADR-0002), so stock received outside a lot
        //      would vanish at the next recompute.
        const lotCount = isConsumable ? await tx.lot.count({ where: { itemId: item.id } }) : 0;
        const wantsLot = !!ri.lotNumber?.trim() || !!ri.expiryDate || lotCount > 0;

        let lotId: string | undefined;
        if (isConsumable && wantsLot) {
          // Carry the old balance into a lot before creating the first real one —
          // see reason 3 above; without this the pre-lot balance is the stock that vanishes.
          if (lotCount === 0 && item.availableQty > 0) {
            await tx.lot.create({
              data: {
                itemId: item.id,
                lotNumber: OPENING_LOT_NUMBER,
                receivedQty: item.availableQty,
                remainingQty: item.availableQty,
                // Oldest stock on the shelf → dispensed first under FIFO.
                receivedDate: item.createdAt,
              },
            });
          }

          const typedLot = ri.lotNumber?.trim();
          const isAuto = !typedLot;
          const baseLotNumber = typedLot || autoLotNumber(new Date());

          // A differing expiry can't be merged in — overwriting the stored one would
          // corrupt FEFO ordering.
          const expiryConflicts = (lot: { expiryDate: Date | null }) =>
            !!ri.expiryDate &&
            !!lot.expiryDate &&
            lot.expiryDate.getTime() !== new Date(ri.expiryDate).getTime();

          let lotNumber = baseLotNumber;
          let existingLot = await tx.lot.findUnique({
            where: { itemId_lotNumber: { itemId: item.id, lotNumber } },
          });

          if (existingLot && expiryConflicts(existingLot)) {
            // Typed lot: a real lot number with two expiry dates is a data-entry error.
            if (!isAuto) {
              throw new Error(
                `ล็อต "${lotNumber}" ของ ${item.name} มีอยู่แล้ว แต่วันหมดอายุไม่ตรงกัน กรุณาใช้เลขล็อตใหม่`
              );
            }
            // Auto lot: the user can't pick another number, so split the day —
            // RCV-YYYYMMDD-2, -3, … until a free or expiry-compatible code turns up.
            // ponytail: 50 splits of one item in one day means something else is wrong.
            let found = false;
            for (let n = 2; n <= 50; n++) {
              const candidate = `${baseLotNumber}-${n}`;
              const lot = await tx.lot.findUnique({
                where: { itemId_lotNumber: { itemId: item.id, lotNumber: candidate } },
              });
              if (!lot || !expiryConflicts(lot)) {
                lotNumber = candidate;
                existingLot = lot;
                found = true;
                break;
              }
            }
            if (!found) {
              throw new Error(`สร้างล็อตอัตโนมัติของ ${item.name} ไม่ได้ — วันนี้มีล็อตแยกมากเกินไป`);
            }
          }

          if (existingLot) {
            // Weighted-average unit cost when appending at a new price
            let nextUnitCost = existingLot.unitCost;
            if (ri.unitCost != null) {
              const oldRemaining = existingLot.remainingQty;
              const newRemaining = oldRemaining + ri.quantity;
              nextUnitCost =
                existingLot.unitCost != null && oldRemaining > 0
                  ? (oldRemaining * existingLot.unitCost + ri.quantity * ri.unitCost) / newRemaining
                  : ri.unitCost;
            }
            await tx.lot.update({
              where: { id: existingLot.id },
              data: {
                receivedQty: { increment: ri.quantity },
                remainingQty: { increment: ri.quantity },
                unitCost: nextUnitCost,
                ...(ri.expiryDate && { expiryDate: new Date(ri.expiryDate) }),
              },
            });
            lotId = existingLot.id;
          } else {
            const newLot = await tx.lot.create({
              data: {
                itemId: item.id,
                lotNumber,
                expiryDate: ri.expiryDate ? new Date(ri.expiryDate) : null,
                receivedQty: ri.quantity,
                remainingQty: ri.quantity,
                unitCost: ri.unitCost ?? null,
              },
            });
            lotId = newLot.id;
          }
        }

        // Tracked durables must supply exactly one sub-code per copy
        if (item.trackIndividually) {
          if (!ri.subCodes?.length || ri.subCodes.length !== ri.quantity) {
            throw new Error(`${item.name}: พัสดุติดตามรายชิ้นต้องการ ${ri.quantity} รหัสย่อย ได้รับ ${ri.subCodes?.length ?? 0}`);
          }
        }

        // Update item totals (non-tracked only; tracked derives qty from sub-items via recompute)
        if (!item.trackIndividually) {
          await tx.item.update({
            where: { id: item.id },
            data: {
              totalQty: { increment: ri.quantity },
              availableQty: { increment: ri.quantity },
            },
          });
        }

        // Sub-items for tracked durables — check duplicates first
        if (item.trackIndividually && ri.subCodes?.length) {
          const existing = await tx.subItem.findMany({
            where: { itemId: item.id, subCode: { in: ri.subCodes } },
            select: { subCode: true },
          });
          if (existing.length > 0) {
            const dupes = existing.map((s) => s.subCode).join(", ");
            throw new Error(`รหัสย่อยซ้ำสำหรับ ${item.name}: ${dupes}`);
          }

          for (const subCode of ri.subCodes) {
            await tx.subItem.create({
              data: {
                itemId: item.id,
                subCode,
                status: "AVAILABLE",
              },
            });
          }
          // Qty derived from sub-items — recompute instead of manual increment
          await recomputeItemCounts(tx, item.id);
        }

        // Create ReceiveRecord
        const record = await tx.receiveRecord.create({
          data: {
            itemId: item.id,
            lotId,
            quantity: ri.quantity,
            receivedBy: auth.user.userId,
            notes: notes ?? undefined,
          },
        });
        ids.push(record.id);
      }

      return ids;
    });

    return NextResponse.json({ success: true, count: recordIds.length, ids: recordIds }, { status: 201 });
  } catch (err) {
    return handleError(err, "Receive failed");
  }
}
