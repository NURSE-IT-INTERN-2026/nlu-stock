import { createBdd } from "playwright-bdd";
import { test, expect, pool } from "../fixtures";
import { createConsumable, freshTracked } from "./helpers";

const { Given, When, Then } = createBdd(test);

const TAB_QUERY: Record<string, string> = { หมวดหมู่: "categories", หน่วยนับ: "units" };

Given("ฉันเปิดหน้าตั้งค่า แท็บ {string}", async ({ page }, tab: string) => {
  await page.goto(`/settings?tab=${TAB_QUERY[tab] ?? tab}`);
  await expect(page.getByRole("button", { name: new RegExp(`^เพิ่ม${tab}`) })).toBeVisible({ timeout: 15_000 });
});

When(
  "ฉันกด {string} ตั้งชื่อแล้วเลือกประเภท {string} และกดสร้าง",
  async ({ page, bdd, uniqueCode }, button: string, profile: string) => {
    bdd.categoryName = `E2E หมวด ${uniqueCode}`;
    await page.getByRole("button", { name: new RegExp(`^${button}`) }).first().click();
    // สร้างหมวดหมู่เป็น wizard สองขั้น (ตั้งชื่อ+ประเภท → หน้ายืนยัน) ไม่ใช่ฟอร์มเดียวจบ
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("ชื่อหมวดหมู่").fill(bdd.categoryName);
    await dialog.getByRole("button", { name: profile, exact: true }).click();
    await dialog.getByRole("button", { name: /^ถัดไป/ }).click();
    await dialog.getByRole("button", { name: /^บันทึก/ }).click();
    await expect(page.getByText("สร้างหมวดหมู่สำเร็จ")).toBeVisible({ timeout: 15_000 });
  }
);

When("ฉันกด {string} ตั้งชื่อแล้วกดสร้าง", async ({ page, bdd, uniqueCode }, button: string) => {
  bdd.unitName = `E2E หน่วย ${uniqueCode}`;
  await page.getByRole("button", { name: new RegExp(`^${button}`) }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ชื่อหน่วยนับ").fill(bdd.unitName);
  await dialog.getByRole("button", { name: "สร้าง", exact: true }).click();
  await expect(page.getByText("เพิ่มหน่วยสำเร็จ")).toBeVisible({ timeout: 15_000 });
});

Then("ฉันจะเห็นหมวดหมู่ใหม่ในตารางหมวดหมู่", async ({ page, bdd }) => {
  // 23 หมวดกับหน้าละ 20 — ตัวใหม่ตกไปหน้า 2 กรองด้วยเม็ดยาประเภทก่อนถึงจะอยู่หน้าเดียว
  await page.getByRole("button", { name: "ครุภัณฑ์", exact: true }).first().click();
  await expect(page.getByText(bdd.categoryName, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  const { rows } = await pool.query(`SELECT id FROM categories WHERE name = $1`, [bdd.categoryName]);
  expect(rows.length, "หมวดหมู่ไม่ได้ลง DB").toBe(1);
});

Then("ฉันจะเห็นหน่วยนับใหม่ในตารางหน่วยนับ", async ({ page, bdd }) => {
  await expect(page.getByText(bdd.unitName, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  const { rows } = await pool.query(`SELECT id FROM units WHERE name = $1`, [bdd.unitName]);
  expect(rows.length, "หน่วยนับไม่ได้ลง DB").toBe(1);
});

Then(
  "หมวดหมู่ใหม่ต้องเลือกได้ใน wizard เพิ่มพัสดุ ใต้ประเภท {string}",
  async ({ page, bdd }, profile: string) => {
    // ปิดวงจร: wizard เลือกได้อย่างเดียวแล้ว หมวดที่สร้างที่นี่ต้องไปโผล่ที่นั่นจริง
    // ไม่งั้นการตัดทางสร้างออกจาก wizard = ตัดทางใช้หมวดใหม่ไปด้วย
    await page.goto("/receive");
    await page.getByRole("button", { name: /เพิ่มใหม่/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("ชื่อพัสดุ").fill("E2E ตรวจหมวดใหม่");
    await dialog.getByRole("button", { name: /ยืม-คืน ตาม Code/ }).click();
    await dialog.getByRole("button", { name: /^ถัดไป/ }).click();
    await dialog.getByRole("button", { name: "หมวดหมู่", exact: true }).click();
    await page.getByRole("group", { name: "ประเภท" }).getByRole("button", { name: profile, exact: true }).click();
    await expect(
      page.getByRole("group", { name: "หมวดหมู่ย่อย" }).getByRole("button", { name: bdd.categoryName, exact: true })
    ).toBeVisible({ timeout: 15_000 });
  }
);

Given("มีรายการ X อยู่ในทะเบียน", async ({ request, bdd, uniqueCode }) => {
  bdd.item = await createConsumable(request, uniqueCode, 5);
});

When(
  "ฉันเปิดหน้าตั้งค่า แท็บรายการพัสดุ กดแก้ไขที่แถวของ X แล้วเปลี่ยนชื่อ",
  async ({ page, bdd }) => {
    bdd.renamed = `${bdd.item.name} (แก้ชื่อแล้ว)`;
    await page.goto("/settings?tab=items");
    // ทะเบียนมีเกือบพันรายการ — ค้นก่อนแล้วค่อยกดแถว ไม่งั้นแถวที่ต้องการอยู่คนละหน้า
    await page.getByPlaceholder(/ค้นหา/).first().fill(bdd.item.code);
    const row = page
      .getByText(bdd.item.code, { exact: false })
      .locator('xpath=ancestor::*[.//button[@aria-label="แก้ไข"]][1]')
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "แก้ไข", exact: true }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("เช่น เครื่องดื่มหัวปลีแบบผง").fill(bdd.renamed);
    await dialog.getByRole("button", { name: /^บันทึกการแก้ไข/ }).click();
    await expect(page.getByText("แก้ไขรายการสำเร็จ")).toBeVisible({ timeout: 15_000 });
  }
);

Given("มีครุภัณฑ์ X อยู่ในทะเบียน", async ({ request, bdd, uniqueCode }) => {
  // ครุภัณฑ์เป็น profile เดียวที่ assetTracking = true — ฟิลด์จัดซื้อของประเภทอื่นถูก
  // sanitizeItemByProfile ตัดทิ้งก่อนถึง DB จึงไม่มีอะไรให้บันทึก
  bdd.item = await freshTracked(request, uniqueCode);
});

When(
  "ฉันเปิดหน้าตั้งค่า แท็บรายการพัสดุ กดแก้ไขที่แถวของ X แล้วตั้งราคาจัดซื้อเป็น {int}",
  async ({ page, bdd }, price: number) => {
    await page.goto("/settings?tab=items");
    await page.getByPlaceholder(/ค้นหา/).first().fill(bdd.item.code);
    const row = page
      .getByText(bdd.item.code, { exact: false })
      .locator('xpath=ancestor::*[.//button[@aria-label="แก้ไข"]][1]')
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "แก้ไข", exact: true }).first().click();

    const dialog = page.getByRole("dialog");
    const priceField = dialog.locator('input[type="number"][step="0.01"]').first();
    await expect(priceField).toBeVisible({ timeout: 10_000 });
    await priceField.fill(String(price));
    await dialog.getByRole("button", { name: /^บันทึกการแก้ไข/ }).click();
    await expect(page.getByText("แก้ไขรายการสำเร็จ")).toBeVisible({ timeout: 15_000 });
  }
);
