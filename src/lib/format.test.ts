// Date-token check. No framework — run with: npx tsx src/lib/format.test.ts
// Guards the split the whole app rests on: display tokens are Thai + พ.ศ., machine tokens
// stay ISO/CE. Getting them crossed silently ships "2569-07-31" into a CSV or an <input>.
import assert from "node:assert";
import { fmtDate, TH_DATE, TH_DATETIME, TH_DAY } from "@/lib/format";

const d = new Date(2026, 6, 31, 14, 5); // 31 Jul 2026 14:05 local

assert.equal(fmtDate(d, TH_DATE), "31 ก.ค. 2569");
assert.equal(fmtDate(d, TH_DATETIME), "31 ก.ค. 2569 14:05");
assert.equal(fmtDate(d, TH_DAY), "31 ก.ค.");

// Machine formats must not drift into พ.ศ.
assert.equal(fmtDate(d, "yyyy-MM-dd"), "2026-07-31");
assert.equal(fmtDate(d, "yyyy-MM-dd HH:mm"), "2026-07-31 14:05");

// Single-digit day keeps no padding in Thai, keeps padding in ISO.
const single = new Date(2026, 0, 3, 9, 7);
assert.equal(fmtDate(single, TH_DATE), "3 ม.ค. 2569");
assert.equal(fmtDate(single, "yyyy-MM-dd"), "2026-01-03");

// Longest-first alternation: MMMt must not be eaten by MMM, dd must not be eaten by d.
assert.equal(fmtDate(d, "dd MMM yyyy"), "31 Jul 2026");

console.log("format.test.ts OK");
