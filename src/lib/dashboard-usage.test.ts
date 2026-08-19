import assert from "node:assert/strict";
import { usageSeries, topCourses } from "./dashboard-usage";

// ── usageSeries ──

// The trap this whole helper exists for: นำไปใช้งาน carries no usageType, so reading
// usageType alone files every ตั้งใช้ในห้อง draw under "ไม่ระบุ".
assert.equal(usageSeries({ loanType: "INUSE", usageType: null }), "STATION");
// loanType wins even when a usageType happens to be there — the room is still the reason.
assert.equal(usageSeries({ loanType: "INUSE", usageType: "COURSE" }), "STATION");

assert.equal(usageSeries({ loanType: "BORROW", usageType: "COURSE" }), "COURSE");
assert.equal(usageSeries({ loanType: null, usageType: "ACTIVITY" }), "ACTIVITY");
assert.equal(usageSeries({ loanType: null, usageType: "OTHER" }), "OTHER");
// Legacy rows written before usageType was required on เบิก/ยืม.
assert.equal(usageSeries({ loanType: null, usageType: null }), "UNKNOWN");
// A value that is not a UsageType must not leak through as its own series.
assert.equal(usageSeries({ loanType: "BORROW", usageType: "STATION" }), "STATION"); // enum-shaped, still a real series
assert.equal(usageSeries({ loanType: "BORROW", usageType: "garbage" }), "UNKNOWN");

// ── topCourses ──

const rows = topCourses([
  { courseCode: "261101", usageNote: "Intro to CS", records: 3, units: 30 },
  { courseCode: "261101", usageNote: "Introduction to CS", records: 2, units: 5 }, // renamed → merges
  { courseCode: "952110", usageNote: "Physics Lab", records: 9, units: 9 },
  { courseCode: null, usageNote: null, records: 100, units: 999 }, // no code → dropped, never a bar
  { courseCode: "   ", usageNote: "blank", records: 50, units: 50 }, // whitespace is not a code
]);

assert.equal(rows.length, 2);
// Ranked by ครั้ง, not หน่วย: 261101 moved 35 units to 952110's 9 and still sits second.
assert.deepEqual(rows.map((r) => r.courseCode), ["952110", "261101"]);
assert.equal(rows[1].records, 5);
assert.equal(rows[1].units, 35);
// First snapshot names the merged course.
assert.equal(rows[1].label, "261101 — Intro to CS");

// limit slices after the sort, so the top N are the real top N.
const many = Array.from({ length: 12 }, (_, i) => ({
  courseCode: `C${i}`,
  usageNote: null,
  records: i,
  units: i,
}));
const top = topCourses(many);
assert.equal(top.length, 8);
assert.equal(top[0].courseCode, "C11");
assert.equal(top[7].courseCode, "C4");
// No name snapshot → the code stands alone rather than trailing an em dash.
assert.equal(top[0].label, "C11");
