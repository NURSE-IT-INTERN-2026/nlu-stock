import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, handleError } from "@/lib/api-utils";
import { recomputeItemCounts } from "@/lib/stock";
import { receiveRequestSchema } from "@/lib/validators";

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

        if (!item) throw new Error(`Item ${ri.itemId} not found`);

        const isConsumable = item.category.profile?.dispenseType === "CONSUMABLE";

        // Enforce lotNumber for consumable
        if (isConsumable && !ri.lotNumber?.trim()) {
          throw new Error(`Lot number is required for consumable item: ${item.code}`);
        }

        // Lot handling for consumable
        let lotId: string | undefined;
        if (isConsumable && ri.lotNumber) {
          const existingLot = await tx.lot.findUnique({
            where: { itemId_lotNumber: { itemId: item.id, lotNumber: ri.lotNumber } },
          });

          if (existingLot) {
            await tx.lot.update({
              where: { id: existingLot.id },
              data: {
                receivedQty: { increment: ri.quantity },
                remainingQty: { increment: ri.quantity },
                ...(ri.expiryDate && { expiryDate: new Date(ri.expiryDate) }),
              },
            });
            lotId = existingLot.id;
          } else {
            const newLot = await tx.lot.create({
              data: {
                itemId: item.id,
                lotNumber: ri.lotNumber,
                expiryDate: ri.expiryDate ? new Date(ri.expiryDate) : null,
                receivedQty: ri.quantity,
                remainingQty: ri.quantity,
              },
            });
            lotId = newLot.id;
          }
        }

        // Tracked durables must supply exactly one sub-code per copy
        if (item.trackIndividually) {
          if (!ri.subCodes?.length || ri.subCodes.length !== ri.quantity) {
            throw new Error(`${item.code}: tracked item needs ${ri.quantity} sub-code(s), got ${ri.subCodes?.length ?? 0}`);
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
            throw new Error(`Sub-codes already exist for ${item.code}: ${dupes}`);
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
