import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ZodSchema, ZodError } from "zod";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { canManageStock, type Role } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type SessionUser = { userId: string; email: string; name: string; role: Role };
type AuthResult = { user: SessionUser; denied: null } | { user: null; denied: NextResponse };

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ponytail: shared catch tail — the `err instanceof Error ? err.message : fallback`
// → 400 block was copy-pasted across write routes. status overridable (500 for opaque ones).
//
// ข้อความที่ route โยนเองเป็นภาษาไทยที่เขียนให้ผู้ใช้อ่าน ("ล็อต L-2501 เหลือไม่พอ") — ต้องส่ง
// ต่อ ไม่งั้นหน้าจอบอกไม่ได้ว่าอะไรผิด. ส่วน error ที่ Prisma โยนเองพกชื่อตาราง ชื่อคอลัมน์
// และค่าที่ชนมาด้วย ("Unique constraint failed on the fields: (`email`)") ซึ่งเป็นรูปร่าง
// ฐานข้อมูลที่ client ไม่ต้องรู้ — เก็บไว้ใน log ฝั่งเราพอ
//
// แยกสองอย่างนี้ด้วย clientVersion: error ทุกชนิดของ Prisma พกมันมา, Error ที่เราสร้างเองไม่มี
export function handleError(err: unknown, fallback: string, status = 400) {
  const message = err instanceof Error ? err.message : fallback;
  console.error(`${fallback}:`, message);
  const safe = err instanceof Error && !("clientVersion" in err) ? message : fallback;
  return NextResponse.json({ error: safe }, { status });
}

// request is unused (getSessionUser reads cookies via next/headers); optional so handlers
// without a request param (e.g. returns GET) can call requireAuth() directly.
export async function requireAuth(_request?: NextRequest): Promise<AuthResult> {
  const user = await getSessionUser();
  if (!user) return { user: null, denied: unauthorized() };
  return { user, denied: null };
}

/** ตั้งค่า and the few reversal edges — SUPERADMIN only. */
export async function requireSuperAdmin(request?: NextRequest): Promise<AuthResult> {
  const result = await requireAuth(request);
  if (result.denied) return result;
  if (result.user.role !== "SUPERADMIN") return { user: null, denied: forbidden() };
  return result;
}

/** Anything that touches stock. Keeps EXECUTIVE out at the route level too, so the
 *  proxy guard isn't the only thing standing between them and a write. */
export async function requireAdmin(request?: NextRequest): Promise<AuthResult> {
  const result = await requireAuth(request);
  if (result.denied) return result;
  if (!canManageStock(result.user.role)) return { user: null, denied: forbidden() };
  return result;
}

/**
 * เพดานอัตราต่อ endpoint — คืน response ที่ต้องส่งกลับ หรือ null เมื่อยังไม่ชนเพดาน
 *
 *   const denied = await quotaDenied((tx) => consumeUploadQuota(tx, user.userId), "อัปโหลดถี่เกินไป…");
 *   if (denied) return denied;
 *
 * ตัวนับล่ม = ตอบไม่ได้ว่าเกินเพดานหรือยัง จึงปฏิเสธไว้ก่อน (fail closed) เหมือนที่ค้นหา AI
 * ทำมาตั้งแต่แรก: endpoint ที่ต้องมีเพดานคือ endpoint ที่การปล่อยผ่านแพงกว่าการปฏิเสธ
 */
export async function quotaDenied(
  consume: (db: Prisma.TransactionClient) => Promise<boolean>,
  busyMessage: string,
): Promise<NextResponse | null> {
  try {
    const allowed = await prisma.$transaction((tx) => consume(tx));
    return allowed ? null : error(busyMessage, 429);
  } catch {
    return error("ระบบไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง", 503);
  }
}

export function parseBody<T>(schema: ZodSchema<T>) {
  return async (request: Request): Promise<{ data: T | null; error: NextResponse | null }> => {
    try {
      const body = await request.json();
      const data = schema.parse(body);
      return { data, error: null };
    } catch (e) {
      if (e instanceof ZodError) {
        return { data: null, error: NextResponse.json({ error: e.flatten().fieldErrors }, { status: 422 }) };
      }
      return { data: null, error: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
    }
  };
}

export function getSearchParams(request: NextRequest) {
  return request.nextUrl.searchParams;
}

export function paginate(searchParams: URLSearchParams) {
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const perPage = Math.min(100, Math.max(1, Number(searchParams.get("perPage")) || PAGE_SIZE.DEFAULT));
  const skip = (page - 1) * perPage;
  return { page, perPage, skip, take: perPage };
}
