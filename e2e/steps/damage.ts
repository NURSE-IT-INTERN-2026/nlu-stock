import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";
import { freshTracked } from "./helpers";

const { Given, When, Then } = createBdd(test);

When(
  "ฉันเปิดหน้ารายละเอียดของ X กด {string} เลือกชิ้น กรอกอาการ แล้วกดยืนยัน",
  async ({ page, bdd }, label: string) => {
    await page.goto(`/items/${bdd.item.code}`);
    await page.getByRole("button", { name: label }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder(/อธิบายรายละเอียดการชำรุด/).fill("E2E จอแตก");
    await dialog.getByRole("button", { name: label }).click();
  }
);

Then("ฉันจะเห็นสถานะชิ้นเป็น {string} บนหน้ารายละเอียด", async ({ page }, status: string) => {
  await expect(page.getByText(status, { exact: true }).first()).toBeVisible();
});

Then(
  "ฉันจะเห็นชิ้นนี้ขึ้นแถวสถานะ {string} บนหน้า {string}",
  async ({ page, bdd }, stage: string, _pageLabel: string) => {
    await page.goto("/repairs");
    await expect(page.getByText(stage, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  }
);

Then("ฉันจะเห็น C01 ขึ้นแถวสถานะ {string} บนหน้า {string}", async ({ page }, stage: string, _l: string) => {
  await page.goto("/repairs");
  await expect(page.getByText(stage, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
});

When(
  "ฉันเปิดหน้ารายละเอียดของ X แล้วแจ้งสถานะสูญหายของชิ้นนั้น",
  async ({ page, bdd }) => {
    await page.goto(`/items/${bdd.item.code}`);
    // tracked: ปรับสต็อก dropdown → สูญหาย → dialog ยืนยัน
    await page.getByRole("button", { name: "ปรับสต็อก" }).click();
    await page.getByRole("menuitem", { name: "สูญหาย" }).click();
    const dialog = page.getByRole("dialog");
    const note = dialog.locator("textarea").first();
    if (await note.count()) await note.fill("E2E ของหาย");
    await dialog.getByRole("button", { name: "ยืนยันสูญหาย" }).click();
  }
);

Then("ฉันจะเห็นข้อความว่าแจ้งสูญหายแล้ว", async ({ page }) => {
  await expect(page.getByText("แจ้งสูญหายแล้ว")).toBeVisible({ timeout: 10_000 });
});

Given("มีการยืมที่เกินกำหนดคืนแล้ว", async () => {
  // the seed plants open loans with past due dates — nothing to create
});

When(
  "ฉันเปิดแท็บ {string} ของหน้า {string} แล้วกด chip {string}",
  async ({ page }, tab: string, _l: string, chip: string) => {
    await page.goto("/receive?tab=return");
    await expect(page.getByRole("button", { name: tab })).toBeVisible();
    await page.getByRole("button", { name: chip, exact: true }).click();
  }
);

Then(
  "ฉันจะเห็นแถวการยืมที่เกินกำหนด พร้อมข้อความบอกจำนวนวันที่เกิน",
  async ({ page }) => {
    // rows show a "กี่วัน" column — an overdue loan's age in days
    await expect(
      page.getByRole("button").filter({ hasText: /\d+ วัน/ }).first()
    ).toBeVisible({ timeout: 15_000 });
  }
);
