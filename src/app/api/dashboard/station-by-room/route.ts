import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { locationLabel } from "@/lib/constants";
import { parseScope, scopeDispenseWhere } from "@/lib/dashboard-scope-where";

/**
 * ครุภัณฑ์ที่ตั้งใช้งานอยู่ตอนนี้ แยกตามห้อง. A durable item has no monthly flow worth
 * charting — what it has is "ชิ้นไหนอยู่ไหน ทำอะไรอยู่", and that is this.
 *
 * Counted off open DispenseRecords (loanType INUSE, returnedAt null) rather than
 * SubItem.status IN_USE: the room lives on the record's locationId, so the status column
 * knows a piece is stationed but not where. Same source as lib/distribution.ts.
 *
 * Rows written before locationId was required still exist with NULL and a free-text room in
 * notes; they get one honest "ไม่ระบุที่ตั้ง" bar instead of vanishing from the total.
 *
 * Counted in ชิ้น, not ครั้ง. "อะไรอยู่ห้องไหน" is a question about stock, and one record can
 * station 20 pieces — a count of records answers how many times someone filled a form. It is
 * also the unit tab-summary's `outstanding` and the flow chart already speak, so the tab does
 * not print two different sizes for the same pile.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const scope = scopeDispenseWhere(parseScope(getSearchParams(request)));

  // No loanType here: the นำไปใช้งาน tab's scope already carries it, and repeating the
  // predicate is how the two eventually disagree.
  const groups = await prisma.dispenseRecord.groupBy({
    by: ["locationId"],
    where: { ...scope, returnedAt: null },
    // quantity minus resolvedQty, summed separately because groupBy cannot subtract: a
    // part-returned record still stands in the room for what is left of it.
    _sum: { quantity: true, resolvedQty: true },
  });

  const locations = await prisma.location.findMany({
    where: { id: { in: groups.map((g) => g.locationId).filter((id): id is string => !!id) } },
    select: { id: true, building: true, floor: true, room: true, detail: true },
  });
  const byId = new Map(locations.map((l) => [l.id, l]));

  const rows = groups
    .map((g) => {
      const loc = g.locationId ? byId.get(g.locationId) : undefined;
      return {
        locationId: g.locationId,
        label: loc ? locationLabel(loc) : "ไม่ระบุที่ตั้ง",
        units: Math.max((g._sum.quantity ?? 0) - (g._sum.resolvedQty ?? 0), 0),
      };
    })
    .filter((r) => r.units > 0)
    .sort((a, b) => b.units - a.units || a.label.localeCompare(b.label, "th"));

  // The chart shows a top slice; `total` lets it say "แสดง 5 จาก N จุด" rather than let a
  // reader assume the five bars are every room stock is sitting in.
  return json({ rows, total: rows.length });
}
