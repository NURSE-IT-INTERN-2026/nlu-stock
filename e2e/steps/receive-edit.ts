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
