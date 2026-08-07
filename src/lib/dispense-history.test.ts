// What an item's ประวัติ is guaranteed to show. No framework — run with: npm test
// Two rules meet here, and both fail silently rather than loudly when broken: a duplicated
// row just looks like sloppy data, and a swallowed row looks like the event never happened.
import assert from "node:assert";
import { isLoanEdge, returnLocationUpdate } from "@/lib/returns";
import { dispenseRequestSchema } from "@/lib/validators/dispense";
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

// ── กิจกรรม / อื่นๆ never file without the free-text line ──
// The label alone is not an answer; the text under it is the whole reason those two exist.
const cart = { items: [{ itemId: "i1", quantity: 1 }], recipient: "ครูสมชาย" };
const ok = (input: object) => dispenseRequestSchema.safeParse(input).success;

assert.equal(ok({ ...cart, usageType: "OTHER" }), false, "อื่นๆ ต้องมีรายละเอียด");
assert.equal(ok({ ...cart, usageType: "OTHER", notes: "   " }), false, "ช่องว่างล้วนไม่นับ");
assert.equal(ok({ ...cart, usageType: "ACTIVITY" }), false, "กิจกรรม ต้องระบุกิจกรรม");
assert.equal(ok({ ...cart, usageType: "OTHER", notes: "ยกไปเก็บห้องพักครู" }), true);
assert.equal(ok({ ...cart, usageType: "ACTIVITY", notes: "กีฬาสี" }), true);

// ── รายวิชา must name the course, not just the category ──
// Same reasoning as the two above: "รายวิชา" on its own tells a reader nothing, and the
// usage-by-subject report cannot split by subject without the รหัสวิชา.
assert.equal(ok({ ...cart, usageType: "COURSE" }), false, "รายวิชา ต้องเลือกวิชา");
assert.equal(ok({ ...cart, usageType: "COURSE", courseCode: "   " }), false, "ช่องว่างล้วนไม่นับ");
// The registrar can be down when the cart submits, so the name is optional — the code isn't.
assert.equal(ok({ ...cart, usageType: "COURSE", courseCode: "578101" }), true);
assert.equal(ok({ ...cart, usageType: "COURSE", courseCode: "578101", usageNote: "การพยาบาลพื้นฐาน" }), true);
// A course code tagging along on กิจกรรม is harmless — only COURSE requires one.
assert.equal(ok({ ...cart, usageType: "ACTIVITY", notes: "กีฬาสี", courseCode: null }), true);
// ตั้งใช้ในห้อง (station-in-room-dialog) sends no usageType at all — the rule must not catch it.
assert.equal(ok({ ...cart, loanType: "INUSE", locationId: "loc-402" }), true);

// ── นำไปใช้งาน must name the room it moved stock to ──
// Stock stationed at an unnamed place is stock nobody can find. This used to pass, and the
// rows it let through are still in the table with a typo where the room should be.
assert.equal(ok({ ...cart, loanType: "INUSE" }), false, "INUSE ต้องระบุสถานที่");
assert.equal(ok({ ...cart, loanType: "INUSE", locationId: null }), false, "INUSE ห้ามส่ง location ว่าง");
// เบิก/ยืม don't move an item's registered room, so they never need one.
assert.equal(ok({ ...cart, loanType: "BORROW" }), true, "ยืมไม่ต้องระบุสถานที่");
assert.equal(ok(cart), true, "เบิกปกติไม่ต้องระบุสถานที่");

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

console.log("dispense-history: ok");
