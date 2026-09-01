// ยืมเอง gate. Every ประเภท is open by default; the two switches only ever close, and closing
// the ประเภท must beat an item that still says yes (that is how KIT stays staff-only even
// after somebody adds a tenth kit). Run with: npm test
import assert from "node:assert/strict";
import { isSelfBorrowable, isConsumeOnly, selfBorrowMax, selfBorrowLimitFor, selfBorrowDueAt, SELF_BORROW_HOURS, SELF_BORROW_MAX_DAYS } from "@/lib/self-borrow";

const base = {
  selfBorrowable: true,
  selfBorrowLimit: null as number | null,
  availableQty: 10,
  trackIndividually: false,
  dispenseType: "COUNT",
  profileSelfBorrowable: true,
  profileSelfBorrowLimit: 5,
};

assert.equal(isSelfBorrowable(base), true);
assert.equal(isSelfBorrowable({ ...base, dispenseType: "CONSUMABLE" }), true, "สิ้นเปลืองเบิกเองได้");
assert.equal(isSelfBorrowable({ ...base, selfBorrowable: false }), false, "per-item off switch");
assert.equal(isSelfBorrowable({ ...base, profileSelfBorrowable: false }), false, "ประเภทปิด = ปิด (KIT)");
// A closed ประเภท must win over an item that was left open — otherwise a newly added kit,
// which defaults to selfBorrowable=true, would quietly reopen the category.
assert.equal(isSelfBorrowable({ ...base, profileSelfBorrowable: false, selfBorrowable: true }), false);

assert.equal(isConsumeOnly({ dispenseType: "CONSUMABLE" }), true, "เบิกใช้ ไม่มีกำหนดคืน");
assert.equal(isConsumeOnly({ dispenseType: "COUNT" }), false);
assert.equal(isConsumeOnly({ dispenseType: "ITEM" }), false);

// null on the item = ตามประเภท, which is what every row looks like until someone edits one.
assert.equal(selfBorrowLimitFor(null, 5), 5, "null inherits the profile");
assert.equal(selfBorrowLimitFor(undefined, 5), 5);
assert.equal(selfBorrowLimitFor(2, 5), 2, "an item override wins");
// 0 and negatives are not a real answer — they would render a stepper with no legal value.
assert.equal(selfBorrowLimitFor(0, 5), 5, "0 is not an off switch — selfBorrowable is");
assert.equal(selfBorrowLimitFor(-3, 5), 5);

assert.equal(selfBorrowMax(base), 5, "profile limit binds while stock is plentiful");
assert.equal(selfBorrowMax({ ...base, selfBorrowLimit: 2 }), 2, "item override binds");
assert.equal(selfBorrowMax({ ...base, availableQty: 2 }), 2, "stock binds when it is scarcer than the limit");
assert.equal(selfBorrowMax({ ...base, availableQty: 0 }), 0);
assert.equal(selfBorrowMax({ ...base, trackIndividually: true }), 1, "tracked pieces go out one at a time");
// availableQty on a tracked item = how many copies are AVAILABLE, so an empty shelf must read
// 0 — a flat 1 kept the ยืม button lit when every copy was already out.
assert.equal(selfBorrowMax({ ...base, trackIndividually: true, availableQty: 0 }), 0, "no free copy = nothing to borrow");
assert.equal(selfBorrowMax({ ...base, trackIndividually: true, availableQty: 9, selfBorrowLimit: 5 }), 1, "the limit never lifts a tracked borrow above one piece");

const from = new Date("2026-08-28T15:00:00.000Z");
assert.equal(selfBorrowDueAt(1, from).toISOString(), "2026-08-29T15:00:00.000Z", "+24h, not end of next day");
assert.equal(selfBorrowDueAt(undefined, from).toISOString(), "2026-08-29T15:00:00.000Z", "default is 1 day");
assert.equal(selfBorrowDueAt(3, from).toISOString(), "2026-08-31T15:00:00.000Z", "3 days keeps the clock time");
// Clamped, not trusted: these all arrive from a request body.
assert.equal(selfBorrowDueAt(0, from).toISOString(), "2026-08-29T15:00:00.000Z", "0 days is not a same-instant loan");
assert.equal(selfBorrowDueAt(-5, from).toISOString(), "2026-08-29T15:00:00.000Z", "never in the past");
assert.equal(selfBorrowDueAt(9999, from).toISOString(), selfBorrowDueAt(SELF_BORROW_MAX_DAYS, from).toISOString(), "capped");
assert.equal(selfBorrowDueAt(2.7, from).toISOString(), "2026-08-30T15:00:00.000Z", "fractions truncate");
assert.equal(selfBorrowDueAt(NaN, from).toISOString(), "2026-08-29T15:00:00.000Z");
assert.equal(SELF_BORROW_HOURS, 24);

console.log("# self-borrow: all assertions passed");
