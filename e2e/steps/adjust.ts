import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";
import { createConsumable } from "./helpers";

const { Given, When, Then } = createBdd(test);

async function openAdjustDialog(
  page: import("@playwright/test").Page,
  code: string,
  mode?: string
) {
  await page.goto(`/items/${code}`);
  await page.getByRole("button", { name: "ปรับสต็อก" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (mode && mode !== "ตรวจนับตามรอบ") {
    // default mode is already ตรวจนับตามรอบ — only switch for the others
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: mode }).click();
  }
  return dialog;
}

Given("มีรายการสิ้นเปลือง X มียอด {int}", async ({ request, bdd, uniqueCode }, qty: number) => {
  bdd.item = await createConsumable(request, uniqueCode, qty);
});

When(
  "ฉันเปิดหน้ารายละเอียดของ X กด {string} เลือก {string} แล้วกรอกนับจริงได้ {int} และบันทึก",
  async ({ page, bdd }, button: string, mode: string, counted: number) => {
    const dialog = await openAdjustDialog(page, bdd.item.code, mode);
    await dialog.getByPlaceholder("จำนวนใหม่บนชั้นวางที่นับได้").fill(String(counted));
    await dialog.locator("textarea").first().fill("E2E ตรวจนับ");
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  }
);

Then("ฉันจะเห็นข้อความว่าบันทึกการตรวจนับแล้ว", async ({ page }) => {
  await expect(page.getByText("บันทึกการตรวจนับแล้ว")).toBeVisible({ timeout: 10_000 });
});


When(
  "ฉันเปิดหน้ารายละเอียดของ X กด {string} เลือก {string} ตัดออก {int} แล้วบันทึก",
  async ({ page, bdd }, button: string, mode: string, qty: number) => {
    const dialog = await openAdjustDialog(page, bdd.item.code, mode);
    await dialog.getByPlaceholder("จำนวนชิ้นที่เอาออกจากสต็อก").fill(String(qty));
    await dialog.locator("textarea").first().fill("E2E ตัดจำหน่าย");
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  }
);
