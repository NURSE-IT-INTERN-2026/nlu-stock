import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/auth-config";
import { roleForEmail } from "@/lib/roles";
import { z } from "zod/v4";

const loginSchema = z.object({
  email: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();

  // The env allowlists are the gate — not the users table. A row that isn't in any
  // list can't sign in, and a listed email that has no row yet gets one created
  // (every movement record needs a user to point at).
  const role = roleForEmail(email);
  if (!role) {
    return NextResponse.json({ error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน ติดต่อผู้ดูแลระบบ" }, { status: 403 });
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
