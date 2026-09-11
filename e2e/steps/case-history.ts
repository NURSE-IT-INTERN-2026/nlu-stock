import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";

const { Then } = createBdd(test);

/** แถวการ์ดในลิสต์ประวัติ — Rail() ห่อไว้อีกชั้น (ดู expectHistory ใน helpers.ts) */
const historyRows = (page: import("@playwright/test").Page) => page.locator("ol > li > div > button");

async function openHistory(page: import("@playwright/test").Page, code: string) {
  await page.goto(`/items/${code}`);
  await page.getByRole("button", { name: "ประวัติ", exact: true }).click();
  await expect(historyRows(page).first()).toBeVisible({ timeout: 15_000 });
}

Then(
  "ประวัติของ X ต้องมีการ์ดเคส {string} ที่มีเลขเคสและบอกว่าเป็นชิ้น {string}",
  async ({ page, bdd }, label: string, sub: string) => {
    await openHistory(page, bdd.item.code);
    const card = historyRows(page).filter({ hasText: label }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    // เลขเคสต้องเป็นเลขจริงจาก /cases ไม่ใช่ช่องว่าง — ว่างแปลว่าไทม์ไลน์จับคู่เคสไม่ได้
    await expect(card).toContainText(/RC-\d{4}-\d{4}/);
    await expect(card).toContainText(sub);
  }
);

Then("ประวัติของ X ต้องไม่มีการ์ดเปลี่ยนสถานะของการปิดงานซ่อมลอยอยู่", async ({ page, bdd }) => {
  // ปิดงานซ่อมเขียนสองแถวในทรานแซกชันเดียว (MaintenanceRecord + ItemStatusLog) เหตุการณ์
  // เดียวกัน ห่างกันไม่กี่ ms — แถวสถานะต้องไม่โผล่เป็นการ์ดของตัวเองข้างการ์ดเคสที่ปิดไปแล้ว
  await openHistory(page, bdd.item.code);
  await expect(
    historyRows(page).filter({ hasText: /ส่งซ่อม\s*→\s*พร้อมใช้งาน/ })
  ).toHaveCount(0);
});
