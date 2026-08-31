import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/auth-config";
import { roleForProfile } from "@/lib/roles";
import { z } from "zod/v4";

const loginSchema = z.object({
  email: z.string().min(1),
  /** Stand in for the CMU claims that grant BORROWER, so the ยืมเอง flow is testable without
   *  a real นศ./บุคลากร account — nobody on this project has one. Omitted = env allowlists
   *  only, exactly as before. */
  orgCode: z.string().nullish(),
  orgName: z.string().nullish(),
  accountType: z.string().nullish(),
});

export async function POST(request: NextRequest) {
  // This route hands out a session for any allowlisted address with no proof the caller
  // owns it — that was the whole login story before OAuth. Production goes through
  // /api/auth/cmu now; this stays only so the login page's dev shortcuts and the e2e
  // suite can skip the provider round-trip.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();

  // The env allowlists are the gate — not the users table. A row that isn't in any
  // list can't sign in, and a listed email that has no row yet gets one created
  // (every movement record needs a user to point at).
  //
  // Dev-only claims so the BORROWER shortcuts have something to match: the provider is what
  // supplies these in production, and this route already 404s there.
  const role = roleForProfile({
    email,
    accountType: parsed.data.accountType ?? "StudentAccount",
    orgCode: parsed.data.orgCode ?? null,
    orgName: parsed.data.orgName ?? null,
  });
  if (!role) {
    return NextResponse.json({ error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแลระบบ" }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !existing.isActive) {
    return NextResponse.json({ error: "บัญชีนี้ถูกปิดใช้งาน" }, { status: 403 });
  }

  const user =
    existing ??
    (await prisma.user.create({ data: { email, name: email.split("@")[0] } }));

  const token = await signToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role,
  });

  const response = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role },
  });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h
  });

  return response;
}
