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
  "ฉันเปิดแท็บ {string} ของหน้า {string} แล้วแก้ช่องราคาต่อหน่วยของแถวนั้นเป็น {int}",
  async ({ page, bdd }, tab: string, _pageLabel: string, price: number) => {
    await page.goto("/reports?tab=receive-history");
    await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible({ timeout: 15_000 });
    const row = page.getByRole("row").filter({ hasText: bdd.item.code }).first();
    await row.getByRole("spinbutton").fill(String(price));
    await row.getByRole("spinbutton").blur();
    // the PATCH fires on blur — wait for it in the DB, not on the page
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
    const row = page.getByRole("row").filter({ hasText: bdd.item.code }).first();
    await expect(row.getByRole("spinbutton")).toHaveValue(String(price), { timeout: 15_000 });
    // price persisted server-side too, not just in the input
    const { rows } = await pool.query(
      `SELECT "unitCost" FROM receive_records WHERE "itemId" = $1 ORDER BY "receivedAt" DESC LIMIT 1`,
      [bdd.item.id]
    );
    expect(Number(rows[0]?.unitCost)).toBe(price);
  }
);
