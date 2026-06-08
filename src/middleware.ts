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

const routeRules: RouteRule[] = [
  // Settings: admin only
  { path: "/settings", allowedRoles: ["ADMIN"] },
  // Instructor: view only
  { path: "/", allowedRoles: ["ADMIN", "STAFF", "INSTRUCTOR"], exact: true },
  { path: "/items", allowedRoles: ["ADMIN", "STAFF", "INSTRUCTOR"] },
  { path: "/reports", allowedRoles: ["ADMIN", "STAFF", "INSTRUCTOR"] },
];

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — no auth needed
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const role = payload.role as string;

    // Check route rules
    const rule = matchRoute(pathname);
    if (rule?.allowedRoles && !rule.allowedRoles.includes(role)) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
