import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";
import { createCountItem } from "./helpers";

const { Given, When, Then } = createBdd(test);

Given("มีรายการนับตามจำนวน X มียอดพร้อมใช้", async ({ request, bdd, uniqueCode }) => {
  bdd.item = await createCountItem(request, uniqueCode, 5);
});

When(
  "ฉันเปิดหน้ารายละเอียดของ X กด {string} เลือกสถานที่ แล้วยืนยัน",
  async ({ page, bdd }, label: string) => {
    await page.goto(`/items/${bdd.item.code}`);
    await page.getByRole("button", { name: label }).click();
    const dialog = page.getByRole("dialog");
    // LocationCascadePicker fields carry placeholders, not labels. พิมพ์อย่างเดียวไม่พอ:
    // combobox remount ตอนตัวเลือกโหลดเสร็จแล้วลบค่าที่พิมพ์ทิ้ง (เคยหลุดเป็นเทสแดงสลับรอบ)
    // — พิมพ์ prefix แล้วคลิกตัวเลือกจาก dropdown เหมือนที่ move.ts ทำ
    await dialog.getByPlaceholder("เช่น อาคาร 2").fill("อาคาร");
    await dialog.getByRole("button", { name: "อาคาร 2", exact: true }).first().click();
    await dialog.getByPlaceholder("เช่น 4", { exact: true }).fill("ชั้น");
    await dialog.getByRole("button", { name: "ชั้น 4", exact: true }).first().click();
    await dialog.getByPlaceholder("เช่น 402", { exact: true }).fill("402");
    await dialog.getByRole("button", { name: "402", exact: true }).first().click();
    // the cascade emits its ref from an effect — give it a tick before saving,
    // or the dialog falls back to the previous location and nothing moves
    await page.waitForTimeout(400);
    await expect(dialog.getByText(/ไม่พบสถานที่นี้/)).toHaveCount(0);
    await dialog.getByRole("button", { name: "ยืนยัน" }).click();
  }
);

Then("ฉันจะเห็นข้อความว่านำไปใช้งานแล้ว", async ({ page }) => {
  await expect(page.getByText(/นำ.*ไปใช้งาน.*แล้ว/)).toBeVisible({ timeout: 10_000 });
});
