import { createBdd } from "playwright-bdd";
import { test, expect, dbItem } from "../fixtures";
import { freshTracked } from "./helpers";

const { Given, When, Then } = createBdd(test);

Given(
  "มีรายการนับรายชิ้น X มีชิ้นย่อยว่างอยู่",
  async ({ request, bdd, uniqueCode }) => {
    bdd.item = await freshTracked(request, uniqueCode);
  }
);

When("ฉันค้นหา X แล้วกดปุ่ม {string} และเพิ่มจำนวนเป็น {int}", async ({ page, bdd }, label: string, qty: number) => {
  await expect(page.getByText(/พบ \d+ รายการ|ไม่พบพัสดุ/)).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("ค้นหารหัส / ชื่อพัสดุ…").first().fill(bdd.item.code);
  const card = page.locator("article", { hasText: bdd.item.code }).first();
  await card.getByRole("button", { name: label, exact: true }).click();
  for (let i = 1; i < qty; i++) {
    await card.getByRole("button", { name: "เพิ่มจำนวน" }).click();
  }
  await expect(card.getByText(new RegExp(`ในตะกร้า ${qty}`))).toBeVisible();
});

When("ฉันค้นหา X แล้วกดปุ่ม {string}", async ({ page, bdd }, label: string) => {
  await expect(page.getByText(/พบ \d+ รายการ|ไม่พบพัสดุ/)).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("ค้นหารหัส / ชื่อพัสดุ…").first().fill(bdd.item.code);
  const card = page.locator("article", { hasText: bdd.item.code }).first();
  await card.getByRole("button", { name: label, exact: true }).click();
  await expect(card.getByText(/ในตะกร้า \d+/)).toBeVisible();
});

When("ฉันเปิดหน้าตะกร้าแล้วกด {string}", async ({ page }, label: string) => {
  await page.goto("/cart");
  await page.getByRole("button", { name: label }).click();
});

When(
  'ฉันเลือกใช้ใน {string} กรอกกิจกรรม แล้วกด {string}',
  async ({ page }, usage: string, confirm: string) => {
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("ใช้ใน").click();
    await page.getByRole("option", { name: usage }).click();
    await dialog.getByLabel(/ระบุกิจกรรมที่นำไปใช้|เอาไปทำอะไร/).fill("E2E กิจกรรมทดสอบ");
    await dialog.getByRole("button", { name: confirm }).click();
  }
);

Then("ฉันจะเห็นข้อความว่าเบิกพัสดุสำเร็จ", async ({ page }) => {
  await expect(page.getByText(/เบิกพัสดุสำเร็จ \d+ รายการ/)).toBeVisible({ timeout: 10_000 });
});

Then("ฉันจะเห็นว่า X เหลือ {int} บนหน้า {string}", async ({ page, bdd }, qty: number, _label: string) => {
  await page.goto("/items");
  const item = await dbItem(bdd.item.code);
  expect(item.availableQty).toBe(qty);
});

Then(
  "ฉันจะเห็นสถานะชิ้นย่อยเป็น {string} บนหน้ารายละเอียดของ X",
  async ({ page, bdd }, status: string) => {
    await page.goto(`/items/${bdd.item.code}?copy=${bdd.item.subCode}`);
    await expect(page.getByText(status, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  }
);

Then(
  "ฉันจะเห็นชิ้นนี้อยู่ในแท็บ {string} ของหน้า {string}",
  async ({ page, bdd }, tab: string, _label: string) => {
    await page.goto("/receive?tab=return");
    await expect(page.getByRole("button", { name: tab })).toBeVisible();
    await expect(
      page.getByRole("button").filter({ hasText: bdd.item.code }).first()
    ).toBeVisible({ timeout: 15_000 });
  }
);

Then("ฉันจะไม่เห็น X ในแท็บ {string} ของหน้า {string}", async ({ page, bdd }, tab: string, _label: string) => {
  await page.goto("/receive?tab=return");
  await expect(page.getByRole("button", { name: tab })).toBeVisible();
  await expect(
    page.getByRole("button").filter({ hasText: bdd.item.code })
  ).toHaveCount(0);
});
