import { test, expect } from "./fixtures";

// The dashboard answers "ค้างเท่าไร" from two different places, and they used to disagree.
//
// /tab-summary reads the OPEN dispense rows and sums what is left on each
// (quantity − resolvedQty). /flow-monthly and /station-by-room walk the ledger instead —
// everything that went out minus everything that came back. Two ways to the same pile, so a
// mismatch means one of them changed unit, window or predicate without the other.
//
// This is the shape of every bug this file was written after: a ครั้ง count printed beside a
// ชิ้น count, a 12-month window subtracted without its opening balance, a groupBy counting
// rows where the card counted pieces. None of it is visible in a screenshot — the numbers
// render fine, they are just different — so it is asserted here rather than in a snapshot.

/** `outstanding` from the KPI cards, for one tab. */
async function kpiOutstanding(request: import("@playwright/test").APIRequestContext, tab: string) {
  const res = await request.get(`/api/dashboard/tab-summary?tab=${tab}`);
  expect(res.ok(), `tab-summary?tab=${tab} → ${res.status()}`).toBeTruthy();
  return (await res.json()).outstanding as number;
}

test("แนวโน้มยืม-คืน: จุดสุดท้ายของเส้นค้างสะสม = KPI ค้างยังไม่คืน", async ({ request }) => {
  const res = await request.get("/api/dashboard/flow-monthly?tab=borrow");
  expect(res.ok(), `flow-monthly → ${res.status()}`).toBeTruthy();
  const { rows, outstanding } = await res.json();

  expect(rows).toHaveLength(12);
  // The running balance is a level, so it can sit at zero but never below it: a negative
  // point means the opening balance was dropped and the window is subtracting returns whose
  // loans predate it — which is exactly what printed "ค้างสะสม -48".
  for (const r of rows) {
    expect(r.outstanding, `${r.month} ติดลบ`).toBeGreaterThanOrEqual(0);
  }
  expect(rows[rows.length - 1].outstanding).toBe(outstanding);
  expect(outstanding).toBe(await kpiOutstanding(request, "borrow"));
});

test("ตอนนี้ของอยู่ที่ไหน: ยอดรวมทุกห้อง = KPI กำลังใช้งานอยู่", async ({ request }) => {
  const res = await request.get("/api/dashboard/station-by-room?tab=inuse");
  expect(res.ok(), `station-by-room → ${res.status()}`).toBeTruthy();
  const { rows, total } = await res.json();

  expect(total).toBe(rows.length);
  const units = rows.reduce((n: number, r: { units: number }) => n + r.units, 0);
  expect(units).toBe(await kpiOutstanding(request, "inuse"));
});
