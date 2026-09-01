import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";

const { Given, When } = createBdd(test);

/** Menu label → app URL, mirroring the sidebar. */
const PAGES: Record<string, string> = {
  "รายการพัสดุ": "/items",
  "เบิก-ยืมพัสดุ": "/dispense",
  "รับเข้า-คืนพัสดุ": "/receive",
  บำรุงรักษา: "/maintenance",
  ซ่อมแซม: "/repairs",
  "รายงาน & สถิติ": "/reports",
  "รายงานและสถิติ": "/reports",
  ตั้งค่า: "/settings",
};

Given("ฉันเปิดหน้า {string}", async ({ page }, label: string) => {
  const url = PAGES[label];
  if (!url) throw new Error(`unknown page label: ${label}`);
  await page.goto(url);
});

/** receive / reports tabs are URL-addressable — deep-link instead of clicking. */
const TABS: Record<string, string> = {
  นำเข้าคลัง: "/receive?tab=receive",
  "รับคืนจากใบยืม": "/receive?tab=return",
  คืนเข้าคลัง: "/receive?tab=in_use",
};

When("ฉันเปิดหน้า {string} แท็บ {string}", async ({ page }, pageLabel: string, tabLabel: string) => {
  const base = PAGES[pageLabel];
  if (!base) throw new Error(`unknown page label: ${pageLabel}`);
  await page.goto(TABS[tabLabel] ? TABS[tabLabel] : base);
  await expect(page.getByRole("button", { name: tabLabel })).toBeVisible();
});
