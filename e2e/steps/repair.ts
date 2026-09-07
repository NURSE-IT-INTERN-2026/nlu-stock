import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";
import { freshTracked, damageSubItem, sendRepair } from "./helpers";

const { Given, When, Then } = createBdd(test);

async function damagedTracked(
  request: import("@playwright/test").APIRequestContext,
  uniqueCode: string
) {
  const item = await freshTracked(request, uniqueCode);
  await damageSubItem(request, item.id, item.subId);
  return item;
}

Given('ชิ้น C01 ขึ้นแถวสถานะ {string} บนหน้า {string}', async ({ request, bdd, uniqueCode }, _s: string, _p: string) => {
  bdd.item = await damagedTracked(request, uniqueCode);
});

Given('ชิ้น C02 ขึ้นแถวสถานะ {string} บนหน้า {string}', async ({ request, bdd, uniqueCode }, _s: string, _p: string) => {
  bdd.item = await damagedTracked(request, uniqueCode);
});

Given('ชิ้น C01 อยู่ระหว่างซ่อมบนหน้า {string}', async ({ request, bdd, uniqueCode }, _p: string) => {
  const item = await freshTracked(request, uniqueCode);
  await damageSubItem(request, item.id, item.subId);
  await sendRepair(request, item.id, item.subId, "INTERNAL");
  bdd.item = item;
});

Given('ชิ้น C02 อยู่ระหว่างซ่อมบนหน้า {string}', async ({ request, bdd, uniqueCode }, _p: string) => {
  const item = await freshTracked(request, uniqueCode);
  await damageSubItem(request, item.id, item.subId);
  await sendRepair(request, item.id, item.subId, "INTERNAL");
  bdd.item = item;
});

When(
  'ฉันกดปุ่ม {string} ที่แถวของ C01 กรอกรายละเอียด แล้วเลือกส่งซ่อมที่ {string} และยืนยัน',
  async ({ page, bdd }, button: string, venue: string) => {
    await page.goto("/repairs");
    const row = rowWithButton(page, bdd.item.code, button);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByPlaceholder("เช่น จอแตก ปุ่มหลุด สายชาร์จขาด…").fill("E2E จอแตก");
    await dialog.getByPlaceholder("เช่น ส่งซ่อมร้าน ABC…").fill("E2E ส่งซ่อมด่วน");
    await dialog.getByRole("button", { name: venue, exact: true }).click();
    await dialog.getByRole("button", { name: "ยืนยัน", exact: true }).click();
    await expect(page.getByText(/ส่งซ่อมเรียบร้อย|บันทึกเรียบร้อย/)).toBeVisible({ timeout: 10_000 });
  }
);

When(
  'ฉันกดปุ่ม {string} ที่แถวของ C02 กรอกรายละเอียด {string} แล้วเลือกส่งซ่อมที่ {string} และยืนยัน',
  async ({ page, bdd }, button: string, detail: string, venue: string) => {
    await page.goto("/repairs");
    const row = rowWithButton(page, bdd.item.code, button);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByPlaceholder("เช่น จอแตก ปุ่มหลุด สายชาร์จขาด…").fill("E2E ปุ่มหลุด");
    await dialog.getByPlaceholder("เช่น ส่งซ่อมร้าน ABC…").fill(detail);
    await dialog.getByRole("button", { name: venue, exact: true }).click();
    await dialog.getByRole("button", { name: "ยืนยัน", exact: true }).click();
    await expect(page.getByText(/ส่งซ่อมเรียบร้อย|บันทึกเรียบร้อย/)).toBeVisible({ timeout: 10_000 });
  }
);

When(
  'ฉันกดปุ่ม {string} ที่แถวของ C01 เลือกผลการซ่อม {string} แล้วบันทึก',
  async ({ page, bdd }, button: string, result: string) => {
    await page.goto("/repairs?tab=receive");
    const row = rowWithButton(page, bdd.item.code, button);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: result }).click();
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    // ต้องรอ toast จริง ๆ: คลิกแล้ว dialog ยังค้างสถานะกำลังบันทึกอยู่อีกครู่ สเต็ปถัดไปที่อ่านสถานะ
    // ชิ้นทันทีจะอ่านค่าก่อนบันทึกเสร็จ แล้วรายงานว่าเป็นบั๊กของระบบทั้งที่เป็นจังหวะของเทสเอง
    await expect(page.getByText(/บันทึกการบำรุงรักษาแล้ว|รับคืนจากบำรุงรักษาแล้ว/).first()).toBeVisible({ timeout: 15_000 });
  }
);

When(
  'ฉันกดปุ่ม {string} ที่แถวของ C02 เลือกผลการซ่อม {string} แล้วบันทึก',
  async ({ page, bdd }, button: string, result: string) => {
    await page.goto("/repairs?tab=receive");
    const row = rowWithButton(page, bdd.item.code, button);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: result }).click();
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    // ต้องรอ toast จริง ๆ: คลิกแล้ว dialog ยังค้างสถานะกำลังบันทึกอยู่อีกครู่ สเต็ปถัดไปที่อ่านสถานะ
    // ชิ้นทันทีจะอ่านค่าก่อนบันทึกเสร็จ แล้วรายงานว่าเป็นบั๊กของระบบทั้งที่เป็นจังหวะของเทสเอง
    await expect(page.getByText(/บันทึกการบำรุงรักษาแล้ว|รับคืนจากบำรุงรักษาแล้ว/).first()).toBeVisible({ timeout: 15_000 });
  }
);

/** Both panels stay mounted (one hidden) — skip their twin search boxes and scope straight to
 *  the row that carries our code and the action button. Desktop draws a <tr> and mobile a <div>,
 *  and the table's buttons are icon-only, so the name lives in aria-label rather than the text. */
function rowWithButton(page: import("@playwright/test").Page, code: string, button: string) {
  return page
    .getByText(code, { exact: false })
    .locator(`xpath=ancestor::*[self::tr or self::div][.//button[contains(., "${button}") or contains(@aria-label, "${button}")]][1]`)
    .first();
}

Then(
  'ฉันจะเห็นแถวของ C01 ในแท็บ {string} พร้อมป้าย {string}',
  async ({ page, bdd }, tab: string, badge: string) => {
    await page.goto("/repairs?tab=receive");
    await expect(page.getByRole("button", { name: /^รับคืนจากส่งซ่อม/ }).first()).toBeVisible();
    const row = rowWithButton(page, bdd.item.code, "รับคืนจากส่งซ่อม");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText(badge, { exact: true })).toBeVisible();
  }
);

Then(
  'ฉันจะเห็นแถวของ C02 ในแท็บ {string} พร้อมป้าย {string}',
  async ({ page, bdd }, tab: string, badge: string) => {
    await page.goto("/repairs?tab=receive");
    await expect(page.getByRole("button", { name: /^รับคืนจากส่งซ่อม/ }).first()).toBeVisible();
    const row = rowWithButton(page, bdd.item.code, "รับคืนจากส่งซ่อม");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText(badge, { exact: true })).toBeVisible();
  }
);

Then("ฉันจะเห็นข้อความว่าบันทึกการบำรุงรักษาแล้ว", async ({ page }) => {
  await expect(page.getByText("บันทึกการบำรุงรักษาแล้ว")).toBeVisible({ timeout: 10_000 });
});

Then("ฉันจะเห็นว่า C01 หายไปจากรายการระหว่างซ่อม", async ({ page, bdd }) => {
  await page.goto("/repairs?tab=receive");
  await page.waitForTimeout(1000);
  await expect(page.getByText(bdd.item.code)).toHaveCount(0);
});

Then("ฉันจะเห็นว่า C02 หายไปจากรายการระหว่างซ่อม", async ({ page, bdd }) => {
  await page.goto("/repairs?tab=receive");
  await page.waitForTimeout(1000);
  await expect(page.getByText(bdd.item.code)).toHaveCount(0);
});

