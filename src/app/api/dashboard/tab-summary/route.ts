import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { parseScope, scopeItemWhere, scopeDispenseWhere, type DashboardScope } from "@/lib/dashboard-scope-where";

/**
 * The four KPI cards of ยืม / นำไปใช้งาน. One route, because the two tabs ask the same shape
 * of question — how many events this month, how much is still out there, and what is overdue.
 *
 * Unit rule for the whole dashboard: **cards count things (ชิ้น), charts count events (ครั้ง)**.
 * "ค้างยังไม่คืน 23 ครั้ง" does not help anyone go and fetch anything; the outstanding number
 * has to be in the unit of what is physically missing from the shelf.
 *
 * Outstanding is `quantity - resolvedQty`, never `quantity`: a 12-chair loan with 8 chairs
 * back is 4 chairs missing, and the row stays open until the last one lands.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const scope = parseScope(getSearchParams(request));
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const where = scopeDispenseWhere(scope);
  const open = { ...where, returnedAt: null };

  const [thisMonth, openRows, extra] = await Promise.all([
    prisma.dispenseRecord.count({ where: { ...where, dispensedAt: { gte: startOfMonth } } }),
    prisma.dispenseRecord.findMany({
      where: open,
      select: { quantity: true, resolvedQty: true, dueAt: true, locationId: true },
    }),
    scope.kind === "inuse" ? maintenanceOverdue(scope) : onTimeRate(where),
  ]);

  const outstanding = openRows.reduce((n, r) => n + Math.max(0, r.quantity - r.resolvedQty), 0);

  if (scope.kind === "inuse") {
    return json({
      thisMonth,
      outstanding,
      // Rooms with something still standing in them. A record whose room was never named
      // (legacy) is real stock in an unknown place, so it counts as its own "จุด".
      locations: new Set(openRows.map((r) => r.locationId ?? "unlocated")).size,
      maintenanceOverdue: extra as number,
    });
  }

  const overdue = openRows.reduce(
    (n, r) => (r.dueAt && r.dueAt < now ? n + Math.max(0, r.quantity - r.resolvedQty) : n),
    0,
  );
  return json({ thisMonth, outstanding, overdue, onTimeRate: extra as number | null });
}

/**
 * คืนตรงเวลา — the one number on the page that says whether the ยืม–คืน loop is working at
 * all, rather than how busy it was. Only loans that were given a due date and have come back
 * can be judged; null when there is nothing to judge yet, so the card can say so instead of
 * printing a confident 0%.
 */
async function onTimeRate(where: object): Promise<number | null> {
  const rows = await prisma.dispenseRecord.findMany({
    where: { ...where, returnedAt: { not: null }, dueAt: { not: null } },
    select: { returnedAt: true, dueAt: true },
  });
  if (rows.length === 0) return null;
  const onTime = rows.filter((r) => r.returnedAt! <= r.dueAt!).length;
  return Math.round((onTime / rows.length) * 100);
}

/**
 * ของที่ตั้งใช้งานอยู่และเลยกำหนดตรวจสอบ — not every overdue piece in the warehouse, only the
 * ones sitting in a room right now. Those are the ones somebody has to walk out and find;
 * the rest are on the shelf and /alerts already lists them.
 *
 * Tracked copies carry their own schedule (SubItem), flat items carry it on the item — the
 * same two shapes lib/alerts getAlertCounts counts, kept in step deliberately.
 */
async function maintenanceOverdue(scope: DashboardScope): Promise<number> {
  const now = new Date();
  const item = scopeItemWhere(scope);
  const stationed = { some: { returnedAt: null, loanType: "INUSE" as const } };

  const [tracked, flat] = await Promise.all([
    prisma.subItem.count({
      where: {
        nextMaintenanceDate: { lt: now },
        status: { notIn: ["DISPOSED", "LOST"] },
        item: { ...item, isActive: true, trackIndividually: true, dispenseRecords: stationed },
      },
    }),
    prisma.item.count({
      where: {
        ...item,
        nextMaintenanceDate: { lt: now },
        isActive: true,
        trackIndividually: false,
        dispenseRecords: stationed,
      },
    }),
  ]);
  return tracked + flat;
}
