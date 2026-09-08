import { createBdd } from "playwright-bdd";
import { test, expect, pool } from "../fixtures";
import { createConsumable } from "./helpers";

const { Given, When, Then } = createBdd(test);

Given(
  "มีใบรับเข้าของ X ที่กรอกราคาไว้แล้ว",
  async ({ request, bdd, uniqueCode }) => {
    const item = await createConsumable(request, uniqueCode, 0);
    const res = await request.post("/api/receive", {
      data: { items: [{ itemId: item.id, quantity: 5, lotNumber: `E2E-${uniqueCode}`, expiryDate: null }] },
    });
    if (!res.ok()) throw new Error(`receive setup failed: ${res.status()}`);
    bdd.item = item;
  }
);

When(
  "ฉันเปิดแท็บ {string} ของหน้า {string} แล้วกดแถวนั้นเพื่อแก้ราคาต่อหน่วยเป็น {int}",
  async ({ page, bdd }, tab: string, _pageLabel: string, price: number) => {
    await page.goto("/reports?tab=receive-history");
    await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible({ timeout: 15_000 });
    const row = page.getByRole("row").filter({ hasText: bdd.item.code }).filter({ visible: true }).first();
    await row.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("ราคาต่อหน่วย (บาท)")).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel("ราคาต่อหน่วย (บาท)").fill(String(price));
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    // the dialog closes optimistically after the PATCH resolves — confirm it in the DB
    await expect
      .poll(async () => {
        const { rows } = await pool.query(
          `SELECT "unitCost" FROM receive_records WHERE "itemId" = $1 ORDER BY "receivedAt" DESC LIMIT 1`,
          [bdd.item.id]
        );
        return Number(rows[0]?.unitCost);
      }, { timeout: 10_000 })
      .toBe(price);
  }
);

Then(
  "ฉันจะเห็นราคา {int} คงอยู่เมื่อโหลดแท็บใหม่",
  async ({ page, bdd }, price: number) => {
    await page.reload();
    const row = page.getByRole("row").filter({ hasText: bdd.item.code }).filter({ visible: true }).first();
    await expect(row).toContainText(String(price), { timeout: 15_000 });
    // price persisted server-side too, not just on screen
    const { rows } = await pool.query(
      `SELECT "unitCost" FROM receive_records WHERE "itemId" = $1 ORDER BY "receivedAt" DESC LIMIT 1`,
      [bdd.item.id]
    );
    expect(Number(rows[0]?.unitCost)).toBe(price);
  }
);

// ── regression: บันทึกแล้วต้องอยู่หน้าเดิม ──
// แท็บนี้เรียง receivedAt desc หน้าละ 20 — ดันใบของ X ให้ตกหน้า 2 ด้วยแถวคั่นที่ใหม่กว่า
// แล้วใช้ "ยังเห็นแถวของ X อยู่ไหม" เป็นตัวชี้หน้า: แถวนี้ไม่มีทางอยู่หน้า 1
Given("มีใบรับเข้าเก่าของ X ที่ตกไปอยู่หน้า 2 ของแท็บเข้าคลัง", async ({ request, bdd, uniqueCode }) => {
  const item = await createConsumable(request, uniqueCode, 0);
  const res = await request.post("/api/receive", {
    data: { items: [{ itemId: item.id, quantity: 5, lotNumber: `E2E-${uniqueCode}`, expiryDate: null }] },
  });
  if (!res.ok()) throw new Error(`receive setup failed: ${res.status()}`);
  bdd.item = item;

  const { rows: mine } = await pool.query(
    `SELECT "receivedBy" FROM receive_records WHERE "itemId" = $1 LIMIT 1`,
    [item.id],
  );
  const { rows: others } = await pool.query(`SELECT id FROM items WHERE id <> $1 LIMIT 1`, [item.id]);
  // คนละพัสดุกับ X เพื่อให้รหัสของ X ยังโผล่แถวเดียวในตาราง
  await pool.query(
    `INSERT INTO receive_records (id, "itemId", quantity, "receivedBy", "receivedAt", "unitCost")
     SELECT 'e2e-page2-' || g, $1, 1, $2, now() + (g || ' seconds')::interval, 1
       FROM generate_series(1, 25) g`,
    [others[0].id, mine[0].receivedBy],
  );
});

When("ฉันไปหน้า 2 แล้วกดแถวของ X แก้ราคาต่อหน่วยเป็น {int}", async ({ page, bdd }, price: number) => {
  await page.goto("/reports?tab=receive-history");
  await expect(page.getByRole("button", { name: "เข้าคลัง", exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Next page" }).click();

  const row = page.getByRole("row").filter({ hasText: bdd.item.code }).filter({ visible: true }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("ราคาต่อหน่วย (บาท)")).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel("ราคาต่อหน่วย (บาท)").fill(String(price));
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
});

Then("ฉันจะยังอยู่หน้าเดิมและเห็นราคา {int} ที่แถวของ X", async ({ page, bdd }, price: number) => {
  const row = page.getByRole("row").filter({ hasText: bdd.item.code }).filter({ visible: true }).first();
  await expect(row, "เด้งกลับหน้า 1 — แถวของ X หายไปจากจอ").toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText(String(price), { timeout: 15_000 });
});
