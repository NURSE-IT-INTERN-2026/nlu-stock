import { test } from "node:test";
import assert from "node:assert/strict";
import { groupTimelineCases, type Booking, type TripStep } from "./timeline-cases";

const at = (day: number) => new Date(`2026-01-${String(day).padStart(2, "0")}T03:00:00Z`);

const step = (id: string, type: string, day: number, extra: Partial<TripStep> = {}): TripStep => ({
  id, type, date: at(day), qty: null, details: {}, ...extra,
});

// events are newest-first everywhere, same as the route hands them over.
const desc = (rows: TripStep[]) => [...rows].sort((a, b) => b.date.getTime() - a.date.getTime());

test("qty trip folds แจ้งชำรุด + ส่งซ่อม + รับคืน into one unit", () => {
  const events = desc([
    step("book1", "DAMAGE_REPORT", 2, { qty: 47 }),
    step("sent1", "REPAIR_SENT", 5, { qty: 47 }),
    step("recv1", "RECEIVE", 20, { qty: 45, cost: 1200 }),
    step("dispense", "DISPENSE", 10, { qty: 20 }),
  ]);
  const bookings = new Map<string, Booking>([["book1", { openedAt: at(2), closedAt: at(20), qty: 47 }]]);
  const units = groupTimelineCases(events, bookings, new Map([["book1", "recv1"]]));

  assert.equal(units.length, 2, "one trip + the unrelated dispense");
  const trip = units.find((u) => "steps" in u);
  assert.ok(trip && "steps" in trip);
  // Oldest first — the card is read as a sequence, not as the ledger it was cut from.
  assert.deepEqual(trip.steps.map((s) => s.id), ["book1", "sent1", "recv1"]);
  assert.equal(trip.done, true);
  assert.equal(trip.cost, 1200);
  assert.equal(trip.qty, 47, "the trip is about what it opened with, not what came back");
});

test("an open trip has no closedAt and still groups", () => {
  const events = desc([
    step("book1", "DAMAGE_REPORT", 2, { qty: 5 }),
    step("sent1", "REPAIR_SENT", 5, { qty: 5 }),
  ]);
  const bookings = new Map<string, Booking>([["book1", { openedAt: at(2), closedAt: null, qty: 5 }]]);
  const [trip] = groupTimelineCases(events, bookings, new Map());
  assert.ok("steps" in trip);
  assert.equal(trip.done, false);
  assert.equal(trip.closedAt, null);
});

test("ส่งซ่อม under two simultaneously open bookings of the same qty stays standalone", () => {
  const events = desc([
    step("bookA", "DAMAGE_REPORT", 1, { qty: 3 }),
    step("bookB", "DAMAGE_REPORT", 2, { qty: 3 }),
    step("sent?", "REPAIR_SENT", 5, { qty: 3 }),
  ]);
  const bookings = new Map<string, Booking>([
    ["bookA", { openedAt: at(1), closedAt: null, qty: 3 }],
    ["bookB", { openedAt: at(2), closedAt: null, qty: 3 }],
  ]);
  const units = groupTimelineCases(events, bookings, new Map());
  // Both bookings are lone rows (no trip), and the ส่งซ่อม is not guessed into either.
  assert.equal(units.length, 3);
  assert.ok(units.every((u) => !("steps" in u)));
});

test("qty differentiates two open bookings", () => {
  const events = desc([
    step("bookA", "DAMAGE_REPORT", 1, { qty: 3 }),
    step("bookB", "DAMAGE_REPORT", 2, { qty: 8 }),
    step("sent8", "REPAIR_SENT", 5, { qty: 8 }),
  ]);
  const bookings = new Map<string, Booking>([
    ["bookA", { openedAt: at(1), closedAt: null, qty: 3 }],
    ["bookB", { openedAt: at(2), closedAt: null, qty: 8 }],
  ]);
  const trip = groupTimelineCases(events, bookings, new Map()).find((u) => "steps" in u);
  assert.ok(trip && "steps" in trip);
  assert.deepEqual(trip.steps.map((s) => s.id).sort(), ["bookB", "sent8"]);
});

test("a tracked piece's two repairs stay two trips", () => {
  const d = { subItemId: "piece1" };
  const events = desc([
    step("dmg1", "STATUS_CHANGE", 1, { details: { ...d, newStatus: "DAMAGED" } }),
    step("snt1", "REPAIR_SENT", 2, { details: d }),
    step("ret1", "REPAIR_RETURN", 3, { details: d, cost: 100 }),
    step("dmg2", "STATUS_CHANGE", 8, { details: { ...d, newStatus: "DAMAGED" } }),
    step("snt2", "REPAIR_SENT", 9, { details: d }),
    step("ret2", "REPAIR_RETURN", 10, { details: d, cost: 250 }),
  ]);
  const trips = groupTimelineCases(events, new Map(), new Map()).filter((u) => "steps" in u);
  assert.equal(trips.length, 2);
  assert.deepEqual(trips.map((t) => t.steps.length), [3, 3]);
  assert.deepEqual(trips.map((t) => t.cost), [250, 100], "newest trip first");
});

test("a legacy trip closes on the booking's recoveredAt even with no linkable closing row", () => {
  // repairBookingId is null on every row written before that column existed, so the รับคืนจากซ่อม
  // adjustment cannot be tied back — but the booking itself was stamped recoveredAt.
  const events = desc([
    step("book1", "DAMAGE_REPORT", 2, { qty: 35 }),
    step("sent1", "REPAIR_SENT", 3, { qty: 35 }),
  ]);
  const bookings = new Map<string, Booking>([["book1", { openedAt: at(2), closedAt: at(9), qty: 35 }]]);
  const [trip] = groupTimelineCases(events, bookings, new Map());
  assert.ok("steps" in trip);
  assert.equal(trip.done, true, "the booking says it was recovered");
  assert.deepEqual(trip.closedAt, at(9));
});

test("a lone แจ้งชำรุด with nothing after it is not boxed as a trip", () => {
  const events = [step("book1", "DAMAGE_REPORT", 2, { qty: 1 })];
  const bookings = new Map<string, Booking>([["book1", { openedAt: at(2), closedAt: null, qty: 1 }]]);
  const [only] = groupTimelineCases(events, bookings, new Map());
  assert.ok(!("steps" in only));
});

// เกณฑ์สองขั้นตอนกันการเดาผิดของงานซ่อม ไม่ใช่กติกาสากล: การยืมที่ยังไม่มีใครคืนสักชิ้นคือใบที่
// คนตามหามากที่สุด และมันชี้เคสของตัวเองมาแล้ว จึงต้องเป็นการ์ดตั้งแต่แถวแรก.
test("a known case is a card from its first step, unlike a guessed repair trip", () => {
  const events = [step("disp1", "BORROW", 2, { qty: 6 })];
  const [only] = groupTimelineCases(events, new Map(), new Map(), (e) =>
    e.id === "disp1" ? { key: "disp1", type: "BORROW", done: false } : null);
  assert.ok("steps" in only);
  assert.equal(only.caseType, "BORROW");
  assert.equal(only.done, false);
  assert.deepEqual(only.steps.map((s) => s.id), ["disp1"]);
});

test("เบิกใช้ closes on its own row — one step, done", () => {
  const events = [step("disp2", "DISPENSE", 3, { qty: 2 })];
  const [only] = groupTimelineCases(events, new Map(), new Map(), () =>
    ({ key: "disp2", type: "DISPENSE", done: true }));
  assert.ok("steps" in only);
  assert.equal(only.done, true);
});
