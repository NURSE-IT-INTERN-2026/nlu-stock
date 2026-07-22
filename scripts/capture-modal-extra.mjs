import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const ADMIN = "admin@nlu.ac.th";
const VPS = {
  desktop: { width: 1440, height: 900, dir: "screenshots/desktop" },
  mobile: { width: 375, height: 667, dir: "screenshots/mobile" },
};

const browser = await chromium.launch();
const log = [];
const rec = (file, vp, ok, note = "") => log.push({ file, vp, ok, note });

// login + fresh item id
const lc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await lc.request.post(`${BASE}/api/auth/login`, { data: { email: ADMIN } });
const storageState = await lc.storageState();
const ij = await (await lc.request.get(`${BASE}/api/items?limit=200`)).json();
const arr = ij.items || ij.data || ij;
const item = arr.find((i) => !/^E2E/i.test(i.code || "")) || arr[0];
const ITEM_ID = item.id;
console.log("item:", item.code, ITEM_ID);
await lc.close();

for (const [vpName, vp] of Object.entries(VPS)) {
  const { dir } = vp;
  console.log(`\n===== ${vpName.toUpperCase()} =====`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState });
  const page = await ctx.newPage();

  // --- QR print ---
  try {
    await page.goto(`${BASE}/items/${ITEM_ID}`, { waitUntil: "domcontentloaded" });
    await page.getByText("เพิ่มเข้าตะกร้า", { exact: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.getByText("พิมพ์", { exact: true }).first().click({ timeout: 6000 });
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${dir}/modal-qr-print.png` });
    rec("modal-qr-print.png", vpName, true); console.log("  ✓ modal-qr-print.png");
  } catch (e) { rec("modal-qr-print.png", vpName, false, e.message); console.log("  ✗ modal-qr-print.png", e.message.slice(0,80)); }

  // --- maintenance form (switch tab → บันทึกการซ่อม) ---
  try {
    await page.keyboard.press("Escape").catch(() => {});
    await page.goto(`${BASE}/items/${ITEM_ID}`, { waitUntil: "domcontentloaded" });
    await page.getByText("เพิ่มเข้าตะกร้า", { exact: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.getByText("การซ่อมบำรุง", { exact: true }).first().click({ timeout: 6000 });
    await page.waitForTimeout(700);
    await page.getByText("บันทึกการซ่อม", { exact: true }).first().click({ timeout: 6000 });
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${dir}/modal-maintenance.png` });
    rec("modal-maintenance.png", vpName, true); console.log("  ✓ modal-maintenance.png");
  } catch (e) { rec("modal-maintenance.png", vpName, false, e.message); console.log("  ✗ modal-maintenance.png", e.message.slice(0,80)); }

  await ctx.close();
}
await browser.close();

console.log("\n=== SUMMARY ===");
for (const l of log) console.log(`  ${l.file.padEnd(26)} ${l.vp}: ${l.ok ? "✓" : "✗"} ${l.note}`);
