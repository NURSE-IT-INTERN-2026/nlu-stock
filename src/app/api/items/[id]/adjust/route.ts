import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, error, parseBody, forbidden } from "@/lib/api-utils";
import { stockAdjustSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return forbidden();

  const { id } = await params;
  const { data, error: parseError } = await parseBody(stockAdjustSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({ where: { id } });
    if (!item) throw new Error("NOT_FOUND");

    if (data.newQty === item.availableQty) throw new Error("SAME_QTY");

    const adjustment = await tx.stockAdjustment.create({
      data: {
        itemId: id,
        previousQty: item.availableQty,
        newQty: data.newQty,
        reason: data.reason,
        notes: data.notes,
        adjustedBy: auth.user.userId,
        imageEvidence: data.imageEvidence,
      },
    });

    const diff = data.newQty - item.availableQty;
    await tx.item.update({
      where: { id },
      data: {
        availableQty: data.newQty,
        totalQty: item.totalQty + diff,
      },
    });

    await tx.itemStatusLog.create({
      data: {
        itemId: id,
        previousStatus: item.status,
        newStatus: item.status,
        reason: `Stock adjusted: ${item.availableQty} → ${data.newQty} (${data.reason})`,
        changedBy: auth.user.userId,
      },
    });

    return adjustment;
  }).catch((e: Error) => {
    if (e.message === "NOT_FOUND") return null;
    if (e.message === "SAME_QTY") return "SAME_QTY";
    throw e;
  });

  if (result === null) return notFound("Item not found");
  if (result === "SAME_QTY") return error("New quantity is the same as current");

  return json(result, 201);
}
