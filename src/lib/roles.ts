// Roles live in env, NOT in the database. Azure (once wired) says who you are;
// these lists say what you may do. Not in any list = no access at all — fail closed.
//
// Changing a list needs a redeploy AND a re-login: the role is baked into the JWT
// at sign-in and the token lives 24h.
//
//   SUPERADMIN_EMAILS=a@nu.ac.th,b@nu.ac.th   # + ตั้งค่า
//   ADMIN_EMAILS=...                          # everything except ตั้งค่า
//   EXECUTIVE_EMAILS=...                      # เบิก/ยืม + รายงาน only

export const ROLES = ["SUPERADMIN", "ADMIN", "EXECUTIVE"] as const;
export type Role = (typeof ROLES)[number];

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function roleForEmail(email: string): Role | null {
  const e = email.trim().toLowerCase();
  if (list("SUPERADMIN_EMAILS").includes(e)) return "SUPERADMIN";
  if (list("ADMIN_EMAILS").includes(e)) return "ADMIN";
  if (list("EXECUTIVE_EMAILS").includes(e)) return "EXECUTIVE";
  return null;
}

/** Everything except ตั้งค่า. Executives are read-only apart from เบิก/ยืม. */
export function canManageStock(role: string): boolean {
  return role === "SUPERADMIN" || role === "ADMIN";
}
