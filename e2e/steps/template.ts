import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";
import { createConsumable } from "./helpers";

const { Given, When, Then } = createBdd(test);

async function addToCart(page: import("@playwright/test").Page, code: string) {
  await page.goto("/dispense");
  await expect(page.getByText(/พบ \d+ รายการ|ไม่พบพัสดุ/)).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("ค้นหารหัส / ชื่อพัสดุ…").fill(code);
  const card = page.locator("article", { hasText: code }).first();
  await card.getByRole("button", { name: "เพิ่ม", exact: true }).click();
  await expect(card.getByText(/ในตะกร้า \d+/)).toBeVisible();
}

Given("ตะกร้าของฉันมีของ {int} รายการ", async ({ page, request, bdd, uniqueCode }, _n: number) => {
  bdd.item = await createConsumable(request, uniqueCode, 5);
  await addToCart(page, bdd.item.code);
});

When("ฉันกด {string} บนหน้าตะกร้า แล้วตั้งชื่อเทมเพลต", async ({ page, bdd }, save: string) => {
  await page.goto("/cart");
  await page.getByRole("button", { name: save }).click();
  bdd.template = `E2E เทมเพลต ${bdd.item.code}`;
  const dialog = page.getByRole("dialog");
  await dialog.locator("input, textarea").first().fill(bdd.template);
  await dialog.getByRole("button", { name: /บันทึก|สร้าง|ยืนยัน/ }).click();
  await page.waitForTimeout(1000);
});

When(
  "ฉันล้างตะกร้า แล้วกด {string} เลือกเทมเพลตที่บันทึกไว้",
  async ({ page, bdd }, load: string) => {
    await page.getByRole("button", { name: "ล้าง" }).click();
    await page.getByRole("button", { name: "ล้างทั้งหมด" }).click();
    await expect(page.getByText("ตะกร้าว่าง")).toBeVisible();
    await page.getByRole("button", { name: load }).click();
    await page.getByText(bdd.template, { exact: false }).first().click();
  }
);

Then("ฉันจะเห็นของกลับมาในตะกร้าครบตามเทมเพลต", async ({ page, bdd }) => {
  await expect(page.getByText(bdd.item.code).first()).toBeVisible({ timeout: 10_000 });
});
