// Access-rule check. No framework — run with: npm test
// Guards the two rules that decide who can do what now that roles left the database:
// which list an email lands in, and which writes an EXECUTIVE is allowed.
import assert from "node:assert";
// Safe to set after import: the lists are read on every call, not at module load.
import { roleForEmail, canManageStock, emailsForRole, roleForProfile, displayRole, roleForSignIn } from "@/lib/roles";

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

// ─── Executive write allowlist (mirrors EXEC_WRITE in src/proxy.ts) ───
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

// The /settings role filter matches on these lists — normalised the same way roleForEmail does.
assert.deepEqual(emailsForRole("SUPERADMIN"), ["boss@nu.ac.th", "two@nu.ac.th"]);
assert.deepEqual(emailsForRole("EXECUTIVE"), ["dean@nu.ac.th"]);

// ── ยืมเอง: the faculty gate ──────────────────────────────────────────
// นศ. carry the faculty code itself; staff carry a department code beneath it.
process.env.BORROWER_ORG_PREFIXES = "12";
process.env.BORROWER_ORG_NAMES = "พยาบาล";
const nursing = (
  accountType: string | null,
  orgCode: string | null,
  opts: { orgName?: string | null; email?: string } = {},
) => roleForProfile({
  email: opts.email ?? "someone@cmu.ac.th",
  accountType,
  orgCode,
  orgName: opts.orgName ?? null,
});

assert.equal(nursing("StudentAccount", "12"), "BORROWER");
assert.equal(nursing("MISEmployee", "1203"), "BORROWER", "staff sit on a department code under the faculty");
assert.equal(nursing("AlumniAccount", "12"), null, "a graduate keeps the faculty org — account type is what goes stale");
assert.equal(nursing("StudentAccount", "07"), null, "another faculty");
assert.equal(nursing("StudentAccount", null), null);
assert.equal(nursing(null, "12"), null, "no claims (id_token-only provider) must not grant anything");

// The name is the safety net for the staff department codes nobody here has ever seen.
assert.equal(
  nursing("MISEmployee", "4501", { orgName: "ภาควิชาการพยาบาลศัลยศาสตร์" }),
  "BORROWER",
  "a department code outside the prefix still gets in on the faculty name",
);
assert.equal(nursing("MISEmployee", "4501", { orgName: "ภาควิชาชีวเคมี" }), null, "another faculty's department");
// ...but the net only catches accounts the type check already passed.
assert.equal(nursing("AlumniAccount", "4501", { orgName: "ภาควิชาการพยาบาลศัลยศาสตร์" }), null);

// An env list always wins, whatever the provider says about the account.
assert.equal(nursing("StudentAccount", "12", { email: "boss@nu.ac.th" }), "SUPERADMIN");
assert.equal(nursing("AlumniAccount", "99", { email: "store@nu.ac.th" }), "ADMIN");

// Both lists unset = nobody self-borrows. Fail closed, same as an empty email list.
process.env.BORROWER_ORG_PREFIXES = "";
process.env.BORROWER_ORG_NAMES = "";
assert.equal(nursing("StudentAccount", "12"), null);
assert.equal(nursing("MISEmployee", "12", { orgName: "ภาควิชาการพยาบาลศัลยศาสตร์" }), null);
process.env.BORROWER_ORG_PREFIXES = "12";
process.env.BORROWER_ORG_NAMES = "พยาบาล";

assert.equal(canManageStock("BORROWER"), false, "borrowers must not touch stock");

// displayRole — what /settings prints for a stored row: env list, then the granted role,
// then the flag the last sign-in stamped.
assert.equal(displayRole({ email: "nurse@cmu.ac.th", role: null, isBorrower: true }), "BORROWER");
assert.equal(displayRole({ email: "store@nu.ac.th", role: null, isBorrower: true }), "ADMIN", "a promoted borrower reads as staff");
assert.equal(displayRole({ email: "new@nu.ac.th", role: "EXECUTIVE", isBorrower: false }), "EXECUTIVE", "granted from /settings");
assert.equal(
  displayRole({ email: "store@nu.ac.th", role: "EXECUTIVE", isBorrower: false }),
  "ADMIN",
  "env wins over the column — it is the lever that still works when the table is wrong",
);
assert.equal(
  displayRole({ email: "hand-edited@nu.ac.th", role: "GOD", isBorrower: false }),
  null,
  "a role name outside ROLES grants nothing",
);
assert.equal(
  displayRole({ email: "expired@nu.ac.th", role: null, isBorrower: false }),
  null,
  "no list, no grant, no flag = cannot sign in — the one row that should read เข้าระบบไม่ได้",
);

// roleForSignIn — the stored row decides first, the provider's claims are the fallback that
// hands a นศ./บุคลากร their BORROWER.
const nurseClaims = { email: "nurse@cmu.ac.th", accountType: "StudentAccount", orgCode: "12", orgName: null };
assert.equal(roleForSignIn(nurseClaims, null), "BORROWER", "first sign-in, no row yet");
assert.equal(
  roleForSignIn(nurseClaims, { email: "nurse@cmu.ac.th", role: "EXECUTIVE", isBorrower: true }),
  "EXECUTIVE",
  "a grant from /settings outranks what the claims would have given",
);
assert.equal(
  roleForSignIn({ ...nurseClaims, orgCode: "07" }, { email: "nurse@cmu.ac.th", role: null, isBorrower: true }),
  null,
  "a stale flag must not grant anything on its own — the claims are re-read every sign-in",
);

console.log("# roles: all assertions passed");
