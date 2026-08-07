import assert from "node:assert/strict";
import { latestCourseTitle } from "./courses";

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

console.log("courses: latestCourseTitle ok");
