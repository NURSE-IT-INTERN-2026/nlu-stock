import assert from "node:assert/strict";
import { monthlyFlow, sparkStart, SPARK_MONTHS } from "./dashboard-kpis";

const now = new Date(2026, 7, 9); // ส.ค. 2569

assert.deepEqual(sparkStart(now), new Date(2026, 2, 1)); // มี.ค. — six months incl. current

const flow = monthlyFlow(
  [
    { at: new Date(2026, 2, 31), quantity: 5 }, // oldest bucket
    { at: new Date(2026, 6, 1), quantity: 10 }, // last month
    { at: new Date(2026, 6, 20), quantity: 2 },
    { at: new Date(2026, 7, 2), quantity: 7 }, // this month, two records
    { at: new Date(2026, 7, 8), quantity: 3 },
    { at: new Date(2026, 1, 28), quantity: 99 }, // before the window — must not land anywhere
    { at: new Date(2026, 8, 1), quantity: 99 }, // after it
  ],
  now,
);

assert.deepEqual(flow.spark, [5, 0, 0, 0, 12, 10]);
assert.equal(flow.spark.length, SPARK_MONTHS);
assert.equal(flow.thisMonthQty, 10);
assert.equal(flow.lastMonthQty, 12);
// ครั้ง counts records, not pieces — two dispenses of 7 and 3 are two, not ten.
assert.equal(flow.thisMonthCount, 2);

// A year boundary is the case a naive month-only index gets wrong: ม.ค. 2570 must land
// after ธ.ค. 2569, not wrap back to the start of the window.
const dec = monthlyFlow([{ at: new Date(2026, 11, 15), quantity: 4 }], new Date(2027, 0, 5));
assert.deepEqual(dec.spark, [0, 0, 0, 0, 4, 0]);
assert.equal(dec.lastMonthQty, 4);

console.log("dashboard-kpis: ok");
