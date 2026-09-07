import { createBdd } from "playwright-bdd";
import { test, expect, pool } from "../fixtures";

const { Given, When, Then } = createBdd(test);

/** A non-consumable whose รอบบำรุง is due — shift the date if the seed has none due today.
 *  Years overdue, not a day: the table sorts soonest-due first and pages at 10, and the seed
 *  already carries rows overdue by a day. A tie there put this item on page 2, where the step
 *  looking for its row on page 1 could not see it. */
async function dueMaintenanceItem(uniqueCode: string) {
  const { rows } = await pool.query(
    `UPDATE items SET "nextMaintenanceDate" = now() - interval '5 years'
     WHERE id = (
       SELECT i.id FROM items i
        JOIN categories c ON c.id = i."categoryId"
        JOIN category_profiles p ON p.id = c."profileId"
       WHERE p.code <> 'CON' AND i."isActive" = true AND NOT i."trackIndividually"
       LIMIT 1
     )
     RETURNING id, code, name`
  );
  return rows[0];
}

Given("รายการ X ขึ้นในตารางบำรุงรักษาของหน้า {string}", async ({ bdd, uniqueCode }, _p: string) => {
  bdd.item = await dueMaintenanceItem(uniqueCode);
});

Given("รายการ Y ขึ้นในตารางบำรุงรักษาของหน้า {string}", async ({ bdd, uniqueCode }, _p: string) => {
  bdd.item = await dueMaintenanceItem(uniqueCode);
});

async function openRecordDialog(page: import("@playwright/test").Page, code: string) {
  await page.goto("/maintenance");
  const row = page.getByRole("row").filter({ hasText: code }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: new RegExp(`บันทึกบำรุงรักษา ${code}`) }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

When(
  'ฉันกดปุ่มบันทึกบำรุงรักษาที่แถวของ X เลือก {string} แล้วกดบันทึก',
  async ({ page, bdd }, venue: string) => {
    await openRecordDialog(page, bdd.item.code);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: venue, exact: true }).click();
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  }
);

When(
  'ฉันกดปุ่มบันทึกบำรุงรักษาที่แถวของ Y เลือก {string} กรอกหน่วยงานผู้รับงาน แล้วกดส่งบำรุงรักษา',
  async ({ page, bdd }, venue: string) => {
    await openRecordDialog(page, bdd.item.code);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: venue, exact: true }).click();
    await dialog
      .getByPlaceholder("ระบุหน่วยงานผู้รับงาน และรายการที่ให้ดำเนินการ...")
      .fill("E2E หน่วยงานภายนอก");
    await dialog.getByRole("button", { name: "ส่งบำรุงรักษา", exact: true }).click();
  }
);

Then("ฉันจะเห็นข้อความว่าบันทึกผลบำรุงรักษาแล้ว", async ({ page }) => {
  await expect(page.getByText("บันทึกการบำรุงรักษาแล้ว")).toBeVisible({ timeout: 10_000 });
});

Then("ฉันจะเห็นข้อความว่าส่งบำรุงรักษาภายนอกแล้ว", async ({ page }) => {
  await expect(page.getByText("ส่งบำรุงรักษาภายนอกแล้ว")).toBeVisible({ timeout: 10_000 });
});

Then(
  "ฉันจะเห็น Y อยู่ในแท็บ {string} พร้อมป้าย {string}",
  async ({ page, bdd }, tab: string, badge: string) => {
    await page.goto("/maintenance?tab=receive");
    await expect(page.getByRole("button", { name: new RegExp(`^${tab}`) })).toBeVisible();
    await expect(page.getByRole("link", { name: bdd.item.code })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(badge, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  }
);
