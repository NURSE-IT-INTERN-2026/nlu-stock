import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { COOKIE_NAME, getJwtSecret, SESSION_AUD } from "./auth-config";
import { ROLES, sessionRoleMatches, type Role } from "./roles";
import { prisma } from "./prisma";

export async function signToken(payload: { userId: string; email: string; name: string; role: Role }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(SESSION_AUD)
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(getJwtSecret());
}

/**
 * A valid signature is NOT proof this is a session token.
 *
 * lib/cmu-oauth signState() signs the OAuth `state` with this very secret, and /api/auth/cmu
 * hands it to the browser inside a URL — anyone can read it out of the address bar and post it
 * back as the session cookie. `audience` is what rules that out by construction; the shape
 * checks below are the second line, and the reason the cast is safe at all: without them it
 * returns `{userId: undefined, email: undefined, role: undefined}` as a perfectly truthy
 * "user", which /api/auth/session answers 200 to and requireAuth walks into a Prisma 500 with.
 */
export async function verifyToken(token: string) {
  // นอก try — คีย์ที่ตั้งไม่ผ่านด่านคนละเรื่องกับ token ที่ปลอมมา ถ้าปล่อยให้ throw ตกลงไปใน
  // catch ข้างล่าง deploy ที่ JWT_SECRET สั้นไปจะกลายเป็น "ทุกคนถูกเด้งไปหน้าล็อกอิน" เงียบๆ
  // แทนที่จะร้องว่าตั้งค่าผิด
  const secret = getJwtSecret();
  try {
    const { payload } = await jwtVerify(token, secret, { audience: SESSION_AUD });
    const { userId, email, name, role } = payload as Record<string, unknown>;
    if (typeof userId !== "string" || !userId) return null;
    if (typeof email !== "string" || !email) return null;
    if (typeof name !== "string") return null;
    if (!(ROLES as readonly unknown[]).includes(role)) return null;
    return { userId, email, name, role: role as Role };
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSessionToken(token);
}

/** Shared by proxy and handlers: signed claims must still match the current account. */
export async function validateSessionToken(token: string) {
  const user = await verifyToken(token);
  if (!user) return null;
  const row = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { email: true, name: true, role: true, isActive: true, isBorrower: true },
  });
  if (!row || row.email !== user.email || !sessionRoleMatches(user.role, row)) return null;
  return { ...user, name: row.name };
}
