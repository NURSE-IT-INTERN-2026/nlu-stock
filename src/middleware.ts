import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { COOKIE_NAME, getJwtSecret } from "@/lib/auth-config";

const publicPaths = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/session"];

interface RouteRule {
  path: string;
  allowedRoles?: string[]; // undefined = any authenticated user
  exact?: boolean;          // default false (startsWith match)
}

const STOCK_ROLES = ["SUPERADMIN", "ADMIN"];

// Only list pages an EXECUTIVE must not reach. Everything unlisted (/, /items,
// /dispense, /cart, /reports, /alerts) is open to every signed-in role.
const routeRules: RouteRule[] = [
  { path: "/settings", allowedRoles: ["SUPERADMIN"] },
  { path: "/receive", allowedRoles: STOCK_ROLES },
  { path: "/maintenance", allowedRoles: STOCK_ROLES },
];

// The ONLY writes an EXECUTIVE may perform: เบิก/ยืม and its cart templates.
// Everything else — รับคืน, แจ้งชำรุด, รับเข้า, ปรับยอด — is stock management.
// Exact match on /api/dispense so /api/dispense/in-use/*/return stays blocked.
// This is default-deny: a new write route is blocked until it's added here.
const EXEC_WRITE = [/^\/api\/dispense$/, /^\/api\/dispense-templates(\/|$)/];

function matchRoute(pathname: string): RouteRule | null {
  for (const rule of routeRules) {
    if (rule.exact) {
      if (pathname === rule.path) return rule;
    } else {
      if (pathname === rule.path || pathname.startsWith(rule.path + "/")) return rule;
    }
  }
  return null;
}

// Keep the scanned destination across the login bounce (external QR scan on a
// phone that isn't signed in yet).
function loginUrl(request: NextRequest) {
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return url;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — no auth needed
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(loginUrl(request));
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const role = payload.role as string;

    // Executives are read-only apart from เบิก/ยืม. Blanket guard so a route added
    // later is denied by default rather than silently writable.
    if (
      role === "EXECUTIVE" &&
      request.method !== "GET" &&
      pathname.startsWith("/api/") &&
      !EXEC_WRITE.some((re) => re.test(pathname))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check route rules
    const rule = matchRoute(pathname);
    if (rule?.allowedRoles && !rule.allowedRoles.includes(role)) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(loginUrl(request));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)).*)"],
};
