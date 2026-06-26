import { test, expect, pool } from "./fixtures";

const PAGES = [
  "/",
  "/items",
  "/dispense",
  "/receive",
  "/reports",
  "/alerts",
  "/maintenance",
  "/settings",
];

for (const path of PAGES) {
  test(`smoke: ${path || "/ (dashboard)"} loads`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status() ?? 500).toBeLessThan(400);
    // not bounced back to login
    await expect(page).not.toHaveURL(/\/login/);
  });
}

test("smoke: item detail loads", async ({ page }) => {
  const { rows } = await pool.query(`SELECT id FROM items ORDER BY "createdAt" LIMIT 1`);
  if (rows.length === 0) test.skip(true, "no seeded items");
  const res = await page.goto(`/items/${rows[0].id}`);
  expect(res?.status() ?? 500).toBeLessThan(400);
});

test("smoke: dashboard renders metric cards", async ({ page }) => {
  await page.goto("/");
  // metric cards exist (at least one)
  await expect(page.locator("text=/รายการ|ต่ำ|ใกล้|ยืม|low|stock/i").first()).toBeVisible({ timeout: 10_000 });
});
