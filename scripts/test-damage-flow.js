// ponytail: one-shot UI+DB check for the consumable damage flow (Option B).
// Drives localhost:3000, logs in passwordless, opens a CONSUMABLE item, clicks
// "แจ้งชำรุด", asserts the adjust dialog opens with reason locked to DAMAGED,
// submits, and verifies availableQty dropped + item.status stays AVAILABLE.
const { chromium } = require("playwright");
const pg = require("pg");

const BASE = "http://localhost:3000";
const ITEM_ID = process.env.ITEM_ID || "cmr1otqy401k0v1xweqtr70xs"; // NLU-CON-081 (consumable, 0 lots)
const DAMAGE = 5;
const DB = "postgresql://nlu_stock:nlu_stock@localhost:5433/nlu_stock";

(async () => {
  const db = new pg.Client(DB);
  await db.connect();
  const before = (await db.query(
    `SELECT code, name, "availableQty", "totalQty", status FROM items WHERE id=$1`, [ITEM_ID]
  )).rows[0];
  console.log("DB before :", before);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERR:", m.text()); });

  const login = await page.request.post(`${BASE}/api/auth/login`, { data: { email: "admin@nlu.ac.th" } });
  console.log("login     :", login.status(), login.ok() ? "OK" : "FAIL");

  await page.goto(`${BASE}/items/${ITEM_ID}`);
  await page.waitForLoadState("networkidle");

  const damageBtn = page.getByRole("button", { name: "แจ้งชำรุด" }).first();
  await damageBtn.waitFor({ timeout: 10000 });
  await damageBtn.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "e2e-shot-1-before.png", fullPage: true });

  await damageBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "e2e-shot-2-dialog.png", fullPage: true });

  const dlg = page.getByRole("dialog");
  const titleCount = await dlg.getByText("แจ้งชำรุด").count();
  const reasonCount = await dlg.getByText("เสียหาย").count();
  const reasonSelectAbsent = (await dlg.getByText("เลือกเหตุผล").count()) === 0;
  console.log("dialog    : title แจ้งชำรุด =", titleCount, "| reason เสียหาย =", reasonCount, "| reason-select hidden =", reasonSelectAbsent);

  // shelf-mode count input (no lots) → enter real remaining = available - DAMAGE
  const countInput = dlg.getByRole("spinbutton");
  await countInput.fill(String(before.availableQty - DAMAGE));
  await page.screenshot({ path: "e2e-shot-3-filled.png", fullPage: true });

  await dlg.getByRole("button", { name: "บันทึก" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "e2e-shot-4-after.png", fullPage: true });

  const after = (await db.query(
    `SELECT "availableQty", "totalQty", status FROM items WHERE id=$1`, [ITEM_ID]
  )).rows[0];
  const adj = (await db.query(
    `SELECT delta, "previousQty", "newQty", reason FROM stock_adjustments WHERE "itemId"=$1 ORDER BY "adjustedAt" DESC LIMIT 1`, [ITEM_ID]
  )).rows[0];
  console.log("DB after  :", after);
  console.log("adjustment:", adj);

  console.log("\n=== RESULT ===");
  console.log("availableQty reduced :", after.availableQty === before.availableQty - DAMAGE, `(${before.availableQty} → ${after.availableQty}, expect ${before.availableQty - DAMAGE})`);
  console.log("item.status AVAILABLE:", after.status === "AVAILABLE", `(${after.status})`);
  console.log("reason = DAMAGED_PENDING_REPAIR :", adj?.reason === "DAMAGED_PENDING_REPAIR");
  console.log("adjustment recorded  :", !!adj);

  await browser.close();
  await db.end();
})().catch((e) => { console.error("ERR", e); process.exit(1); });
