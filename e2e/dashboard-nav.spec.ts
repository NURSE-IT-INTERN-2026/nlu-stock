import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

// Dashboard navigation sanity: every clickable that navigates reaches its page,
// then returns to the dashboard before the next. Catches broken hrefs / dead links.

async function clickExpectReturn(
  page: Page,
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

  // Alert chips only render when their count is non-zero, so drive whatever is on screen
  // rather than a fixed list of labels. Each href is /alerts?<key>=true.
  const chipHrefs = await page.locator("a[href^='/alerts?']").evaluateAll((els) =>
    els.map((e) => e.getAttribute("href") ?? "")
  );
  for (const href of chipHrefs) {
    const param = href.split("?")[1]; // e.g. lowStock=true — no regex metacharacters
    await clickExpectReturn(page, `chip แจ้งเตือน → ${href}`, page.locator(`a[href="${href}"]`), new RegExp(param));
  }
  await clickExpectReturn(page, "แถว แยกตามประเภทพัสดุ → /items?profile", page.locator("a[href*='profile=']").first(), /\/items\?profile=[^&]+/);
  await clickExpectReturn(page, "ลิงก์ ดูรายงาน → /reports", page.locator("a", { hasText: "ดูรายงาน" }), /\/reports$/);
  await clickExpectReturn(page, "แถว recent dispense → /items/{id}", page.locator("tbody tr").first(), /\/items\/[^/]+$/);
  await clickExpectReturn(page, "แถว recent receive → /items/{id}", page.locator("tbody tr").nth(1), /\/items\/[^/]+$/);
});
