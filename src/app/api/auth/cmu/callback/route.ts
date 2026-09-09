import { NextRequest, NextResponse } from "next/server";
import { BASE_PATH } from "@/lib/base-path";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/auth-config";
import { roleForSignIn } from "@/lib/roles";
import { OAUTH_STATE_COOKIE, callbackUri, exchangeCode, fetchProfile, readState, type OAuthProfile } from "@/lib/cmu-oauth";

/** Where the provider sends the browser back. Must equal the redirect_uri the /authorize
 *  leg sent — see callbackUri() for how that is derived and allowlisted. */
export async function GET(request: NextRequest) {
  // Route handlers get a nextUrl whose basePath has already been stripped and is NOT put
  // back by clone() — unlike proxy, where it is. Spell the prefix out or every bounce
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
    // Same computation as the /authorize leg — the provider rejects an exchange whose
    // redirect_uri differs from the one the code was issued against.
    const tokens = await exchangeCode(code, callbackUri(request.headers, request.nextUrl.origin));
    profile = await fetchProfile(tokens);
  } catch {
    return fail("เชื่อมต่อระบบยืนยันตัวตนไม่สำเร็จ");
  }
  if (!profile) return fail("ไม่พบอีเมลในบัญชีที่ใช้เข้าสู่ระบบ");
  const { email } = profile;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !existing.isActive) return fail("บัญชีนี้ถูกปิดใช้งาน");

  // OAuth only proves the person owns the address — it grants nothing by itself. Staff come
  // from the env allowlists or a grant made in /settings; นศ./บุคลากร come from the faculty
  // claims, re-read on every sign-in. Neither = turned away.
  const role = roleForSignIn(profile, existing);
  if (!role) return fail("บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแลระบบ");

  // Fall back to the address prefix only when the provider gave no name at all.
  const placeholder = email.split("@")[0];
  // Display-only, and re-stamped on every sign-in so it cannot drift: an env list can
  // promote a borrower to staff, and /settings has no other way to tell a นศ./บุคลากร
  // account apart from one that no list mentions any more. See User.isBorrower.
  const isBorrower = role === "BORROWER";
  const changes = {
    // Adopt the provider's name for a row still carrying the placeholder, but never
    // overwrite one an admin typed by hand in /settings.
    ...(existing && profile.name && existing.name === placeholder ? { name: profile.name } : {}),
    ...(existing && existing.isBorrower !== isBorrower ? { isBorrower } : {}),
  };
  const user = existing
    ? Object.keys(changes).length
      ? await prisma.user.update({ where: { id: existing.id }, data: changes })
      : existing
    : await prisma.user.create({ data: { email, name: profile.name ?? placeholder, isBorrower } });

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
    // NODE_ENV, not request.nextUrl.protocol: the faculty server and ngrok terminate TLS in
    // front of us, so the socket here is plain http even though the browser is on https —
    // the same reason callbackUri() has to read x-forwarded-proto. Deriving the flag from the
    // socket dropped Secure off the 24h session cookie in production. Matches api/auth/logout.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h — same as the JWT
  });
  return response;
}
