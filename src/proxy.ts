import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME } from "@/lib/auth-config";
import { validateSessionToken } from "@/lib/auth";

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
  /^\/api\/items\/(?!search-ai(?:\/|$)|suggest-code(?:\/|$)|quick-create(?:\/|$))[^/]+(?:\/(?:history|open-repairs|sub-items\/[^/]+))?$/,
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

/**
 * CSRF — Origin ต้องเป็นของเราเอง ไม่งั้นไม่ให้เขียน
 *
 * คุกกี้ session เป็น SameSite=Lax ซึ่งฟังดูเหมือนพอแล้ว แต่ Lax นับที่ "site" = eTLD+1
 * ไม่ใช่ origin. พออยู่ใต้ cmu.ac.th ทุกซับโดเมนของมหาลัยคือ same-site ทั้งหมด —
 * หน้าเว็บไหนก็ตามในนั้นที่โดน XSS หรือที่ใครฝากไฟล์ HTML ไว้ได้ ยิง POST /api/dispense
 * มาพร้อมคุกกี้ของเจ้าหน้าที่ที่เปิดหน้านั้นค้างไว้ได้เลย ระบบไม่มีอะไรแยกออกว่าคำขอนั้น
 * มาจากหน้าจอของเราหรือของคนอื่น
 *
 * ไม่มี Origin = ปล่อยผ่าน และไม่ใช่ช่องโหว่: เบราว์เซอร์ส่ง Origin ทุกครั้งที่ยิง non-GET
 * ข้าม origin — ผู้โจมตีสั่งให้เบราว์เซอร์เหยื่อ "ไม่ส่ง" ไม่ได้. คำขอที่ไม่มี Origin จึงมา
 * จาก curl/สคริปต์/APIRequestContext ซึ่งไม่มีคุกกี้ของเหยื่อให้พกอยู่แล้ว
 *
 * เทียบกับ config ไม่ใช่กับ host header ทั้งที่อย่างหลังดูตรงไปตรงมากว่า: x-forwarded-host
 * มาจากลูกค้าเว้นแต่ proxy หน้าบ้านจะเขียนทับให้ ถ้ามันไหลผ่าน ผู้โจมตีส่ง Origin: evil.com
 * คู่กับ X-Forwarded-Host: evil.com ก็ผ่านทั้งคู่ — ด่านที่ให้ผู้ถูกตรวจกรอกเฉลยเอง. และใน
 * ทางกลับกัน proxy ที่เขียน Host เป็น localhost:3000 จะทำให้ทุกการเขียนของทุกคน 403
 *
 * NEXT_PUBLIC_APP_URL คือ origin ที่ผู้ใช้พิมพ์จริง (มี basePath ต่อท้าย URL.origin ตัดให้)
 * ส่วน tunnel/LAN ใช้ CMU_OAUTH_ORIGINS ชุดเดียวกับที่ callbackUri() ใช้อยู่แล้ว — ที่ตั้งค่า
 * สองที่ที่ต้องตรงกันเองคือที่ตั้งค่าที่วันหนึ่งจะไม่ตรงกัน
 */
function ownOrigins(): string[] {
  const out: string[] = [];
  try {
    out.push(new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").origin);
  } catch {
    // ไม่ตั้งค่าไว้ = ด่านนี้ทำงานไม่ได้ ร้องออกมาดีกว่าปล่อยผ่านหรือ 403 ทุกใบแบบไม่บอกสาเหตุ
    throw new Error("NEXT_PUBLIC_APP_URL ไม่ได้ตั้งค่า — ตรวจ Origin ไม่ได้");
  }
  for (const raw of (process.env.CMU_OAUTH_ORIGINS ?? "").split(",")) {
    const v = raw.trim().replace(/\/$/, "");
    if (v) out.push(v);
  }
  return out;
}

export function crossSiteWrite(method: string, origin: string | null, allowed = ownOrigins()): boolean {
  if (method === "GET" || method === "HEAD") return false;
  if (!origin) return false;
  // includes ตรงๆ ไม่ต้อง parse: Origin ที่เบราว์เซอร์ส่งเป็น scheme://host[:port] เสมอ ไม่มี
  // path ไม่มี slash ปิดท้าย ส่วน "null" ของ sandboxed iframe ก็ไม่มีวันอยู่ในรายการ
  return !allowed.includes(origin);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ก่อน publicPaths: /api/auth/logout เป็น POST ที่ไม่ต้องล็อกอินก็จริง แต่ก็ยังไม่ใช่สิ่งที่
  // เว็บอื่นควรสั่งแทนผู้ใช้ได้
  if (crossSiteWrite(request.method, request.headers.get("origin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Public paths — no auth needed
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(loginUrl(request));
  }

  try {
    // Validate signature/audience and the current account grant before applying route policy.
    const payload = await validateSessionToken(token);
    if (!payload) throw new Error("Session is no longer authorized");
    const role = payload.role;

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
