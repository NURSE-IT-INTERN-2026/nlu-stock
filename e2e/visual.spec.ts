import { test, expect } from "./fixtures";

// ponytail: stdlib toHaveScreenshot — no percy/chromatic dep.
// Mask greeting: greeting changes by hour + timestamp refreshes every minute.
// Dashboard data counts swing <1% under the random seed, so it stays stable.
//   Data-heavy pages (reports etc.) flake on the random seed → not covered here.

test("visual: dashboard", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(
    page.locator("text=/รายการ|ต่ำ|ใกล้|ยืม|low|stock/i").first()
  ).toBeVisible({ timeout: 10_000 });

  const greeting = page.locator("h1");
  const timestamp = page.getByText(/อัปเดตล่าสุด/);

  await expect(page).toHaveScreenshot("dashboard.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
    mask: [greeting, timestamp],
  });
});
