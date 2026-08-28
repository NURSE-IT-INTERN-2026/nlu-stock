import { NextRequest, NextResponse } from "next/server";
import { BASE_PATH } from "@/lib/base-path";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/auth-config";
import { roleForEmail } from "@/lib/roles";
import { OAUTH_STATE_COOKIE, exchangeCode, fetchProfile, readState, type OAuthProfile } from "@/lib/cmu-oauth";

/** Where the provider sends the browser back. Must equal CMU_REDIRECT_URI exactly. */
export async function GET(request: NextRequest) {
  // Route handlers get a nextUrl whose basePath has already been stripped and is NOT put
  // back by clone() — unlike middleware, where it is. Spell the prefix out or every bounce
  // below lands on a bare /login that does not exist, and the user sees a 404 instead of
  // the reason they were turned away.
  const appUrl = (pathAndSearch: string) =>
    new URL(BASE_PATH + pathAndSearch, request.nextUrl.origin);

  // Failures land back on /login with a message rather than a raw 500 — the user is in a
  // browser, not calling an API.
  const fail = (message: string) => {
    const response = NextResponse.redirect(
      appUrl(`/login?error=${encodeURIComponent(message)}`),
    );
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  };

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("เข้าสู่ระบบไม่สำเร็จ");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("เข้าสู่ระบบไม่สำเร็จ");

  const verified = await readState(state, request.cookies.get(OAUTH_STATE_COOKIE)?.value);
  if (!verified) return fail("ลิงก์เข้าสู่ระบบหมดอายุ ลองใหม่อีกครั้ง");

  let profile: OAuthProfile | null;
  try {
    profile = await fetchProfile(await exchangeCode(code));
  } catch {
    return fail("เชื่อมต่อระบบยืนยันตัวตนไม่สำเร็จ");
  }
  if (!profile) return fail("ไม่พบอีเมลในบัญชีที่ใช้เข้าสู่ระบบ");
  const { email } = profile;

  // Unchanged from the old login route: the env allowlists are the gate, not the users
  // table. OAuth only proves the person owns the address — it grants nothing by itself.
  const role = roleForEmail(email);
  if (!role) return fail("บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแลระบบ");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !existing.isActive) return fail("บัญชีนี้ถูกปิดใช้งาน");

  // Fall back to the address prefix only when the provider gave no name at all.
  const placeholder = email.split("@")[0];
  const user = existing
    // Adopt the provider's name for a row still carrying the placeholder, but never
    // overwrite one an admin typed by hand in /settings.
    ? profile.name && existing.name === placeholder
      ? await prisma.user.update({ where: { id: existing.id }, data: { name: profile.name } })
      : existing
    : await prisma.user.create({ data: { email, name: profile.name ?? placeholder } });

  const token = await signToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role,
  });

  // verified.next is an app path that may carry its own query string (a QR scan lands on
  // /items/X?copy=Y); appUrl puts the basePath back on the front.
  const response = NextResponse.redirect(appUrl(verified.next));
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h — same as the JWT
  });
  return response;
}
