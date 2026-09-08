import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { parseScope, scopeItemWhere, scopeDispenseWhere } from "@/lib/dashboard-scope-where";
import { LoanType } from "@/generated/prisma/enums";

const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/**
 * ออก vs กลับ per month for ยืม (ยืมออก / คืนแล้ว) and นำไปใช้งาน (นำออกใช้ / นำกลับคลัง),
 * plus what is still out at the end of each month.
 *
 * Counted in ชิ้น (SUM quantity), not ครั้ง: a third of the loans here move more than one
 * piece and the biggest moves 20, so "40 ครั้ง" says nothing about how much stock left the
 * room. It is also what makes `outstanding` addable — see below.
 *
 * The gap between the two lines is the point of the chart: two lines that track each other
 * mean stock comes back, a widening gap means it does not — which a single "ยืมออกเดือนนี้"
 * number cannot show no matter how big it is printed.
 *
 * The return side reads ReturnRecord, not DispenseRecord.returnedAt, because a part return
 * leaves the dispense row open: a 12-chair loan with 8 chairs back has to show 8 coming home
 * in the month they came home. lib/returns logReturn writes one of these for every path that
 * closes a loan, INUSE included.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const scope = parseScope(getSearchParams(request));
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Rows whose dispenseRecordId was never set are legacy, and legacy means ยืม everywhere
  // else in the app (lib/returns, lib/alerts, lib/distribution) — so ยืม claims them and
  // นำไปใช้งาน does not, instead of both dropping them and the totals quietly under-counting.
  const returnLink =
    scope.kind === "inuse"
      ? { dispenseRecord: { loanType: "INUSE" as const } }
      : { OR: [{ dispenseRecordId: null }, { dispenseRecord: { loanType: { in: [LoanType.BORROW, LoanType.CONSUME] } } }] };

  const backWhere = { item: scopeItemWhere(scope), ...returnLink };

  // The two `lt: start` sums are the opening balance — everything dispensed before the window
  // minus everything returned before it. Without them the running total would start at 0 and
  // read as "nothing was out a year ago", and a return inside the window whose loan predates
  // it would drive the line negative. This is why the balance is carried rather than derived
  // from the 12 visible months.
  const [out, back, outBefore, backBefore] = await Promise.all([
    prisma.dispenseRecord.findMany({
      where: { ...scopeDispenseWhere(scope), dispensedAt: { gte: start } },
      select: { dispensedAt: true, quantity: true },
    }),
    prisma.returnRecord.findMany({
      where: { returnedAt: { gte: start }, ...backWhere },
      select: { returnedAt: true, quantity: true },
    }),
    prisma.dispenseRecord.aggregate({
      where: { ...scopeDispenseWhere(scope), dispensedAt: { lt: start } },
      _sum: { quantity: true },
    }),
    prisma.returnRecord.aggregate({
      where: { returnedAt: { lt: start }, ...backWhere },
      _sum: { quantity: true },
    }),
  ]);

  const buckets = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTH_LABELS[d.getMonth()], out: 0, back: 0 };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  const bucketOf = (d: Date) => byKey.get(`${d.getFullYear()}-${d.getMonth()}`);

  for (const r of out) {
    const b = bucketOf(r.dispensedAt);
    if (b) b.out += r.quantity;
  }
  for (const r of back) {
    const b = bucketOf(r.returnedAt);
    if (b) b.back += r.quantity;
  }

  // ค้าง is a level, not a flow: the running balance at each month end, which is the only
  // form of it that can be plotted beside ออก/กลับ and still be true.
  //
  // It tracks api/dashboard/tab-summary's `outstanding` but is not guaranteed to equal it —
  // this is a ledger (dispensed minus returned), that one counts what the open rows still owe.
  // They agree only while every ReturnRecord is linked to a dispense and the returns of a
  // closed row sum to its quantity. Two things can break that: `returnLink` above admits
  // returns with no dispenseRecordId (lib/returns resolveSubItemReturn writes one when a
  // piece is on loan with no open record), which subtract here with nothing on the out side;
  // and closeOpenLoan's `Math.max(quantity - resolvedQty, 1)` floor can log a unit the KPI
  // never counted. Both currently produce no rows. Read the KPI card for the exact ค้าง.
  let balance = (outBefore._sum.quantity ?? 0) - (backBefore._sum.quantity ?? 0);
  const rows = buckets.map(({ month, out, back }) => {
    balance += out - back;
    return { month, out, back, outstanding: balance };
  });
  const totalOut = rows.reduce((n, r) => n + r.out, 0);
  const totalBack = rows.reduce((n, r) => n + r.back, 0);
  return json({ rows, totalOut, totalBack, outstanding: balance });
}
