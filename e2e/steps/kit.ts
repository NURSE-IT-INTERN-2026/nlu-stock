import { createBdd } from "playwright-bdd";
import { test, expect, pool } from "../fixtures";
import { createCountItem } from "./helpers";

const { Given, When, Then } = createBdd(test);

When(
  'ฉันกด {string} ตั้งชื่อชุด เพิ่มส่วนประกอบ 1 ชนิด แล้วบันทึกชุดอุปกรณ์',
  async ({ page, bdd, request, uniqueCode }, create: string) => {
    // ประกอบได้ only counts durable components — consumables are never cut by the system
    const comp = await createCountItem(request, `${uniqueCode}K`, 10);
    bdd.comp = comp;
    bdd.name = `E2E ชุด ${uniqueCode}`;
    await expect(page.getByText(/พบ \d+ รายการ/)).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`^${create}`) }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("ชื่อชุด").fill(bdd.name);
    await dialog.getByRole("button", { name: /^ถัดไป/ }).click();
    await dialog.getByPlaceholder("เช่น ปากกาเจล, ไม้บรรทัด").fill(comp.name);
    await page.getByRole("button", { name: comp.name, exact: false }).first().click();
    await dialog.getByRole("button", { name: /^ถัดไป/ }).click();
    await dialog.getByRole("button", { name: /^บันทึกชุดอุปกรณ์/ }).click();
  }
);

Then("ฉันจะเห็นข้อความว่าสร้างสูตรชุดแล้ว", async ({ page }) => {
  await expect(page.getByText(/สร้างสูตรชุด.*แล้ว/)).toBeVisible({ timeout: 15_000 });
});

When('ฉันเปิดหน้ารายละเอียดของชุด แล้วกดประกอบชุด {int} ชุด', async ({ page, bdd }, sets: number) => {
  const { rows } = await pool.query(`SELECT code FROM items WHERE name = $1`, [bdd.name]);
  bdd.item = rows[0];
  await page.goto(`/items/${bdd.item.code}`);
  await page.getByRole("button", { name: /^ประกอบชุด/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: new RegExp(`^ประกอบ ${sets} ชุด`) }).click();
});

Then("ฉันจะเห็นข้อความว่าประกอบชุดแล้ว", async ({ page }) => {
  await expect(page.getByText(/ประกอบ \d+ ชุดแล้ว/)).toBeVisible({ timeout: 15_000 });
});

Then(
  "ฉันจะเห็นชุดที่ประกอบไว้ {int} ชุดบนหน้ารายละเอียด",
  async ({ page }, sets: number) => {
    await expect(page.getByText(new RegExp(`ชุดที่ประกอบไว้ \\(${sets}\\)`))).toBeVisible();
  }
);
