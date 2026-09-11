import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";
import { expectHistory, freshTracked, borrowSubItem } from "./helpers";

const { Given, When, Then } = createBdd(test);

Given("มีการยืมชิ้นย่อย C01 ของ X ค้างอยู่", async ({ request, bdd, uniqueCode }) => {
  const item = await freshTracked(request, uniqueCode);
  await borrowSubItem(request, item.id, item.subId);
  bdd.item = item;
});

When(
  "ฉันเปิดแท็บ {string} แล้วเลือกแถวการยืมนั้น",
  async ({ page, bdd }, tab: string) => {
    await page.goto("/receive?tab=return");
    await expect(page.getByRole("button", { name: tab }).first()).toBeVisible();
    await page.getByRole("button").filter({ hasText: bdd.item.code }).first().click();
  }
);

When(
  "ฉันเลือกคืนชิ้น C01 สภาพปกติ แล้วกด {string} และ {string}",
  async ({ page, bdd }, save: string, confirm: string) => {
    const unit = page.getByRole("button").filter({ hasText: bdd.item.subCode }).first();
    await unit.click();
    await page.getByRole("button", { name: "ปกติ", exact: true }).click();
    await page.getByRole("button", { name: save, exact: true }).click();
    await page.getByRole("button", { name: confirm }).click();
  }
);

When(
  "ฉันเลือกคืนชิ้น C01 สภาพชำรุด กรอกอาการ แนบรูปหลักฐาน แล้วกด {string} และ {string}",
  async ({ page, bdd }, save: string, confirm: string) => {
    const unit = page.getByRole("button").filter({ hasText: bdd.item.subCode }).first();
    await unit.click();
    await page.getByRole("button", { name: "ชำรุด", exact: true }).click();
    await page.getByPlaceholder("ระบุความเสียหาย เช่น จอแตก").fill("E2E จอแตก");
    await page.locator('input[type="file"]').first().setInputFiles("e2e/assets/evidence.png");
    await page.getByRole("button", { name: save, exact: true }).click();
    await page.getByRole("button", { name: confirm }).click();
  }
);

Then("ฉันจะเห็นข้อความว่าบันทึกการคืนเรียบร้อย", async ({ page }) => {
  await expect(page.getByText("บันทึกการคืนเรียบร้อย", { exact: true })).toBeVisible({ timeout: 10_000 });
});

Then(
  "ฉันจะเห็นสถานะ C01 กลับเป็น {string} บนหน้ารายละเอียดของ X",
  async ({ page, bdd }, status: string) => {
    await page.goto(`/items/${bdd.item.code}?copy=${bdd.item.subCode}`);
    await expect(page.getByText(status, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  }
);

Then(
  "ฉันจะเห็นสถานะ C01 เป็น {string} บนหน้ารายละเอียดของ X",
  async ({ page, bdd }, status: string) => {
    await page.goto(`/items/${bdd.item.code}?copy=${bdd.item.subCode}`);
    await expect(page.getByText(status, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  }
);

When(
  "ฉันเปิดแท็บ {string} แล้วกดปุ่ม {string} ที่แถวของ X และยืนยันใน dialog",
  async ({ page, bdd }, tab: string, action: string) => {
    await page.goto("/receive?tab=in_use");
    await expect(page.getByRole("button", { name: tab }).first()).toBeVisible();
    const row = page
      .getByText(bdd.item.code)
      .locator("xpath=ancestor-or-self::*[contains(@class,'card')][1]");
    await row.getByRole("button", { name: action }).click();
    const dialog = page.getByRole("dialog");
    // ของที่คืนได้ต้องมีที่ให้คืน — ถ้าตรงนี้เป็น placeholder แปลว่า fixture สร้างของที่เกิดจริงไม่ได้
    await expect(dialog.getByText("ยังไม่ได้ตั้งสถานที่จัดเก็บให้พัสดุนี้")).toHaveCount(0);
    await dialog.getByRole("button", { name: action }).click();
  }
);

Then("ฉันจะเห็นข้อความว่าคืน X เข้าคลังแล้ว", async ({ page }) => {
  await expect(page.getByText(/คืน ".*" เข้าคลังแล้ว/)).toBeVisible({ timeout: 10_000 });
});

Then("ฉันจะไม่เห็น X ในแท็บ {string} อีก", async ({ page, bdd }, tab: string) => {
  await page.goto("/receive?tab=in_use");
  await expect(page.getByRole("button", { name: tab }).first()).toBeVisible();
  await expect(page.getByText(bdd.item.code, { exact: true })).toHaveCount(0);
});

Then(
  'ประวัติของ X ต้องบอกว่าใบยืมนั้นคืนมาชำรุด ไม่ใช่แค่ "คืนครบแล้ว"',
  async ({ page, bdd }) => {
    // ป้ายบนการ์ดต้องพูดถึงสภาพ ไม่ใช่ให้ไปเจอเอาตอนกดเปิดขั้นตอนข้างใน (lib/cases returnedBadly)
    await expectHistory(page, bdd.item.code, [/การยืม[\s\S]*คืนครบแล้ว · ชำรุด/], {
      copy: bdd.item.subCode,
      steps: ["ยืม", "รับคืน (ชำรุด)"],
      contains: "E2E จอแตก",
    });
  }
);
