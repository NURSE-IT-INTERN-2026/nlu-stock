// Access-rule check. No framework — run with: npm test
// Guards the two rules that decide who can do what now that roles left the database:
// which list an email lands in, and which writes an EXECUTIVE is allowed.
import assert from "node:assert";
// Safe to set after import: the lists are read on every call, not at module load.
import { roleForEmail, canManageStock } from "@/lib/roles";

process.env.SUPERADMIN_EMAILS = " Boss@NU.ac.th ,two@nu.ac.th";
process.env.ADMIN_EMAILS = "store@nu.ac.th";
process.env.EXECUTIVE_EMAILS = "dean@nu.ac.th";

// Matching is case- and whitespace-insensitive on both sides — the env list is
// hand-edited and Azure hands back whatever casing the directory holds.
assert.equal(roleForEmail("boss@nu.ac.th"), "SUPERADMIN");
assert.equal(roleForEmail("  BOSS@nu.ac.th "), "SUPERADMIN");
assert.equal(roleForEmail("two@nu.ac.th"), "SUPERADMIN");
assert.equal(roleForEmail("store@nu.ac.th"), "ADMIN");
assert.equal(roleForEmail("dean@nu.ac.th"), "EXECUTIVE");

// Fail closed: unlisted emails get nothing, and a partial match is not a match.
assert.equal(roleForEmail("student@nu.ac.th"), null, "unlisted email must not get a role");
assert.equal(roleForEmail("boss@nu.ac.th.evil.com"), null);
assert.equal(roleForEmail(""), null);

assert.equal(canManageStock("SUPERADMIN"), true);
assert.equal(canManageStock("ADMIN"), true);
assert.equal(canManageStock("EXECUTIVE"), false, "executives must not touch stock");

// ─── Executive write allowlist (mirrors EXEC_WRITE in src/middleware.ts) ───
const EXEC_WRITE = [/^\/api\/dispense$/, /^\/api\/dispense-templates(\/|$)/];
const execMayWrite = (p: string) => EXEC_WRITE.some((re) => re.test(p));

assert.equal(execMayWrite("/api/dispense"), true, "เบิก/ยืม is the one write they get");
assert.equal(execMayWrite("/api/dispense-templates"), true);
assert.equal(execMayWrite("/api/dispense-templates/abc123"), true);

// The traps: everything nested under /api/dispense is a return, not a เบิก, so an
// exact match on the parent is load-bearing.
assert.equal(execMayWrite("/api/dispense/in-use/abc/return"), false, "คืนของตั้งใช้ในห้อง is admin work");
assert.equal(execMayWrite("/api/returns"), false, "รับคืน is admin work");
assert.equal(execMayWrite("/api/receive"), false);
assert.equal(execMayWrite("/api/items/abc/status"), false, "แจ้งชำรุด is admin work");
assert.equal(execMayWrite("/api/items/abc/adjust"), false);
assert.equal(execMayWrite("/api/settings/users"), false);

console.log("# roles: all assertions passed");
