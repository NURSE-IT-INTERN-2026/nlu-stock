import { test, expect } from "./fixtures";
import type { Locator } from "@playwright/test";

// Dashboard navigation sanity: every clickable that navigates reaches its page,
// then returns to the dashboard before the next. Catches broken hrefs / dead links.

async function clickExpectReturn(
  page,
  label: string,
  locator: Locator,
  expectedUrl: RegExp
) {
  await test.step(label, async () => {
    await locator.first().click({ timeout: 8000 });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(expectedUrl);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });
}

test("dashboard: every nav element reaches its page", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await clickExpectReturn(page, "การ์ด รายการพัสดุทั้งหมด → /items", page.locator("a", { hasText: "รายการพัสดุทั้งหมด" }), /\/items$/);
  await clickExpectReturn(page, "การ์ด ใกล้หมด → /alerts?lowStock", page.locator("a", { hasText: "ใกล้หมด" }), /lowStock=true/);
  await clickExpectReturn(page, "การ์ด หมดอายุใน 30 วัน → /alerts?nearExpiry", page.locator("a", { hasText: "หมดอายุใน 30 วัน" }), /nearExpiry=true/);
  await clickExpectReturn(page, "การ์ด ยืมอยู่ → /items?onLoan", page.locator("a", { hasText: "ยืมอยู่" }), /onLoan=true/);
  await clickExpectReturn(page, "แถว แยกตามประเภทพัสดุ → /items?profile", page.locator("a[href*='profile=']").first(), /\/items\?profile=[^&]+/);
  await clickExpectReturn(page, "ลิงก์ ดูรายงาน → /reports", page.locator("a", { hasText: "ดูรายงาน" }), /\/reports$/);
  await clickExpectReturn(page, "แถว recent dispense → /items/{id}", page.locator("tbody tr").first(), /\/items\/[^/]+$/);
  await clickExpectReturn(page, "แถว recent receive → /items/{id}", page.locator("tbody tr").nth(1), /\/items\/[^/]+$/);
});
