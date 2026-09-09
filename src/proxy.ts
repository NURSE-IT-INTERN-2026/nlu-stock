import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { COOKIE_NAME, getJwtSecret, SESSION_AUD } from "@/lib/auth-config";
import { ROLES } from "@/lib/roles";

// startsWith match, so "/api/auth/cmu" covers the callback under it too.
const publicPaths = ["/login", "/api/auth/cmu", "/api/auth/login", "/api/auth/logout", "/api/auth/session"];

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
  // หน้ายืนยันของ BORROWER เท่านั้น — เจ้าหน้าที่ใช้ /cart ซึ่งบันทึกผู้รับจริง. ปล่อยให้ staff
  // เปิดได้ = ฟอร์มที่ยิง /api/borrow แล้วโดน 403 เสมอ (route นั้นกันเจ้าหน้าที่ไว้ตั้งแต่ต้น).
  { path: "/borrow", allowedRoles: ["BORROWER"], exact: true },
  { path: "/receive", allowedRoles: STOCK_ROLES },
  { path: "/maintenance", allowedRoles: STOCK_ROLES },
  { path: "/repairs", allowedRoles: STOCK_ROLES },
];

// The ONLY writes an EXECUTIVE may perform: เบิก/ยืม and its cart templates.
// Everything else — รับคืน, แจ้งชำรุด, รับเข้า, ปรับยอด — is stock management.
// Exact match on /api/dispense so /api/dispense/in-use/*/return stays blocked.
// This is default-deny: a new write route is blocked until it's added here.
const EXEC_WRITE = [/^\/api\/dispense$/, /^\/api\/dispense-templates(\/|$)/];

// BORROWER = นศ./บุคลากรคณะที่สแกน QR เข้ามา. They are not staff: the only page they have any
// business on is the item they scanned, and the only write they may perform is ยืมเอง.
// Same default-deny shape as EXEC_WRITE — a new route stays blocked until listed.
// /api/cart เขียนได้ด้วย แต่เป็น draft ล้วน ไม่ขยับสต็อก — การตัดของจริงยังผ่าน /api/borrow
// ทางเดียว (route นั้นอ่านสต็อกใต้ row lock)
const BORROWER_WRITE = [/^\/api\/borrow$/, /^\/api\/cart$/];

// One item detail page, the scan screen they land on with no item in hand, and the เบิก-ยืม
// grid + its ตะกร้า. Note /items/<code> and NOT /items: the staff catalogue lists every row
// in the คลัง, while /dispense is filtered server-side to what this role may actually take.
const BORROWER_PAGES = [/^\/items\/[^/]/, /^\/scan$/, /^\/dispense$/, /^\/borrow$/];

// GETs a borrower may make. Everything else on /api/ is denied, including the reports
// routes — those only check requireAuth, so leaving GET open handed a student ค่าใช้จ่าย
// ทั้งคณะ, ประวัติการเบิกพร้อมชื่อผู้รับ and the whole stock balance for the price of typing
// a URL. Listed by what the item page and the ยืม dialog actually call, nothing wider:
//   /api/items/<id>[/...]  the item, its pieces, its ประวัติ — NOT /api/items, the list.
//   /api/courses           the รายวิชา picker inside the ยืม dialog.
//   /api/auth/session      who am I, drawn by the layout on every page.
//   /api/dispense/items    the เบิก-ยืม grid. Exact match: /api/dispense itself is the staff
//                          POST and stays denied, GET or not.
//   /api/settings/categories  the ประเภท/หมวดหมู่ filter on that grid — a GET every signed-in
//                          role already makes; the writes next to it are superadmin-only.
//                          สถานที่ไม่อยู่ในนี้: ตัวกรองอาคาร/ชั้น/ห้องถูกซ่อนสำหรับ BORROWER.
const BORROWER_READ = [
  /^\/api\/items\/[^/]/,
  /^\/api\/courses(\/|$)/,
  /^\/api\/auth\/session$/,
  /^\/api\/dispense\/items$/,
  /^\/api\/settings\/categories$/,
  /^\/api\/cart$/,
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

// Keep the scanned destination across the login bounce (external QR scan on a
// phone that isn't signed in yet).
function loginUrl(request: NextRequest) {
  // clone() carries the basePath across; `new URL("/login", request.url)` resolves against
  // the origin and silently drops it, landing on a 404 instead of the login page.
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.search = "";
  url.pathname = "/login";
  url.searchParams.set("next", next);
  return url;
}

export async function proxy(request: NextRequest) {
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
    // `audience` is the guard, not the signature: the OAuth `state` token is signed with this
    // same secret and reaches the browser in a URL (lib/cmu-oauth signState), so anyone could
    // otherwise post it back as the session cookie.
    const { payload } = await jwtVerify(token, getJwtSecret(), { audience: SESSION_AUD });
    // Belt to that brace. Both default-deny blocks below key off `role`, so an undefined role
    // would skip BOTH and let every unlisted path fall through to next(). Unknown role = not a
    // session: fall into the catch, which bounces to /login and clears the cookie.
    const role = payload.role as string;
    if (!(ROLES as readonly string[]).includes(role)) throw new Error("token carries no known role");

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

    // Borrowers are penned in before the shared rules run: allowlisted, not listed page by
    // page, so a route added later is denied until someone adds it here on purpose.
    if (role === "BORROWER") {
      if (pathname.startsWith("/api/")) {
        const allowed =
          request.method === "GET"
            ? BORROWER_READ.some((re) => re.test(pathname))
            : BORROWER_WRITE.some((re) => re.test(pathname));
        if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      } else if (!BORROWER_PAGES.some((re) => re.test(pathname))) {
        const home = request.nextUrl.clone();
        home.search = "";
        home.pathname = "/scan";
        return NextResponse.redirect(home);
      }
    }

    // Check route rules
    const rule = matchRoute(pathname);
    if (rule?.allowedRoles && !rule.allowedRoles.includes(role)) {
      const home = request.nextUrl.clone();
      home.search = "";
      home.pathname = "/";
      return NextResponse.redirect(home);
    }

    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(loginUrl(request));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  // "/" is listed separately and is NOT redundant: with a basePath the pattern below is
  // matched as /nlu-stock/((?!…).*), which needs a slash and something after it, so a request
  // to the bare /nlu-stock skipped this file entirely — the dashboard shell answered 200 to
  // signed-out visitors and to borrowers alike.
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico|uploads|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)).*)"],
};
