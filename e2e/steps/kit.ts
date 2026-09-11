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
  const { rows } = await pool.query(`SELECT id, code FROM items WHERE name = $1`, [bdd.name]);
  bdd.item = rows[0];
  await page.goto(`/items/${bdd.item.code}`);
  await page.getByRole("button", { name: /^ประกอบชุด/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: new RegExp(`^ประกอบ ${sets} ชุด`) }).click();
  await expect(page.getByText(/ประกอบ \d+ ชุดแล้ว/)).toBeVisible({ timeout: 15_000 });
  // ชุดที่ประกอบแล้วคือ sub_item ของ KIT — เก็บ subCode ไว้ให้สเต็ปยืม/คืนที่ใช้ร่วมกับของนับรายชิ้น
  const set = await pool.query(
    `SELECT "subCode" FROM sub_items WHERE "itemId" = $1 ORDER BY "subCode" LIMIT 1`,
    [bdd.item.id]
  );
  bdd.item.subCode = set.rows[0]?.subCode;
});

/** ชุดอยู่ถาวร — สถานะของ sub_item คือคำตอบว่าคืนแล้วชุดยังอยู่ไหม ไม่ใช่แค่ toast */
const SET_STATUS: Record<string, string> = { "ว่าง": "AVAILABLE", "ถูกยืม": "ON_LOAN" };

When('ฉันเปิดแท็บ "รับคืนจากใบยืม" แล้วเลือกใบยืมของชุดนั้น', async ({ page, bdd }) => {
  // แถวใบยืมโชว์ "ชื่อ" ไม่ใช่รหัส — ของนับรายชิ้นชื่อมีรหัสอยู่ในตัว แต่ชุดชื่อ "E2E ชุด …"
  // จึงเลือกด้วยชื่อชุดแทนสเต็ปกลางที่กรองด้วย bdd.item.code
  await page.goto("/receive?tab=return");
  await expect(page.getByRole("button", { name: "รับคืนจากใบยืม" }).first()).toBeVisible();
  await page.getByRole("button").filter({ hasText: bdd.name }).first().click();
});

When(
  'ฉันเลือกคืนทั้งกล่อง แล้วกด {string} และ {string}',
  async ({ page, bdd }, save: string, confirm: string) => {
    // แถวชิ้นที่จะคืนของชุดขึ้นเป็นชื่อชุด + รหัส KIT ไม่ใช่ subCode แบบของนับรายชิ้น
    // และชุดไม่มีตัวเลือกสภาพรายชิ้น — "รับคืนทั้งกล่อง ไม่ต้องแกะ" ติ๊กแล้วบันทึกได้เลย
    await page
      .getByRole("button")
      .filter({ hasText: bdd.name })
      .filter({ has: page.getByRole("checkbox") })
      .first()
      .click();
    await page.getByRole("button", { name: save, exact: true }).click();
    await page.getByRole("button", { name: confirm }).click();
  }
);

Then('ชุดที่ประกอบไว้ต้องอยู่ในสถานะ {string}', async ({ bdd }, label: string) => {
  const expected = SET_STATUS[label];
  if (!expected) throw new Error(`unknown set status: ${label}`);
  const { rows } = await pool.query(
    `SELECT status FROM sub_items WHERE "itemId" = $1 AND "subCode" = $2`,
    [bdd.item.id, bdd.item.subCode]
  );
  expect(rows[0]?.status).toBe(expected);
});

Then("ฉันจะเห็นข้อความว่าประกอบชุดแล้ว", async ({ page }) => {
  await expect(page.getByText(/ประกอบ \d+ ชุดแล้ว/)).toBeVisible({ timeout: 15_000 });
});

Then(
  "ฉันจะเห็นชุดที่ประกอบไว้ {int} ชุดบนหน้ารายละเอียด",
  async ({ page, bdd }, sets: number) => {
    // เรียกได้ทั้งตอนอยู่หน้ารายละเอียดอยู่แล้ว และตอนเพิ่งกลับมาจากหน้ารับคืน
    await page.goto(`/items/${bdd.item.code}`);
    await expect(page.getByText(new RegExp(`ชุดที่ประกอบไว้ \\(${sets}\\)`))).toBeVisible({ timeout: 15_000 });
  }
);
