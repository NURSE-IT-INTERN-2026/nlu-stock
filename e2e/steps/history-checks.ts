import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";

const { Then } = createBdd(test);

/**
 * ทุก flow ที่ทำให้ของเปลี่ยน ต้องพิสูจน์ได้ที่หน้า **ประวัติ** ของชิ้นนั้น ไม่ใช่แค่ยอดใน DB
 * หรือ toast เขียว — คนที่มาเปิดดูทีหลังเห็นแค่หน้านี้หน้าเดียว.
 *
 * สองสเต็ปนี้ใช้ร่วมกันทั้ง suite: แถวเดี่ยว (รับเข้า/ปรับยอด/ย้ายที่/สถานะ) กับการ์ดเคสที่ยุบ
 * หลายขั้นไว้ในใบเดียว (ยืม/เบิก/ตั้งใช้/ซ่อม) ซึ่งต้องกดเข้าไปอ่านไทม์ไลน์ข้างใน
 */

const historyRows = (page: import("@playwright/test").Page) => page.locator("ol > li > div > button");

async function openHistory(page: import("@playwright/test").Page, code: string) {
  await page.goto(`/items/${code}`);
  await page.getByRole("button", { name: "ประวัติ", exact: true }).click();
  await expect(historyRows(page).first()).toBeVisible({ timeout: 15_000 });
}

Then("ประวัติของ X ต้องมีรายการ {string}", async ({ page, bdd }, label: string) => {
  await openHistory(page, bdd.item.code);
  await expect(historyRows(page).filter({ hasText: label }).first()).toBeVisible({ timeout: 15_000 });
});

Then(
  "ประวัติของ X ต้องมีเคส {string} ที่ไทม์ไลน์เรียง {string}",
  async ({ page, bdd }, caseName: string, steps: string) => {
    await openHistory(page, bdd.item.code);
    const card = historyRows(page).filter({ hasText: caseName }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();

    // ช่องขวาคือแผงเดียวที่มีปุ่มแท็บ ไทม์ไลน์ — ยึดจากตรงนั้น ไม่ใช่ ol ตัวแรกซึ่งเป็นลิสต์ทางซ้าย
    const pane = page
      .locator("section")
      .filter({ has: page.getByRole("button", { name: "ไทม์ไลน์", exact: true }) })
      .last();
    await pane.getByRole("button", { name: "ไทม์ไลน์", exact: true }).click();
    const rows = pane.locator("ol > li");
    for (const [i, label] of steps.split(",").map((s) => s.trim()).entries()) {
      await expect(rows.nth(i)).toContainText(label, { timeout: 10_000 });
    }
  }
);
