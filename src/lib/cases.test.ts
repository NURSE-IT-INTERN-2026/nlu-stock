import { test } from "node:test";
import assert from "node:assert/strict";
import { walkPieceCases, walkTrips, summariseCases, isOverdue, isTodo, caseRangeBounds, type CaseSummary, type CaseType } from "./cases";
import { formatCode } from "./case-codes";

const at = (day: number) => new Date(`2026-03-${String(day).padStart(2, "0")}T03:00:00Z`);

// Only the fields walkPieceCases reads matter; the rest is shape the DB always supplies.
type AnyLog = Parameters<typeof walkPieceCases>[0][number];
type AnyJob = Parameters<typeof walkPieceCases>[1][number];

const log = (id: string, sub: string, from: string, to: string, day: number): AnyLog => ({
  id, subItemId: sub, previousStatus: from, newStatus: to, reason: null, damageNote: null,
  repairVenue: null, repairNote: null, imageUrls: [], changedAt: at(day), fromReturnId: null,
  changer: { name: "Staff" },
  item: { id: "i1", code: "NLU-DUR-001", name: "Notebook", issueUnit: { name: "เครื่อง" } },
  subItem: { subCode: sub },
} as unknown as AnyLog);

const job = (id: string, sub: string, day: number, result = "AVAILABLE", cost: number | null = null): AnyJob => ({
  id, subItemId: sub, result, cost, issue: null, description: null, attachmentUrls: [],
  createdAt: at(day), performer: { name: "Tech" },
} as unknown as AnyJob);

test("one piece repaired twice becomes two cases", () => {
  const cases = walkPieceCases(
    [
      log("d1", "p1", "AVAILABLE", "DAMAGED", 1),
      log("s1", "p1", "DAMAGED", "UNDER_REPAIR", 2),
      log("d2", "p1", "AVAILABLE", "DAMAGED", 10),
      log("s2", "p1", "DAMAGED", "UNDER_REPAIR", 11),
    ],
    [job("j1", "p1", 3, "AVAILABLE", 100), job("j2", "p1", 12, "AVAILABLE", 250)],
  );
  assert.equal(cases.length, 2);
  assert.deepEqual(cases.map((c) => c.opener.id), ["d1", "d2"]);
  assert.deepEqual(cases.map((c) => c.closedByJob?.cost), [100, 250]);
});

test("a job on one copy never closes another copy's open case", () => {
  const cases = walkPieceCases(
    [
      log("d1", "p1", "AVAILABLE", "DAMAGED", 1),
      log("d2", "p2", "AVAILABLE", "DAMAGED", 2),
      log("s2", "p2", "DAMAGED", "UNDER_REPAIR", 3),
    ],
    [job("j2", "p2", 5)],
  );
  const p1 = cases.find((c) => c.opener.subItemId === "p1")!;
  const p2 = cases.find((c) => c.opener.subItemId === "p2")!;
  assert.equal(p1.closedByJob, null, "p1 is still open");
  assert.equal(p2.closedByJob?.id, "j2");
});

test("ชำรุด → พร้อมใช้งาน closes the case as cancelled, not repaired", () => {
  const [c] = walkPieceCases(
    [
      log("d1", "p1", "AVAILABLE", "DAMAGED", 1),
      log("c1", "p1", "DAMAGED", "AVAILABLE", 2),
    ],
    [],
  );
  assert.deepEqual(c.cancelledAt, at(2));
  assert.equal(c.closedByJob, null);
  assert.equal(c.sent.length, 0);
});

test("a cancelled case is not closed by a later unrelated job", () => {
  const cases = walkPieceCases(
    [
      log("d1", "p1", "AVAILABLE", "DAMAGED", 1),
      log("c1", "p1", "DAMAGED", "AVAILABLE", 2),
    ],
    [job("j1", "p1", 9)],
  );
  assert.equal(cases[0].closedByJob, null);
});

test("แก้ข้อมูลส่งซ่อม stacks onto the same case", () => {
  const [c] = walkPieceCases(
    [
      log("d1", "p1", "AVAILABLE", "DAMAGED", 1),
      log("s1", "p1", "DAMAGED", "UNDER_REPAIR", 2),
      log("s2", "p1", "UNDER_REPAIR", "UNDER_REPAIR", 4),
    ],
    [],
  );
  assert.deepEqual(c.sent.map((s) => s.id), ["s1", "s2"]);
  assert.equal(c.closedByJob, null, "still at the shop");
});

// ── เที่ยวส่งบำรุงรักษาภายนอก ─────────────────────────────────────────────────
type AnyTrip = Parameters<typeof walkTrips>[0][number];

const trip = (
  id: string, from: string, day: number,
  { closed = false, status = "PENDING_MAINTENANCE", sub = "p1" as string | null } = {},
): AnyTrip => ({
  id, subItemId: sub, previousStatus: from, repairNote: id, reason: null, imageUrls: [],
  changedAt: at(day), changer: { name: "Staff" },
  item: { id: "i1", code: "NLU-DUR-001", name: "Notebook", status: "AVAILABLE", issueUnit: { name: "เครื่อง" } },
  subItem: sub ? { subCode: sub, status } : null,
  closedByMaint: closed ? [{ id: "m1" }] : [],
} as unknown as AnyTrip);

test("แก้ข้อมูลส่งบำรุงรักษา stacks onto the same trip", () => {
  const [t] = walkTrips([
    trip("s1", "AVAILABLE", 1),
    trip("e1", "PENDING_MAINTENANCE", 2),
    trip("e2", "PENDING_MAINTENANCE", 3),
  ]);
  assert.equal(t.opener.id, "s1");
  assert.deepEqual(t.edits.map((e) => e.id), ["e1", "e2"], "การแก้ไม่ใช่การส่งรอบใหม่");
});

test("เที่ยวที่มีใบบันทึกผลผูกอยู่แล้วไม่ค้างอยู่ในกองที่ต้องทำ", () => {
  assert.deepEqual(walkTrips([trip("s1", "AVAILABLE", 1, { closed: true })]), []);
});

test("ของที่กลับมาแล้วแต่ใบเก่าไม่ได้ผูกไว้ ก็ไม่ค้าง", () => {
  // แถวก่อนมีคอลัมน์ผูก: ไม่มีใบบันทึกผลชี้กลับมา สถานะปัจจุบันจึงเป็นตัวตัดสิน
  assert.deepEqual(walkTrips([trip("s1", "AVAILABLE", 1, { status: "AVAILABLE" })]), []);
});

test("ส่งซ้ำหลังรับคืน = คนละเที่ยว", () => {
  const trips = walkTrips([
    trip("s1", "AVAILABLE", 1, { closed: true }),
    trip("e1", "PENDING_MAINTENANCE", 2),
    trip("s2", "AVAILABLE", 10),
  ]);
  assert.deepEqual(trips.map((t) => t.opener.id), ["s2"], "เที่ยวแรกปิดไปแล้ว");
  assert.deepEqual(trips[0].edits, [], "แถวแก้ของเที่ยวเก่าไม่ตกมาที่เที่ยวใหม่");
});

test("เที่ยวเก่าที่ backfill ผูกไม่ได้ ไม่โผล่ซ้ำกับเที่ยวที่เปิดอยู่จริง", () => {
  // s1 กลับมานานแล้วแต่ไม่มีใบผูก (แถวก่อนมีคอลัมน์ sentLogId) — ตัวที่ออกไปข้างนอกตอนนี้คือ s2.
  // สถานะที่อ่านได้เป็นของชิ้น ไม่ใช่ของเที่ยว จึงตัดสินได้แค่เที่ยวล่าสุดเท่านั้น
  const trips = walkTrips([
    trip("s1", "AVAILABLE", 1),
    trip("s2", "AVAILABLE", 10),
  ]);
  assert.deepEqual(trips.map((t) => t.opener.id), ["s2"], "ชิ้นเดียวมีเที่ยวเปิดได้ทีละใบ");
});

test("case code pads to four digits", () => {
  assert.equal(formatCode("RC", 2569, 142), "RC-2569-0142");
  assert.equal(formatCode("BR", 2569, 7), "BR-2569-0007");
});

// ── summariseCases ────────────────────────────────────────────────────────────
// เคสยืม/ตั้งใช้ไม่มีวันมีราคา การนับมันเข้าตัวหารทำให้การ์ดอ่านว่า "กรอกราคาแล้ว 0.4%" ตลอดกาล
const summaryRow = (type: CaseType, extra: Partial<CaseSummary> = {}): CaseSummary => ({
  id: `${type}:x`, type, code: "", state: "OPEN", statusLabel: "", subject: "", title: "",
  itemId: "i", itemCode: "C", subCode: null, qty: 1, unit: "ชิ้น", cost: null, dueAt: null,
  openedAt: at(1), updatedAt: at(1), openedBy: "u", ...extra,
});

test("summariseCases counts service money against ซ่อม+บำรุง only", () => {
  const totals = summariseCases([
    summaryRow("REPAIR", { cost: 1_000 }),
    summaryRow("MAINTENANCE", { cost: 500 }),
    summaryRow("REPAIR"),          // ยังไม่กรอกราคา — อยู่ในตัวหาร ไม่อยู่ในยอด
    summaryRow("BORROW"),          // ไม่มีวันมีราคา
    summaryRow("INUSE"),
  ]);
  assert.equal(totals.serviceCost, 1_500);
  assert.equal(totals.servicePriced, 2);
  assert.equal(totals.serviceCases, 3, "ยืม/ตั้งใช้ ต้องไม่อยู่ในตัวหาร");
});

test("summariseCases keeps lost value apart from repair spend", () => {
  const totals = summariseCases([
    summaryRow("REPAIR", { cost: 900 }),
    summaryRow("LOST", { qty: 2, lostValue: { amount: 400, exact: true } }),
    summaryRow("LOST", { qty: 3, lostValue: { amount: 150, exact: false } }),
    summaryRow("LOST", { qty: 1, lostValue: { amount: null, exact: false } }),
  ]);
  assert.equal(totals.serviceCost, 900, "เงินที่จ่ายซ่อมกับเงินที่หายไปบวกกันไม่ได้");
  assert.equal(totals.lostValue, 550);
  assert.equal(totals.lostUnits, 6, "นับหน่วยที่หาย ไม่ใช่จำนวนเคส");
  assert.equal(totals.lostCases, 3);
  assert.equal(totals.lostPriced, 2, "เคสที่ไม่มีราคาเลยต้องไม่นับว่าตีราคาได้");
  assert.equal(totals.lostExact, 1, "เท่ากับ lostPriced เมื่อไหร่ ยอดถึงจะเลิกเป็นประมาณการ");
});

test("summariseCases counts only what is still lost", () => {
  const totals = summariseCases([
    summaryRow("LOST", { qty: 2, lostValue: { amount: 400, exact: true } }),
    // ตามของกลับมาได้แล้ว — ไม่ใช่ความเสียหาย และต้องหลุดออกจากทุกช่องของก้อนนี้
    summaryRow("LOST", { state: "DONE", qty: 5, lostValue: { amount: 999, exact: true } }),
  ]);
  assert.equal(totals.lostCases, 1);
  assert.equal(totals.lostUnits, 2);
  assert.equal(totals.lostValue, 400, "ของที่เรียกคืนแล้วต้องไม่ค้างอยู่ในยอดความเสียหาย");
});

// ── worklist ──────────────────────────────────────────────────────────────────
const past = new Date(Date.now() - 86_400_000);
const future = new Date(Date.now() + 86_400_000);

test("isOverdue needs a due date AND an open case", () => {
  assert.equal(isOverdue({ dueAt: past, state: "OPEN" }), true);
  assert.equal(isOverdue({ dueAt: future, state: "OPEN" }), false);
  assert.equal(isOverdue({ dueAt: past, state: "DONE" }), false, "คืนช้าแต่คืนแล้ว ไม่มีใครรออยู่");
  assert.equal(isOverdue({ dueAt: null, state: "OPEN" }), false, "ไม่มีกำหนด = เกินไม่ได้");
});

test("isTodo takes borrows only once they are late", () => {
  assert.equal(isTodo(summaryRow("BORROW", { dueAt: past })), true);
  assert.equal(isTodo(summaryRow("BORROW", { dueAt: future })), false, "ยังไม่ถึงกำหนด ไม่ใช่งานค้าง");
  assert.equal(isTodo(summaryRow("BORROW")), false, "ยืมที่ไม่ได้ตั้งกำหนดไว้ ไม่มีอะไรให้เกิน");
});

test("isTodo leaves ตั้งใช้ในห้อง out however long it has been open", () => {
  assert.equal(isTodo(summaryRow("INUSE")), false);
  assert.equal(isTodo(summaryRow("INUSE", { dueAt: past })), false, "ประเภทเป็นตัวตัด ไม่ใช่วันที่");
});

test("isTodo keeps open repairs and losses, drops closed ones", () => {
  assert.equal(isTodo(summaryRow("REPAIR")), true);
  assert.equal(isTodo(summaryRow("LOST")), true);
  assert.equal(isTodo(summaryRow("REPAIR", { state: "DONE" })), false);
  assert.equal(isTodo(summaryRow("REPAIR", { state: "CANCELLED" })), false, "ยกเลิกคำขอแล้วไม่มีใครต้องทำอะไร");
});

test("summariseCases reports zeros rather than NaN when nothing matches", () => {
  const totals = summariseCases([]);
  assert.equal(totals.serviceCases, 0);
  assert.equal(totals.serviceCost, 0);
  assert.equal(totals.lostCases, 0);
  assert.equal(totals.lostValue, 0);
});

test("caseRangeBounds closes a finished year but leaves the rolling ranges open-ended", () => {
  // ปีที่จบไปแล้วต้องมีเพดาน — ไม่มี `to` แล้ว "พ.ศ. 2568" จะอ่านว่า "ตั้งแต่ 2568 เป็นต้นมา"
  // ซึ่งเป็นคนละตัวกรอง และจะลากงานของปีนี้เข้ามาทั้งกอง
  const y = caseRangeBounds("y2025");
  assert.deepEqual(y.from, new Date(2025, 0, 1));
  assert.deepEqual(y.to, new Date(2026, 0, 1)); // exclusive — listCases ใช้ lt

  // "90 วันล่าสุด" จบที่ตอนนี้โดยนิยาม การใส่เพดานให้มันคือการตัดของที่เพิ่งเกิดทิ้ง
  assert.equal(caseRangeBounds("90d").to, undefined);
  assert.notEqual(caseRangeBounds("90d").from, undefined);

  // ค่าที่ไม่รู้จัก (bookmark เก่า) = ไม่กรอง ไม่ใช่ error
  assert.deepEqual(caseRangeBounds("all"), {});
  assert.deepEqual(caseRangeBounds(null), {});
  assert.deepEqual(caseRangeBounds("y20xx"), {});
});
