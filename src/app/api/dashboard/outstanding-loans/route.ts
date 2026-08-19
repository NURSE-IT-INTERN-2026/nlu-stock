import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { recipientLabel, formatSubCode } from "@/lib/constants";
import { parseScope, scopeDispenseWhere } from "@/lib/dashboard-scope-where";

const TAKE = 6;

/**
 * รายการค้างคืน — what is still out, worst first.
 *
 * There is no ผู้ยืม column here and there is no ผู้ยืม field to fill one: the cart asks what
 * the stock is for, not whose name is on it (lib/constants recipientLabel). เหตุผล is what
 * takes its place, and it is the more useful half anyway — "ยืมไปสอน 001101" tells whoever
 * chases this where to go, which a name in a system with two staff accounts does not.
 *
 * Ordered by how overdue, not by date borrowed: the top of this list is a worklist.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const scope = parseScope(getSearchParams(request));
  const now = new Date();
  const where = { ...scopeDispenseWhere(scope), returnedAt: null };

  const [rows, total, overdue] = await Promise.all([
    prisma.dispenseRecord.findMany({
      where,
      // nulls last: a loan with no due date can never be overdue, so it must not sit above
      // one that is. Prisma sorts NULLs first on asc without this.
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { dispensedAt: "asc" }],
      take: TAKE,
      select: {
        id: true, quantity: true, resolvedQty: true, dispensedAt: true, dueAt: true,
        recipient: true, usageType: true, courseCode: true, usageNote: true, notes: true,
        item: { select: { id: true, code: true, name: true } },
        subItem: { select: { subCode: true } },
      },
    }),
    prisma.dispenseRecord.count({ where }),
    prisma.dispenseRecord.count({ where: { ...where, dueAt: { lt: now } } }),
  ]);

  return json({
    rows: rows.map((r) => ({
      id: r.id,
      itemId: r.item.id,
      name: r.item.name,
      code: r.subItem ? formatSubCode(r.item.code, r.subItem.subCode) : r.item.code,
      reason: recipientLabel(r),
      quantity: Math.max(0, r.quantity - r.resolvedQty),
      dispensedAt: r.dispensedAt.toISOString(),
      dueAt: r.dueAt?.toISOString() ?? null,
      // Computed here so every row is judged against one clock — a client that renders this
      // at midnight would otherwise disagree with the count in the same payload.
      overdueDays: r.dueAt && r.dueAt < now
        ? Math.floor((now.getTime() - r.dueAt.getTime()) / 86_400_000)
        : null,
    })),
    total,
    overdue,
  });
}
