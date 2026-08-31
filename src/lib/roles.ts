// Roles live in env, NOT in the database. CMU OAuth says who you are; these lists say what
// you may do. Not in any list and not a nursing account = no access at all — fail closed.
//
// Changing a list needs a redeploy AND a re-login: the role is baked into the JWT
// at sign-in and the token lives 24h.
//
//   SUPERADMIN_EMAILS=a@nu.ac.th,b@nu.ac.th   # + ตั้งค่า
//   ADMIN_EMAILS=...                          # everything except ตั้งค่า
//   EXECUTIVE_EMAILS=...                      # เบิก/ยืม + รายงาน only
//   BORROWER_ORG_PREFIXES=12                  # คณะพยาบาลศาสตร์ — see roleForProfile
//   BORROWER_ORG_NAMES=พยาบาล                 # ตาข่ายรองของ prefix ข้างบน

/** The three roles handed out by an email allowlist. BORROWER is not one of them —
 *  nobody types a student into env, the provider's own claims decide it. */
export const ENV_ROLES = ["SUPERADMIN", "ADMIN", "EXECUTIVE"] as const;
export type EnvRole = (typeof ENV_ROLES)[number];

export const ROLES = [...ENV_ROLES, "BORROWER"] as const;
export type Role = (typeof ROLES)[number];

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function roleForEmail(email: string): EnvRole | null {
  const e = email.trim().toLowerCase();
  if (list("SUPERADMIN_EMAILS").includes(e)) return "SUPERADMIN";
  if (list("ADMIN_EMAILS").includes(e)) return "ADMIN";
  if (list("EXECUTIVE_EMAILS").includes(e)) return "EXECUTIVE";
  return null;
}

/** What the provider says about the account, beyond the address. Both nullable: a provider
 *  that answers from the id_token instead of CMU basicinfo sends neither. */
export interface AccountClaims {
  email: string;
  /** itaccounttype_EN — StudentAccount / MISEmployee / AlumniAccount. */
  accountType: string | null;
  /** organization_code — "12" for นศ.คณะพยาบาล; staff sit on a department code under it. */
  orgCode: string | null;
  /** organization_name_TH — the department/faculty spelled out. Second, independent signal:
   *  we know what the faculty is called even though we have never seen a staff org code. */
  orgName: string | null;
}

// AlumniAccount is deliberately absent: a graduate's organization_code stays pointed at the
// faculty they left, so org alone would keep letting them borrow. Account type is the only
// claim that goes stale when they leave.
const BORROWER_ACCOUNT_TYPES = ["StudentAccount", "MISEmployee"];

/**
 * Does this account belong to the faculty? Two independent signals, either is enough:
 *
 *   organization_code starts with a BORROWER_ORG_PREFIXES entry — นศ. carry the faculty code
 *   ("12") verbatim, staff carry a department code beneath it. Prefix, not equality.
 *
 *   organization_name_TH contains a BORROWER_ORG_NAMES entry ("พยาบาล").
 *
 * The second exists because the staff department codes have never been observed — nobody on
 * this project has an account to look with. If they turn out not to start with "12" the name
 * still lets staff in, and neither signal needs a code change to correct: both are env.
 */
function inFaculty(claims: AccountClaims): boolean {
  const code = claims.orgCode?.trim().toLowerCase() ?? "";
  if (code && list("BORROWER_ORG_PREFIXES").some((p) => code.startsWith(p))) return true;
  const name = claims.orgName?.trim().toLowerCase() ?? "";
  return !!name && list("BORROWER_ORG_NAMES").some((n) => name.includes(n));
}

/**
 * Who this account is, in order of authority: an env allowlist wins, otherwise the provider's
 * own claims decide whether they are a นศ./บุคลากร of the faculty. Anything else = null = no
 * sign-in, same as before this role existed.
 */
export function roleForProfile(claims: AccountClaims): Role | null {
  const listed = roleForEmail(claims.email);
  if (listed) return listed;

  if (!claims.accountType || !BORROWER_ACCOUNT_TYPES.includes(claims.accountType)) return null;
  if (inFaculty(claims)) return "BORROWER";

  // A real นศ./บุคลากร turned away by the org rule is the one failure this project cannot
  // reproduce, so it reports itself: the codes below are what the env lists were missing.
  // No name, email or student id — an org code is not a person.
  console.warn(
    `[roles] ปฏิเสธบัญชี ${claims.accountType} นอกสังกัด — organization_code=${claims.orgCode ?? "?"} ` +
      `organization_name_TH=${claims.orgName ?? "?"} (ถ้านี่คือคนในคณะ ให้เพิ่มค่าลง BORROWER_ORG_PREFIXES/BORROWER_ORG_NAMES)`,
  );
  return null;
}

/** Everything except ตั้งค่า. Executives and borrowers are read-only apart from เบิก/ยืม. */
export function canManageStock(role: string): boolean {
  return role === "SUPERADMIN" || role === "ADMIN";
}

/** นศ./บุคลากรที่ยืมเอง — the only role that sees the ยืม button on an item page. */
export function isSelfBorrower(role: string): boolean {
  return role === "BORROWER";
}

/** The env allowlist behind one role. /settings uses it to filter the user table by role,
 *  since there is no role column to filter on. */
export function emailsForRole(role: EnvRole): string[] {
  return list(`${role}_EMAILS`);
}
