import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";

const receiveItemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(1),
  lotNumber: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  subCodes: z.array(z.string()).optional().nullable(),
});

const receiveRequestSchema = z.object({
  items: z.array(receiveItemSchema).min(1, "At least one item required"),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "INSTRUCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
          include: { category: true },
        });

        if (!item) throw new Error(`Item ${ri.itemId} not found`);

        const isConsumable = item.category.category === "CON" || item.category.category === "MED";

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
                quantity: { increment: ri.quantity },
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
                quantity: ri.quantity,
              },
            });
            lotId = newLot.id;
          }
        }

        // Update item totals
        await tx.item.update({
          where: { id: item.id },
          data: {
            totalQty: { increment: ri.quantity },
            availableQty: { increment: ri.quantity },
          },
        });

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
        }

        // Create ReceiveRecord
        const record = await tx.receiveRecord.create({
          data: {
            itemId: item.id,
            lotId,
            quantity: ri.quantity,
            receivedBy: session.userId,
            notes: notes ?? undefined,
          },
        });
        ids.push(record.id);
      }

      return ids;
    });

    return NextResponse.json({ success: true, count: recordIds.length, ids: recordIds }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Receive failed";
    console.error("Receive error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
