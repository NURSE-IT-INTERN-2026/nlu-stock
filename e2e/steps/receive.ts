import { createBdd } from "playwright-bdd";
import { test, expect, dbItem } from "../fixtures";
import { createConsumable } from "./helpers";

const { Given, When, Then } = createBdd(test);

Given("มีรายการของสิ้นเปลือง X ในระบบ", async ({ request, bdd, uniqueCode }) => {
  bdd.item = await createConsumable(request, uniqueCode, 0);
});

Given(
  "มีรายการของสิ้นเปลือง X มียอด {int}",
  async ({ request, bdd, uniqueCode }, qty: number) => {
    const item = await createConsumable(request, uniqueCode, qty);
    bdd.item = item;
  }
);

When(
  "ฉันค้นหา X ในช่อง {string} แล้วกดเพิ่มเข้าใบรับ",
  async ({ page, bdd }, placeholder: string) => {
    await expect(page.getByText("รายการรับเข้า")).toBeVisible();
    await page.getByPlaceholder(placeholder).first().fill(bdd.item.code);
    await page
      .getByRole("button", { name: `เพิ่ม ${bdd.item.name}`, exact: true })
      .click();
  }
);

When("ฉันกรอกจำนวน {int} และราคาต่อหน่วย {int}", async ({ page, bdd }, qty: number, price: number) => {
  const card = page
    .getByText(bdd.item.name, { exact: true })
    .locator("xpath=ancestor::*[contains(@class,'card')][1]");
  await card.getByRole("spinbutton").first().fill(String(qty));
  await card.getByPlaceholder("-").first().fill(String(price));
});

When('ฉันกดปุ่ม {string}', async ({ page }, label: string) => {
  await page.getByRole("button", { name: new RegExp(`^${label}`) }).first().click();
});

Then("ฉันจะเห็นข้อความว่ารับเข้าสำเร็จ", async ({ page }) => {
  await expect(page.getByText(/รับเข้าสำเร็จ \d+ รายการ/)).toBeVisible({ timeout: 10_000 });
});

Then(
  "ฉันจะเห็นว่า X มียอดคงเหลือเพิ่มขึ้น {int} บนหน้า {string}",
  async ({ page, bdd }, qty: number, _pageLabel: string) => {
    await page.goto("/items");
    const after = await dbItem(bdd.item.code);
    expect(after.availableQty).toBe(qty);
  }
);
