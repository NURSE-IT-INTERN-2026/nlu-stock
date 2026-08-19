// What an item's ประวัติ is guaranteed to show. No framework — run with: npm test
// Two rules meet here, and both fail silently rather than loudly when broken: a duplicated
// row just looks like sloppy data, and a swallowed row looks like the event never happened.
import assert from "node:assert";
import { isDuplicateOfLoanRow, isLoanEdge, returnLocationUpdate } from "@/lib/returns";
import { dispenseRequestSchema } from "@/lib/validators/dispense";
import { recipientLabel } from "@/lib/constants";
import { loanFields } from "@/lib/dispense-kind";
import type { ItemStatus } from "@/generated/prisma/enums";

// ── Loan edges are dropped: the เบิก / รับคืน row beside them already tells the story ──
// Going out (api/dispense writes the log next to a DispenseRecord).
assert.equal(isLoanEdge({ previousStatus: "AVAILABLE", newStatus: "ON_LOAN" }), true);
assert.equal(isLoanEdge({ previousStatus: "AVAILABLE", newStatus: "IN_USE" }), true);
// Coming back (closeOpenLoan / resolveSubItemReturn write the log next to a ReturnRecord).
assert.equal(isLoanEdge({ previousStatus: "ON_LOAN", newStatus: "AVAILABLE" }), true);
assert.equal(isLoanEdge({ previousStatus: "IN_USE", newStatus: "AVAILABLE" }), true);
assert.equal(isLoanEdge({ previousStatus: "ON_LOAN", newStatus: "LOST" }), true);
assert.equal(isLoanEdge({ previousStatus: "ON_LOAN", newStatus: "DAMAGED" }), true);
// api/items/[id]/adjust logs a no-move edge on a loaned item — still the same event.
assert.equal(isLoanEdge({ previousStatus: "ON_LOAN", newStatus: "ON_LOAN" }), true);

// ── Everything else must stay visible: nothing else writes a row in its place ──
assert.equal(isLoanEdge({ previousStatus: "AVAILABLE", newStatus: "DAMAGED" }), false, "แจ้งชำรุดต้องขึ้นประวัติ");
assert.equal(isLoanEdge({ previousStatus: "DAMAGED", newStatus: "UNDER_REPAIR" }), false, "ส่งซ่อมต้องขึ้นประวัติ");
assert.equal(isLoanEdge({ previousStatus: "UNDER_REPAIR", newStatus: "AVAILABLE" }), false, "รับซ่อมต้องขึ้นประวัติ");
assert.equal(isLoanEdge({ previousStatus: "AVAILABLE", newStatus: "LOST" }), false, "แจ้งสูญหายต้องขึ้นประวัติ");
assert.equal(isLoanEdge({ previousStatus: "LOST", newStatus: "AVAILABLE" }), false, "เรียกคืนของหายต้องขึ้นประวัติ");
assert.equal(isLoanEdge({ previousStatus: "AVAILABLE", newStatus: "DISPOSED" }), false, "ตัดจำหน่ายต้องขึ้นประวัติ");

// ── Returning a KIT set retires it. The รับคืน row says the set came back and nothing more,
// so the DISPOSED log is the only line saying the copy is gone — it survives the filter. ──
assert.equal(isDuplicateOfLoanRow({ previousStatus: "ON_LOAN", newStatus: "DISPOSED" }), false, "ชิ้นที่ออกจากชุดต้องขึ้นประวัติ");
assert.equal(isDuplicateOfLoanRow({ previousStatus: "AVAILABLE", newStatus: "DISPOSED" }), false, "ยกเลิกชุดต้องขึ้นประวัติ");
assert.equal(isDuplicateOfLoanRow({ previousStatus: "ON_LOAN", newStatus: "AVAILABLE" }), true, "คืนปกติยังซ้ำกับแถวรับคืน");

// ── Same-status rows are annotations, not transitions: judged on their reason ──
// Qty stock stamps its repair trip onto the item's own (unchanged) status. On an item that is
// ON_LOAN the loan test used to swallow every one of them, so ส่งซ่อม never reached the history.
assert.equal(
  isDuplicateOfLoanRow({ previousStatus: "ON_LOAN", newStatus: "ON_LOAN", reason: "ส่งซ่อมภายใน 5 ชิ้น · ร้าน ABC" }),
  false,
  "ส่งซ่อมของแบบนับจำนวนต้องขึ้นประวัติ แม้ของกำลังถูกยืม",
);
assert.equal(
  isDuplicateOfLoanRow({ previousStatus: "ON_LOAN", newStatus: "ON_LOAN", reason: "ยกเลิกคำขอชำรุด 5 ชิ้น · ตรวจแล้วใช้ได้" }),
  false,
  "ยกเลิกคำขอชำรุดต้องขึ้นประวัติ",
);
// The adjust mirror stays hidden — its StockAdjustment row prints the same numbers.
assert.equal(
  isDuplicateOfLoanRow({ previousStatus: "ON_LOAN", newStatus: "ON_LOAN", reason: "ปรับสต็อก: 76 → 71 บนชั้นวาง (รวม 163, ถูกเบิก 92)" }),
  true,
  "แถวคู่ของปรับสต๊อกยังต้องซ่อน",
);
// Same event, lot-level: the lot number sits between the verb and the numbers, and the older
// pattern anchored to the colon let all three of these through as second rows.
assert.equal(
  isDuplicateOfLoanRow({ previousStatus: "AVAILABLE", newStatus: "AVAILABLE", reason: "แก้ยอด Lot L-001: 5 → 3 (-2) (เหตุผล:สูญหาย)" }),
  true,
  "แถวคู่ของแก้ยอดราย lot ต้องซ่อน",
);
assert.equal(
  isDuplicateOfLoanRow({ previousStatus: "AVAILABLE", newStatus: "AVAILABLE", reason: "ตรวจนับ Lot RCV-20260819: 5 → 3 (-2) (เหตุผล:สูญหาย) (นับรอบถัดไป 19 ก.พ. 2570)" }),
  true,
  "แถวคู่ของตรวจนับราย lot ต้องซ่อน",
);
// A lot count that matched has no adjustment row either — same rule as the item-level one.
assert.equal(
  isDuplicateOfLoanRow({ previousStatus: "AVAILABLE", newStatus: "AVAILABLE", reason: "ตรวจนับ Lot L-001: ตรงยอด 5" }),
  false,
  "ตรวจนับราย lot ที่ตรงยอดต้องขึ้นประวัติ",
);
// …but a count that moved nothing has no adjustment row to hide behind.
assert.equal(
  isDuplicateOfLoanRow({ previousStatus: "AVAILABLE", newStatus: "AVAILABLE", reason: "ตรวจนับ: ตรงยอด 76 บนชั้นวาง" }),
  false,
  "ตรวจนับตรงยอดต้องขึ้นประวัติ",
);

// ── กิจกรรม / อื่นๆ never file without the free-text line ──
// The label alone is not an answer; the text under it is the whole reason those two exist.
const cart = { items: [{ itemId: "i1", quantity: 1 }] };
const ok = (input: object) => dispenseRequestSchema.safeParse(input).success;

assert.equal(ok({ ...cart, usageType: "OTHER" }), false, "อื่นๆ ต้องมีรายละเอียด");
assert.equal(ok({ ...cart, usageType: "OTHER", usageNote: "   " }), false, "ช่องว่างล้วนไม่นับ");
assert.equal(ok({ ...cart, usageType: "ACTIVITY" }), false, "กิจกรรม ต้องระบุกิจกรรม");
assert.equal(ok({ ...cart, usageType: "OTHER", usageNote: "ยกไปเก็บห้องพักครู" }), true);
assert.equal(ok({ ...cart, usageType: "ACTIVITY", usageNote: "กีฬาสี" }), true);
// เหตุผล has to be in usageNote — notes is only where the older rows happen to keep it, and a
// cart that still posted it there would file an activity the usage report cannot name.
assert.equal(ok({ ...cart, usageType: "ACTIVITY", notes: "กีฬาสี" }), false, "กิจกรรมต้องลง usageNote");

// ── รายวิชา must name the course, not just the category ──
// Same reasoning as the two above: "รายวิชา" on its own tells a reader nothing, and the
// usage-by-subject report cannot split by subject without the รหัสวิชา.
assert.equal(ok({ ...cart, usageType: "COURSE" }), false, "รายวิชา ต้องเลือกวิชา");
assert.equal(ok({ ...cart, usageType: "COURSE", courseCode: "   " }), false, "ช่องว่างล้วนไม่นับ");
// The registrar can be down when the cart submits, so the name is optional — the code isn't.
assert.equal(ok({ ...cart, usageType: "COURSE", courseCode: "578101" }), true);
assert.equal(ok({ ...cart, usageType: "COURSE", courseCode: "578101", usageNote: "การพยาบาลพื้นฐาน" }), true);
// A course code tagging along on กิจกรรม is harmless — only COURSE requires one.
assert.equal(ok({ ...cart, usageType: "ACTIVITY", usageNote: "กีฬาสี", courseCode: null }), true);
// ตั้งใช้ในห้อง files as OTHER so no row is left without a usageType, but it never collects the
// free-text line — its room is the reason. Without the INUSE arm of that refine, every
// นำไปใช้งาน submitted from station-in-room-dialog would be rejected.
assert.equal(
  ok({ ...cart, usageType: "OTHER", usageNote: null, loanType: "INUSE", locationId: "loc-402" }),
  true,
  "นำไปใช้งานส่ง OTHER โดยไม่มีรายละเอียดได้",
);
// The exemption is scoped to INUSE only — a plain เบิก/ยืม picking อื่นๆ still owes the line.
assert.equal(
  ok({ ...cart, usageType: "OTHER", usageNote: null, loanType: "BORROW" }),
  false,
  "ยืมเลือกอื่นๆ ยังต้องระบุรายละเอียด",
);
// Rows written straight to the API without a usageType are still accepted for INUSE.
assert.equal(ok({ ...cart, loanType: "INUSE", locationId: "loc-402" }), true);

// ── นำไปใช้งาน must name the room it moved stock to ──
// Stock stationed at an unnamed place is stock nobody can find. This used to pass, and the
// rows it let through are still in the table with a typo where the room should be.
assert.equal(ok({ ...cart, loanType: "INUSE" }), false, "INUSE ต้องระบุสถานที่");
assert.equal(ok({ ...cart, loanType: "INUSE", locationId: null }), false, "INUSE ห้ามส่ง location ว่าง");
// เบิก/ยืม don't move an item's registered room, so they never need one.
assert.equal(ok({ ...cart, usageType: "COURSE", courseCode: "578101", loanType: "BORROW" }), true, "ยืมไม่ต้องระบุสถานที่");
assert.equal(ok({ ...cart, usageType: "COURSE", courseCode: "578101" }), true, "เบิกปกติไม่ต้องระบุสถานที่");

// ── เบิก/ยืม must say what it is for ──
// The cart has always demanded this, but only in the browser: a row posted straight to the
// API landed with usageType NULL, and EXEC has POST rights here. Those rows are why the
// dashboard's usage stack ever needed a "ไม่ระบุ" band at all.
assert.equal(ok(cart), false, "เบิกต้องเลือกการใช้งาน");
assert.equal(ok({ ...cart, loanType: "BORROW" }), false, "ยืมก็ต้องเลือกการใช้งาน");
assert.equal(ok({ ...cart, usageType: null, loanType: "BORROW" }), false, "null ไม่ใช่คำตอบ");
// INUSE is the one exception, and not a loophole: its locationId is required (above), so the
// room is the reason — dashboard-usage.ts files those rows under ตั้งใช้ในห้อง.
assert.equal(ok({ ...cart, loanType: "INUSE", locationId: "loc-402" }), true, "นำไปใช้งานไม่ต้องเลือกการใช้งาน");

// ── loanType/dueAt are the ต้องคืน columns, and เบิกใช้ must not fill them ──
// A consumable used to file as BORROW carrying the cart's due date. Every loan query AND-s a
// dispenseType filter, so nothing showed it — the row just claimed to be a loan that would
// never be returned. One cart submits both kinds at once, so this is decided per line.
const DUE = new Date("2026-08-18T00:00:00Z");

assert.deepEqual(loanFields("CONSUMABLE", false, DUE), { loanType: "CONSUME", dueAt: null }, "เบิกใช้ไม่ใช่การยืม");
assert.deepEqual(loanFields("COUNT", false, DUE), { loanType: "BORROW", dueAt: DUE });
assert.deepEqual(loanFields("ITEM", false, DUE), { loanType: "BORROW", dueAt: DUE });
// นำไปใช้งาน is open-ended whatever the cart sent — the room is the record, not a due date.
assert.deepEqual(loanFields("ITEM", true, DUE), { loanType: "INUSE", dueAt: null });
assert.deepEqual(loanFields("COUNT", true, null), { loanType: "INUSE", dueAt: null });
// INUSE never reaches a consumable (the dialog is durable-only) — if it ever does, เบิกใช้ wins:
// a spent consumable has no room to sit in and no way back.
assert.deepEqual(loanFields("CONSUMABLE", true, DUE), { loanType: "CONSUME", dueAt: null });
// ยืมไม่ระบุกำหนดคืนได้ — null dueAt is a loan without a deadline, not a เบิกใช้.
assert.deepEqual(loanFields("COUNT", false, null), { loanType: "BORROW", dueAt: null });

// ── Coming back from IN_USE clears the room นำไปใช้งาน stamped on the piece ──
const HOME = "loc-home";
const patch = (previousStatus: ItemStatus, newStatus: ItemStatus, dest?: string | null) =>
  returnLocationUpdate({ previousStatus, newStatus, dest, itemLocationId: HOME });

// No destination given (bulk adjust, แจ้งชำรุด) → back to wherever the spec lives.
assert.deepEqual(patch("IN_USE", "AVAILABLE"), { locationId: null });
assert.deepEqual(patch("IN_USE", "DAMAGED"), { locationId: null });
// คืนเข้าคลัง picked somewhere else → the piece really is there now.
assert.deepEqual(patch("IN_USE", "AVAILABLE", "loc-501"), { locationId: "loc-501" });
// Picked the spec's own location → null, not a copy of the id: a piece that stores the id
// would stay behind the next time an admin moves the spec.
assert.deepEqual(patch("IN_USE", "AVAILABLE", HOME), { locationId: null });
// A borrow never moved the piece's room, so returning one must not touch it.
assert.deepEqual(patch("ON_LOAN", "AVAILABLE"), {});
assert.deepEqual(patch("ON_LOAN", "AVAILABLE", "loc-501"), {});
// Not leaving IN_USE at all — nothing to undo.
assert.deepEqual(patch("AVAILABLE", "IN_USE", "loc-501"), {});
assert.deepEqual(patch("IN_USE", "IN_USE"), {});

// ── เหตุผล is derived from the usage, not typed into a field of its own ──
// Every เหตุผล label in the app comes out of here, so a wrong fallback order names the wrong
// thing on the return screen — which is the one place someone acts on it.
assert.equal(
  recipientLabel({ usageType: "COURSE", courseCode: "578101", usageNote: "การพยาบาลพื้นฐาน" }),
  "578101 การพยาบาลพื้นฐาน",
);
// Registrar was down at dispense time — the code is still an answer, the name is not required.
assert.equal(recipientLabel({ usageType: "COURSE", courseCode: "578101" }), "578101");
assert.equal(recipientLabel({ usageType: "ACTIVITY", usageNote: "กีฬาสี" }), "กีฬาสี");
assert.equal(recipientLabel({ usageType: "OTHER", usageNote: "อ.สมชายขอ" }), "อ.สมชายขอ");
// Rows written before เหตุผล moved to usageNote still read out of notes — no migration ran,
// so dropping this fallback would blank the reason on every row already in the table.
assert.equal(recipientLabel({ usageType: "ACTIVITY", notes: "กีฬาสี" }), "กีฬาสี");
// นำไปใช้งาน has no usage block at all and writes its line straight into notes.
assert.equal(recipientLabel({ notes: "ตั้งใช้ประจำห้อง 402" }), "ตั้งใช้ประจำห้อง 402");
// The room นำไปใช้งาน used to fold into notes is dropped: the report prints เหตุผล one column
// away from สถานที่, and a row that repeats its neighbour is noise, not a reason.
assert.equal(recipientLabel({ notes: "ห้องที่ตั้ง: อาคาร 2 / ชั้น 3 / 305" }), null);
assert.equal(recipientLabel({ notes: "ยืมเล่นๆ | ห้องที่ตั้ง: ไม่บอก / อะไร" }), "ยืมเล่นๆ");
// usageNote wins when both are set: notes is the older copy, and the two can disagree.
assert.equal(recipientLabel({ usageType: "ACTIVITY", usageNote: "กีฬาสี", notes: "ของเก่า" }), "กีฬาสี");
// Legacy rows kept the name someone deliberately typed, and it wins over the usage.
assert.equal(recipientLabel({ recipient: "ครูสมชาย", usageType: "COURSE", courseCode: "578101" }), "ครูสมชาย");
// Blank is not a value — null lets every caller supply its own "ไม่ระบุ…" wording.
assert.equal(recipientLabel({ recipient: "   ", usageType: "ACTIVITY", usageNote: " ", notes: " " }), null);
assert.equal(recipientLabel({ usageType: null }), null);
// นำไปใช้งาน files no usageType at all; the row is named by its ห้อง, not by this.
assert.equal(recipientLabel({ usageType: null, notes: "ตั้งไว้ห้อง 402" }), "ตั้งไว้ห้อง 402");

console.log("dispense-history: ok");
