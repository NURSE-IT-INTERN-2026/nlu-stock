import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const ADMIN = "admin@nlu.ac.th";
const VPS = {
  desktop: { width: 1440, height: 900, dir: "screenshots/desktop" },
  mobile: { width: 375, height: 667, dir: "screenshots/mobile" },
};

const browser = await chromium.launch();
const log = [];
const rec = (f, vp, ok, note="") => log.push({ f, vp, ok, note });

const lc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await lc.request.post(`${BASE}/api/auth/login`, { data: { email: ADMIN } });
const storageState = await lc.storageState();
const ij = await (await lc.request.get(`${BASE}/api/items?limit=200`)).json();
const arr = ij.items || ij.data || ij;
const item = arr.find((i) => !/^E2E/i.test(i.code || "")) || arr[0];
const ITEM_ID = item.id;
console.log("item:", item.code, ITEM_ID);
await lc.close();

const shoot = async (page, dir, file) => {
  try { await page.waitForTimeout(1200); await page.screenshot({ path: `${dir}/${file}` }); rec(file, page._vp, true); console.log(`  ✓ ${file}`); }
  catch (e) { rec(file, page._vp, false, e.message); console.log(`  ✗ ${file} ${e.message.slice(0,70)}`); }
};

for (const [vpName, vp] of Object.entries(VPS)) {
  const { dir } = vp;
  console.log(`\n===== ${vpName.toUpperCase()} =====`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState });
  const page = await ctx.newPage();
  page._vp = vpName;

  // --- receive tabs (in_use, return, repair) ---
  console.log("Receive tabs:");
  for (const t of ["in_use","return","repair"]) {
    await page.goto(`${BASE}/receive?tab=${t}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(()=>{});
    await shoot(page, dir, `receive-${t}.png`);
  }

  // --- item-detail tab contents ---
  console.log("Item-detail tabs:");
  await page.goto(`${BASE}/items/${ITEM_ID}`, { waitUntil: "domcontentloaded" });
  await page.getByText("เพิ่มเข้าตะกร้า",{exact:true}).first().waitFor({ timeout: 8000 }).catch(()=>{});
  await page.waitForTimeout(800);
  const detailTabs = [
    { label: "รูปภาพ", file: "items-detail-media.png" },
    { label: "ประวัติ", file: "items-detail-history.png" },
    { label: "รหัสย่อย", file: "items-detail-subcodes.png" },
    { label: "ชุดประกอบ", file: "items-detail-kit.png" },
  ];
  for (const tb of detailTabs) {
    try {
      const btn = page.getByText(tb.label, { exact: false }).first();
      await btn.click({ timeout: 4000 });
      await shoot(page, dir, tb.file);
    } catch (e) { rec(tb.file, vpName, false, "tab not present"); console.log(`  – ${tb.file} (tab not present)`); }
  }

  // --- QR scanner modal (dispense → สแกน QR) ---
  console.log("QR scanner:");
  try {
    await page.goto(`${BASE}/dispense`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(()=>{});
    await page.getByRole("button", { name: "สแกน QR" }).click({ timeout: 6000 });
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(()=>{});
    await page.waitForTimeout(1500); // camera-attempt + fallback
    await page.screenshot({ path: `${dir}/modal-qr-scanner.png` });
    rec("modal-qr-scanner.png", vpName, true); console.log("  ✓ modal-qr-scanner.png");
  } catch (e) { rec("modal-qr-scanner.png", vpName, false, e.message); console.log(`  ✗ modal-qr-scanner.png ${e.message.slice(0,70)}`); }

  await ctx.close();
}
await browser.close();

console.log("\n=== SUMMARY ===");
for (const l of log) console.log(`  ${l.f.padEnd(28)} ${l.vp}: ${l.ok?"✓":"✗"} ${l.note}`);
