import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, handleError } from "@/lib/api-utils";
import { recomputeItemCounts } from "@/lib/stock";
import { resolveSubItemReturn, type ReturnStatus } from "@/lib/returns";
import { AdjustmentReason } from "@/generated/prisma/enums";

const RETURN_STATUSES = ["AVAILABLE", "DAMAGED", "LOST"] as const;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(_req);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return forbidden();

  const { id: itemId } = await params;
  const body = await _req.json();

  const subItemId = body.subItemId as string | undefined;
  const dispenseRecordId = body.dispenseRecordId as string | undefined;
  const note = (body.note as string | undefined)?.trim() || null;
  const rawStatus = (body.status as string | undefined) ?? "AVAILABLE";
  if (!RETURN_STATUSES.includes(rawStatus as ReturnStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const status = rawStatus as ReturnStatus;
  const proofUrls = Array.isArray(body.proofUrls) ? (body.proofUrls as string[]).filter(Boolean) : undefined;

  try {
    await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item) throw new Error("Item not found");

      // Find the open dispense record this return/write-off resolves.
      const findOpenDispense = (subFilter: string | null) =>
        tx.dispenseRecord.findFirst({
          where: {
            ...(dispenseRecordId ? { id: dispenseRecordId } : {}),
            itemId,
            subItemId: subFilter,
            returnedAt: null,
          },
          orderBy: { dispensedAt: "desc" },
        });

      if (subItemId) {
        // ── Per-unit (ITEM type): flip sub-item status, resolve its dispense record ──
        await resolveSubItemReturn(tx, {
          itemId,
          subItemId,
          status,
          note,
          userId: auth.user.userId,
          dispenseRecordId,
          proofUrls,
        });
        // ponytail: tracked counts derive from sub-item statuses; no StockAdjustment needed for write-off.
        await recomputeItemCounts(tx, itemId);
      } else {
        // ── Count-based (COUNT type): resolve N units from an open dispense record ──
        const qty = Number(body.quantity);
        if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity required");

        const dispense = await findOpenDispense(null);
        if (!dispense) throw new Error("No open loan record found");

        const outstanding = dispense.quantity - dispense.resolvedQty;
        if (qty > outstanding) throw new Error(`Cannot resolve ${qty}, only ${outstanding} outstanding`);

        if (status === "AVAILABLE") {
          // Returned to usable stock
          await tx.item.update({ where: { id: itemId }, data: { availableQty: { increment: qty } } });
        } else {
          // Written off (lost / damaged): remove from total, log a stock adjustment.
          const reason = status === "LOST" ? AdjustmentReason.LOST : AdjustmentReason.DAMAGED_PENDING_REPAIR;
          await tx.item.update({ where: { id: itemId }, data: { totalQty: { decrement: qty } } });
          await tx.stockAdjustment.create({
            data: {
              itemId,
              delta: -qty,
              previousQty: item.totalQty,
              newQty: item.totalQty - qty,
              reason,
              notes: note,
              adjustedBy: auth.user.userId,
            },
          });
          // ponytail: no repair queue for COUNT stock — without per-piece identity there is
          // nothing to send to a shop or receive back. The StockAdjustment above is the record.
        }

        const newResolved = dispense.resolvedQty + qty;
        const returnCondition = status;
        await tx.dispenseRecord.update({
          where: { id: dispense.id },
          data: {
            resolvedQty: newResolved,
            returnedAt: newResolved >= dispense.quantity ? new Date() : undefined,
            returnCondition,
            ...(proofUrls && proofUrls.length > 0 ? { returnProofUrls: proofUrls } : {}),
          },
        });
        // COUNT items: re-derive status (back to AVAILABLE once available === total).
        await recomputeItemCounts(tx, itemId);
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err, "Return failed");
  }
}
