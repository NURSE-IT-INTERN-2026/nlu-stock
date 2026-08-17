import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { parseScope, scopeItemWhere, scopeDispenseWhere } from "@/lib/dashboard-scope-where";

const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/**
 * ออก vs กลับ per month for ยืม (ยืมออก / คืนแล้ว) and นำไปใช้งาน (นำออกใช้ / นำกลับคลัง).
 *
 * Counted in ครั้ง. The gap between the two lines is the point of the chart: two lines that
 * track each other mean stock comes back, a widening gap means it does not — which a single
 * "ยืมออกเดือนนี้" number cannot show no matter how big it is printed.
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
      : { OR: [{ dispenseRecordId: null }, { dispenseRecord: { OR: [{ loanType: null }, { loanType: "BORROW" as const }] } }] };

  const [out, back] = await Promise.all([
    prisma.dispenseRecord.findMany({
      where: { ...scopeDispenseWhere(scope), dispensedAt: { gte: start } },
      select: { dispensedAt: true },
    }),
    prisma.returnRecord.findMany({
      where: { returnedAt: { gte: start }, item: scopeItemWhere(scope), ...returnLink },
      select: { returnedAt: true },
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
    if (b) b.out += 1;
  }
  for (const r of back) {
    const b = bucketOf(r.returnedAt);
    if (b) b.back += 1;
  }

  const rows = buckets.map(({ month, out, back }) => ({ month, out, back }));
  const totalOut = rows.reduce((n, r) => n + r.out, 0);
  const totalBack = rows.reduce((n, r) => n + r.back, 0);
  // Difference over the window, not the live outstanding count — a return of something
  // borrowed 13 months ago lands here without its ยืมออก, so this can read low. It is the
  // shape of the gap that matters; the exact ค้าง number is the KPI card's job.
  return json({ rows, totalOut, totalBack, gap: totalOut - totalBack });
}
