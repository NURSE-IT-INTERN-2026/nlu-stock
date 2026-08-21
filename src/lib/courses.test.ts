import assert from "node:assert/strict";
import { latestCourseTitle, latestCourseOpen } from "./courses";

// Real shape, taken from the registrar's answer for 001101 — three revisions, the newest of
// which renamed the course. Picking the wrong row files today's dispense under a title the
// course stopped using in 2566.
const rows001101 = [
  { year_start: "2552", semester_start: "1", title_long_th: "การฟังและการพูดภาษาอังกฤษ" },
  { year_start: "2557", semester_start: "1", title_long_th: "ภาษาอังกฤษพื้นฐาน 1" },
  { year_start: "2567", semester_start: "1", title_long_th: "ภาษาอังกฤษพื้นฐาน 1" },
];

assert.equal(latestCourseTitle(rows001101), "ภาษาอังกฤษพื้นฐาน 1");
// The registrar returns rows oldest-first today but never promised to, which is the whole
// reason this sorts on the term instead of reading the last element.
assert.equal(latestCourseTitle([...rows001101].reverse()), "ภาษาอังกฤษพื้นฐาน 1");
assert.equal(
  latestCourseTitle([
    { year_start: "2567", semester_start: "1", title_long_th: "ชื่อใหม่" },
    { year_start: "2552", semester_start: "1", title_long_th: "ชื่อเก่า" },
  ]),
  "ชื่อใหม่",
  "ปีล่าสุดชนะ ไม่ใช่แถวสุดท้าย",
);
// Same year, later semester wins — year alone can't separate these.
assert.equal(
  latestCourseTitle([
    { year_start: "2567", semester_start: "2", title_long_th: "เทอมสอง" },
    { year_start: "2567", semester_start: "1", title_long_th: "เทอมหนึ่ง" },
  ]),
  "เทอมสอง",
);

// 578101 really does answer with an empty array: the code exists but has no bulletin.
// null makes the picker show the bare code instead of an empty line.
assert.equal(latestCourseTitle([]), null);
assert.equal(latestCourseTitle([{ title_long_th: "   " }]), null, "ชื่อช่องว่างล้วนไม่นับ");
// A row with no term must not out-rank one that has a real title.
assert.equal(latestCourseTitle([{ title_long_th: "ไม่มีเทอม" }]), "ไม่มีเทอม");

// --- latestCourseOpen ---------------------------------------------------------
// 951100 for real: two revisions the course has moved past, then the one running today.
// Reading any but the newest retires a course that is currently being taught.
assert.equal(
  latestCourseOpen([
    { year_start: "2552", semester_start: "1", open_status: "0" },
    { year_start: "2566", semester_start: "2", open_status: "0" },
    { year_start: "2568", semester_start: "1", open_status: "1" },
  ]),
  true,
  "รุ่นล่าสุดเปิดอยู่ = ยังสอน แม้รุ่นเก่าจะปิดหมด",
);
// The retired case, and the mirror of the one above: the newest revision decides even when
// an older one is still flagged open.
assert.equal(
  latestCourseOpen([
    { year_start: "2552", semester_start: "1", open_status: "1" },
    { year_start: "2566", semester_start: "1", open_status: "0" },
  ]),
  false,
);
// Blank and null both mean open — only a literal "0" retires a course, so a shape change
// upstream leaves courses pickable rather than silently emptying the picker.
assert.equal(latestCourseOpen([{ year_start: "2567", semester_start: "1", open_status: "" }]), true);
assert.equal(latestCourseOpen([{ year_start: "2567", semester_start: "1", open_status: null }]), true);
// A term the registrar garbles must not out-rank a real one: Number("2567ก") is NaN, and
// every comparison against NaN is false, so an unguarded key would pin the first row as
// newest forever — and read open_status off it.
assert.equal(
  latestCourseOpen([
    { year_start: "2567ก", semester_start: "1", open_status: "0" },
    { year_start: "2568", semester_start: "1", open_status: "1" },
  ]),
  true,
  "ปีที่อ่านไม่ออกต้องไม่ชนะปีจริง",
);
// 578101: no bulletin at all. The faculty catalogue still lists it, so it stays pickable —
// silence from the registrar is not a closure.
assert.equal(latestCourseOpen([]), true, "ไม่มี bulletin = ยังเลือกได้");
// Same reasoning for a revision that simply omits the flag.
assert.equal(latestCourseOpen([{ year_start: "2567", semester_start: "1" }]), true);

console.log("courses: latestCourseTitle + latestCourseOpen ok");
