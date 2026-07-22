import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const ADMIN = "admin@nlu.ac.th";

const VPS = {
  desktop: { width: 1440, height: 900, dir: "screenshots/desktop" },
  mobile: { width: 375, height: 667, dir: "screenshots/mobile" },
};

const reportTabs = ["stock-summary","stock-balance","dispense-history","outstanding-loans","receive-history","usage-by-subject","annual-cost","damaged-assets","maintenance-history"];
const settingsTabs = ["items","profiles","categories","locations","users","import"];

const browser = await chromium.launch();
const log = [];
const rec = (file, vp, ok, note = "") => log.push({ file, vp, ok, note });

// login + resolve fresh IDs (DB may have been re-seeded)
const lc = await browser.newContext({ viewport: { width: VPS.desktop.width, height: VPS.desktop.height } });
await lc.request.post(`${BASE}/api/auth/login`, { data: { email: ADMIN } });
const storageState = await lc.storageState();
const apiReq = lc.request;
const itemsJson = await (await apiReq.get(`${BASE}/api/items?limit=200`)).json();
const allItems = itemsJson.items || itemsJson.data || itemsJson;
// prefer a real item (skip E2E test fixtures)
const realItem = allItems.find((i) => !/^E2E/i.test(i.code || "")) || allItems[0];
const ITEM_ID = realItem?.id;
console.log("Detail item:", realItem?.code, ITEM_ID);
// sub-item for sub-detail
let SUB_ID = null, SUB_PARENT = null;
for (const s of ["DAMAGED","UNDER_REPAIR","IN_USE"]) {
  const r = await apiReq.get(`${BASE}/api/sub-items?status=${s}`);
  if (!r.ok()) continue;
  const j = await r.json();
  const arr = j.subItems || [];
  if (arr.length) { SUB_ID = arr[0].id; SUB_PARENT = arr[0].item?.id || arr[0].itemId; console.log(`Sub-item (${s}):`, SUB_ID, "←", SUB_PARENT); break; }
}
await lc.close();

async function cap(page, dir, file) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${dir}/${file}` });
    rec(file, page._vp, true);
    console.log(`  ✓ ${file}`);
  } catch (e) { rec(file, page._vp, false, e.message); console.log(`  ✗ ${file} ${e.message}`); }
}

async function openModal(page, triggerSelector, dir, file) {
  try {
    await triggerSelector.click({ timeout: 6000 });
    await page.waitForSelector('[role="dialog"], [role="menu"], [data-state="open"].popover', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${dir}/${file}` });
    rec(file, page._vp, true, "ok");
    console.log(`  ✓ ${file}`);
  } catch (e) { rec(file, page._vp, false, e.message); console.log(`  ✗ ${file} ${e.message}`); }
}

for (const [vpName, vp] of Object.entries(VPS)) {
  const { dir } = vp;
  console.log(`\n===== ${vpName.toUpperCase()} (${vp.width}x${vp.height}) =====`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState });
  const page = await ctx.newPage();
  page._vp = vpName;

  console.log("Reports tabs:");
  for (const t of reportTabs) {
    await page.goto(`${BASE}/reports?tab=${t}`, { waitUntil: "domcontentloaded" });
    await cap(page, dir, `reports-${t}.png`);
  }

  console.log("Settings tabs:");
  for (const t of settingsTabs) {
    await page.goto(`${BASE}/settings?tab=${t}`, { waitUntil: "domcontentloaded" });
    await cap(page, dir, `settings-${t}.png`);
  }

  console.log("Cart flow:");
  await page.goto(`${BASE}/dispense`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const randBtn = page.getByRole("button", { name: "สุ่มเพิ่มพัสดุจาก list เข้าตะกร้า" });
  if (await randBtn.count()) { await randBtn.click(); await page.waitForTimeout(1200); }
  await cap(page, dir, "dispense-with-cart.png");
  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
  await cap(page, dir, "cart-populated.png");

  // --- item detail + sub-detail (fresh IDs) ---
  console.log("Item detail pages:");
  await page.goto(`${BASE}/items/${ITEM_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByText("เพิ่มเข้าตะกร้า", { exact: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/items-detail.png` });
  rec("items-detail.png", vpName, true); console.log(`  ✓ items-detail.png`);
  if (SUB_ID && SUB_PARENT) {
    await page.goto(`${BASE}/items/${SUB_PARENT}/sub/${SUB_ID}`, { waitUntil: "domcontentloaded" });
    await cap(page, dir, "items-sub-detail.png");
  }

  // --- AddItemModal ---
  console.log("Modals:");
  await page.goto(`${BASE}/settings?tab=items`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await openModal(page, page.getByText("เพิ่มรายการ", { exact: true }).first(), dir, "modal-add-item.png");
  await page.keyboard.press("Escape").catch(() => {});

  // --- CreateKitModal ---
  await page.goto(`${BASE}/items`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await openModal(page, page.getByText("ประกอบชุด", { exact: true }).first(), dir, "modal-create-kit.png");
  await page.keyboard.press("Escape").catch(() => {});

  // --- item-detail action dialogs ---
  const detail = `${BASE}/items/${ITEM_ID}`;
  const actions = [
    { label: "ปรับสต็อก", file: "modal-stock-adjust.png" },
    { label: "ย้ายที่ตั้ง", file: "modal-move-location.png" },
    { label: "แก้ไขข้อมูล", file: "modal-edit-item.png" },
    { label: "แจ้งชำรุด", file: "modal-report-damage.png" },
  ];
  for (const a of actions) {
    await page.goto(detail, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByText("เพิ่มเข้าตะกร้า", { exact: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    await openModal(page, page.getByText(a.label, { exact: true }).first(), dir, a.file);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
  }

  await ctx.close();
}

await browser.close();

console.log("\n\n========== UI CAPTURE SUMMARY ==========");
const files = [...new Set(log.map((l) => l.file))].sort();
let okN = 0, failN = 0;
for (const f of files) {
  const d = log.find((l) => l.file === f && l.vp === "desktop");
  const m = log.find((l) => l.file === f && l.vp === "mobile");
  const ds = d?.ok ? "✓" : "✗"; const ms = m?.ok ? "✓" : "✗";
  if (d?.ok) okN++; if (m?.ok) okN++;
  if (d && !d.ok) failN++; if (m && !m.ok) failN++;
  const note = (!d?.ok || !m?.ok) ? (d?.note || m?.note || "") : "";
  console.log(`  ${f.padEnd(34)} desktop:${ds} mobile:${ms}  ${note}`);
}
console.log(`\nTotal: ${okN} ok, ${failN} failed`);
console.log("========================================");
