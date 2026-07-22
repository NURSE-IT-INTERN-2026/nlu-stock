import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 375, height: 667 };
const ADMIN = "admin@nlu.ac.th";

const out = {
  desktop: "screenshots/desktop",
  mobile: "screenshots/mobile",
};
await mkdir(out.desktop, { recursive: true });
await mkdir(out.mobile, { recursive: true });

const browser = await chromium.launch();
const results = []; // { file, desktop, mobile, note }

function note(file, status, extra = "") {
  const row = results.find((r) => r.file === file) || (results.push({ file }), results[results.length - 1]);
  row[status] = true;
  if (extra) row.note = extra;
}

async function shoot(page, file, label, ctxName) {
  const path = `${ctxName === "desktop" ? out.desktop : out.mobile}/${file}`;
  try {
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200); // let client data settle
    await page.screenshot({ path });
    note(file, ctxName);
    console.log(`  [${ctxName}] ✓ ${file}`);
  } catch (e) {
    note(file, ctxName === "desktop" ? "desktop" : "mobile", `ERR ${e.message}`);
    console.log(`  [${ctxName}] ✗ ${file} — ${e.message}`);
  }
}

async function visitAndShoot(url, file, storageState) {
  for (const [name, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
    const ctx = await browser.newContext({ viewport: vp, storageState });
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      const status = resp?.status();
      if (status && status >= 400) {
        note(file, name, `HTTP ${status}`);
        console.log(`  [${name}] ✗ ${file} — HTTP ${status}`);
        await page.screenshot({ path: `${name === "desktop" ? out.desktop : out.mobile}/${file}` }).catch(() => {});
      } else {
        await shoot(page, file, file, name);
      }
    } catch (e) {
      note(file, name, `NAV ${e.message}`);
      console.log(`  [${name}] ✗ ${file} — ${e.message}`);
    } finally {
      await ctx.close();
    }
  }
}

// --- login, persist cookies ---
console.log("Logging in as", ADMIN);
const loginCtx = await browser.newContext({ viewport: DESKTOP });
const loginPage = await loginCtx.newPage();
const loginResp = await loginPage.request.post(`${BASE}/api/auth/login`, { data: { email: ADMIN } });
if (!loginResp.ok()) {
  console.error("LOGIN FAILED", loginResp.status(), await loginResp.text().catch(() => ""));
  process.exit(1);
}
const storageState = await loginCtx.storageState();
await loginCtx.close();
console.log("Logged in. Cookie:", !!storageState.cookies.length);

// --- resolve dynamic IDs via API ---
const api = await loginPage.context().request; // stale ctx; recreate
const apiCtx = await browser.newContext({ viewport: DESKTOP, storageState });
const apiReq = apiCtx.request;
const itemsResp = await apiReq.get(`${BASE}/api/items?limit=50`);
const itemsJson = await itemsResp.json();
const itemsList = itemsJson.items || itemsJson.data || itemsJson;
const firstItem = Array.isArray(itemsList) ? itemsList[0] : null;
console.log("First item:", firstItem?.id, firstItem?.code);

// find a real sub-item via the status-filtered endpoint (collection route is [subId]-only)
let subItemId = null;
let subItemParent = null;
for (const s of ["DAMAGED", "UNDER_REPAIR", "IN_USE"]) {
  const subResp = await apiReq.get(`${BASE}/api/sub-items?status=${s}`);
  if (!subResp.ok()) continue;
  const subJson = await subResp.json();
  const subList = subJson.subItems || subJson.items || subJson.data || [];
  if (Array.isArray(subList) && subList.length) {
    subItemId = subList[0].id;
    subItemParent = subList[0].item?.id || subList[0].itemId;
    console.log(`Sub-item found (${s}):`, subItemId, "under item", subItemParent);
    break;
  }
}
await apiCtx.close();

// --- route table ---
const routes = [
  { url: "/", file: "dashboard.png" },
  { url: "/items", file: "items-list.png" },
  { url: firstItem ? `/items/${firstItem.id}` : null, file: "items-detail.png" },
  { url: subItemId && subItemParent ? `/items/${subItemParent}/sub/${subItemId}` : null, file: "items-sub-detail.png" },
  { url: "/dispense", file: "dispense.png" },
  { url: "/receive", file: "receive.png" },
  { url: "/cart", file: "cart.png" },
  { url: "/reports", file: "reports.png" },
  { url: "/maintenance", file: "maintenance.png" },
  { url: "/alerts", file: "alerts.png" },
  { url: "/settings", file: "settings.png" },
];

for (const r of routes) {
  if (!r.url) {
    console.log(`\nSkipping ${r.file} — no valid ID`);
    results.push({ file: r.file, skipped: true, note: "no valid id" });
    continue;
  }
  console.log(`\nCapturing ${r.file} ← ${r.url}`);
  await visitAndShoot(`${BASE}${r.url}`, r.file, storageState);
}

// --- login page (logged-out) ---
console.log("\nCapturing login.png (logged out)");
for (const [name, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
  const ctx = await browser.newContext({ viewport: vp }); // no storageState = logged out
  const page = await ctx.newPage();
  const resp = await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 20000 });
  if (resp?.status() && resp.status() >= 400) {
    note("login.png", name, `HTTP ${resp.status()}`);
  } else {
    await shoot(page, "login.png", "login.png", name);
  }
  await ctx.close();
}

await browser.close();

// --- summary ---
console.log("\n\n========== SUMMARY ==========");
for (const r of results) {
  const ds = r.skipped ? "—" : r.desktop ? "✓" : "✗";
  const mb = r.skipped ? "—" : r.mobile ? "✓" : "✗";
  const tag = r.skipped ? "SKIP" : r.note || "ok";
  console.log(`  ${r.file.padEnd(22)} desktop:${ds} mobile:${mb}  ${tag}`);
}
console.log("=============================");
