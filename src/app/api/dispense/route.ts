import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { dispenseRequestSchema } from "@/lib/validators";
import { ItemStatus } from "@/generated/prisma/enums";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "INSTRUCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = dispenseRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { items, usageType, usageNote, notes } = parsed.data;

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
            category: true,
            lots: { where: { id: di.lotId ?? undefined } },
            subItems: { where: { id: di.subItemId ?? undefined } },
            issueUnit: true,
          },
        });

        if (!item) throw new Error(`Item ${di.itemId} not found`);

        // Validate quantity vs available
        if (item.trackIndividually && di.subItemId) {
          const sub = item.subItems[0];
          if (!sub) throw new Error(`Sub-item ${di.subItemId} not found`);
          if (sub.status !== ItemStatus.AVAILABLE) throw new Error(`Sub-item ${sub.subCode} is not available (status: ${sub.status})`);
        } else if (di.lotId) {
          const lot = item.lots[0];
          if (!lot) throw new Error(`Lot ${di.lotId} not found`);
          if (lot.quantity < di.quantity) throw new Error(`Lot ${lot.lotNumber} has only ${lot.quantity} ${item.issueUnit.name}, requested ${di.quantity}`);
        } else if (!item.trackIndividually) {
          if (item.availableQty < di.quantity) throw new Error(`${item.code} has only ${item.availableQty} available, requested ${di.quantity}`);
        }

        // Create DispenseRecord
        const record = await tx.dispenseRecord.create({
          data: {
            itemId: di.itemId,
            subItemId: di.subItemId ?? undefined,
            lotId: di.lotId ?? undefined,
            quantity: di.quantity,
            quantitySub: di.quantitySub,
            usageType: usageType ?? undefined,
            usageNote: usageNote ?? undefined,
            staffId: session.userId,
            notes: notes ?? undefined,
          },
        });
        ids.push(record.id);

        // Apply stock effects
        if (item.trackIndividually && di.subItemId) {
          // Tracked durable: update sub-item status
          const sub = item.subItems[0];
          await tx.subItem.update({
            where: { id: di.subItemId },
            data: { status: ItemStatus.CHECKED_OUT },
          });
          await tx.itemStatusLog.create({
            data: {
              itemId: di.itemId,
              subItemId: di.subItemId,
              previousStatus: sub.status,
              newStatus: ItemStatus.CHECKED_OUT,
              reason: "Dispensed",
              changedBy: session.userId,
            },
          });
        } else if (di.lotId) {
          // Consumable with lot: deduct lot + item availableQty (optimistic lock)
          const updated = await tx.lot.updateMany({
            where: { id: di.lotId, quantity: { gte: di.quantity } },
            data: { quantity: { decrement: di.quantity } },
          });
          if (updated.count === 0) {
            const lot = await tx.lot.findUnique({ where: { id: di.lotId } });
            throw new Error(`Lot ${lot?.lotNumber ?? di.lotId} has only ${lot?.quantity ?? 0} ${item.issueUnit.name}, requested ${di.quantity}`);
          }
          await tx.item.update({
            where: { id: di.itemId },
            data: { availableQty: { decrement: di.quantity } },
          });
        } else {
          // Non-tracked item: deduct item availableQty only
          await tx.item.update({
            where: { id: di.itemId },
            data: { availableQty: { decrement: di.quantity } },
          });
        }

        // KIT: deduct stock from linked component items
        if (item.category.category === "KIT") {
          const components = await tx.kitComponent.findMany({
            where: { kitId: item.id, isStockItem: true, itemId: { not: null } },
          });
          for (const comp of components) {
            if (comp.itemId) {
              const stockItem = await tx.item.findUnique({ where: { id: comp.itemId } });
              if (stockItem && stockItem.availableQty >= comp.quantity * di.quantity) {
                await tx.item.update({
                  where: { id: comp.itemId },
                  data: { availableQty: { decrement: comp.quantity * di.quantity } },
                });
              }
            }
          }
        }
      }

      return ids;
    });

    return NextResponse.json({ success: true, count: recordIds.length, ids: recordIds }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Dispense failed";
    console.error("Dispense error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
