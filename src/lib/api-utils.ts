import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ZodSchema, ZodError } from "zod";
import { PAGE_SIZE } from "@/lib/pagination-constants";

type SessionUser = { userId: string; email: string; name: string; role: string };
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
export function handleError(err: unknown, fallback: string, status = 400) {
  const message = err instanceof Error ? err.message : fallback;
  console.error(`${fallback}:`, message);
  return NextResponse.json({ error: message }, { status });
}

// request is unused (getSessionUser reads cookies via next/headers); optional so handlers
// without a request param (e.g. returns GET) can call requireAuth() directly.
export async function requireAuth(_request?: NextRequest): Promise<AuthResult> {
  const user = await getSessionUser();
  if (!user) return { user: null, denied: unauthorized() };
  // The JWT can outlive its user row (account removed, or a DB reseed in dev). A stale
  // userId passes the signature + middleware checks but then violates a FK on any write
  // (e.g. performedBy) — a confusing 500. Verify the row still exists/active and reject
  // with 401 so the client bounces to re-login instead.
  // ponytail: one indexed PK lookup per authed request; fine for an internal tool.
  const row = await prisma.user.findUnique({ where: { id: user.userId }, select: { isActive: true } });
  if (!row || !row.isActive) return { user: null, denied: unauthorized() };
  return { user, denied: null };
}

export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const result = await requireAuth(request);
  if (result.denied) return result;
  if (result.user.role !== "ADMIN") return { user: null, denied: forbidden() };
  return result;
}

// ponytail: STAFF+ — aligns the item edit dialog (canAct = ADMIN/STAFF) with the API.
export async function requireStaff(request?: NextRequest): Promise<AuthResult> {
  const result = await requireAuth(request);
  if (result.denied) return result;
  if (result.user.role !== "ADMIN" && result.user.role !== "STAFF") return { user: null, denied: forbidden() };
  return result;
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
