import { test } from "node:test";
import assert from "node:assert/strict";
import { walkPieceCases, walkKitChecks } from "./cases";
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

test("case code pads to four digits", () => {
  assert.equal(formatCode("RC", 2569, 142), "RC-2569-0142");
  assert.equal(formatCode("BR", 2569, 7), "BR-2569-0007");
});

// ── KC ตรวจชุด ────────────────────────────────────────────────────────────────
type AnyRet = Parameters<typeof walkKitChecks>[0][number];
type AnyClose = Parameters<typeof walkKitChecks>[1][number];

const ret = (id: string, sub: string, day: number): AnyRet => ({
  id, subItemId: sub, returnedAt: at(day), returner: { name: "Admin" },
  item: { id: "k1", code: "NLU-KIT-001", name: "ชุดทำแผล", issueUnit: { name: "ชุด" } },
  subItem: { subCode: sub },
} as unknown as AnyRet);

const close = (id: string, sub: string, day: number, reason = "ตรวจชุด NLU-KIT-001-C04 — ของครบ", status = "AVAILABLE"): AnyClose => ({
  id, subItemId: sub, changedAt: at(day), reason, newStatus: status, changer: { name: "Staff" },
} as unknown as AnyClose);

test("คืน → ตรวจ → คืน → ตรวจ กลายเป็นสองเคสที่ปิดคนละครั้ง", () => {
  const cases = walkKitChecks(
    [ret("r1", "c04", 1), ret("r2", "c04", 10)],
    [close("k1", "c04", 3), close("k2", "c04", 12)],
  );
  assert.equal(cases.length, 2);
  assert.deepEqual(cases.map((c) => c.closer?.id), ["k1", "k2"]);
});

test("ชุดที่คืนแล้วยังไม่ตรวจ = เคสเปิดค้าง", () => {
  const [c] = walkKitChecks([ret("r1", "c04", 1)], []);
  assert.equal(c.closer, null);
  assert.equal(c.cancelled, false);
});

test("ยกเลิกชุด ปิดเคสได้ แต่ไม่ใช่ 'ตรวจแล้ว'", () => {
  const [c] = walkKitChecks(
    [ret("r1", "c04", 1)],
    [close("x1", "c04", 4, "ยกเลิกชุด NLU-KIT-001-C04", "DISPOSED")],
  );
  assert.equal(c.cancelled, true);
  assert.equal(c.closer?.id, "x1");
});

test("การตรวจของชุดหนึ่ง ไม่ปิดเคสค้างของอีกชุด", () => {
  const cases = walkKitChecks(
    [ret("r1", "c04", 1), ret("r2", "c05", 2)],
    [close("k5", "c05", 5)],
  );
  const c04 = cases.find((c) => c.opener.subItemId === "c04")!;
  const c05 = cases.find((c) => c.opener.subItemId === "c05")!;
  assert.equal(c04.closer, null, "c04 ยังรอตรวจ");
  assert.equal(c05.closer?.id, "k5");
});

test("การตรวจที่เกิดก่อนการคืน ไม่ถูกจับไปปิดการคืนนั้น", () => {
  const [c] = walkKitChecks([ret("r1", "c04", 10)], [close("k1", "c04", 2)]);
  assert.equal(c.closer, null, "ตรวจตอนวันที่ 2 ปิดการคืนวันที่ 10 ไม่ได้");
});
