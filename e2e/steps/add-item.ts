import { createBdd } from "playwright-bdd";
import { test, expect, pool } from "../fixtures";

const { Given, When, Then } = createBdd(test);

Given(
  "ฉันเปิดหน้าตั้งค่า แท็บรายการพัสดุ แล้วกดปุ่ม {string}",
  async ({ page, bdd, uniqueCode }, label: string) => {
    bdd.name = `E2E ${uniqueCode}`;
    await page.goto("/settings?tab=items");
    await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("ชื่อพัสดุ")).toBeVisible();
  }
);

When(
  "ฉันกรอกชื่อพัสดุในขั้นตอนข้อมูลพัสดุ เลือกใช้แบบ {string}",
  async ({ page, bdd }, usage: string) => {
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("ชื่อพัสดุ").fill(bdd.name);
    await dialog.getByRole("button", { name: new RegExp(usage) }).click();
    await dialog.getByRole("button", { name: /^ถัดไป/ }).click();
    await expect(dialog.getByRole("button", { name: /^หมวดหมู่/ })).toBeVisible({ timeout: 10_000 });
  }
);

When(
  "ฉันเลือกหมวดและหน่วยนับ ตั้งจำนวนชิ้น {int} ชิ้น และที่จัดเก็บ ในขั้นตอนหมวดหมู่และหน่วย",
  async ({ page }, copies: number) => {
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^หมวดหมู่/ }).click();
    await dialog.getByRole("button", { name: /^ครุภัณฑ์/ }).first().click();
    await dialog.locator("#copy-count").fill(String(copies));
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();
    // ที่จัดเก็บ — พิมพ์แล้วกดตัวเลือกจาก dropdown เหมือน ย้ายที่ตั้ง: การพิมพ์อย่างเดียว
    // ถูกล้างตอน combobox remount พร้อม options
    await dialog.getByPlaceholder("เช่น อาคาร 2").fill("อาคาร");
    await dialog.getByRole("button", { name: "อาคาร 2", exact: true }).first().click();
    await dialog.getByPlaceholder("เช่น 4", { exact: true }).fill("ชั้น");
    await dialog.getByRole("button", { name: "ชั้น 4", exact: true }).first().click();
    await dialog.getByPlaceholder("เช่น 402", { exact: true }).fill("402");
    await dialog.getByRole("button", { name: "402", exact: true }).first().click();
    await dialog.getByRole("button", { name: /^ถัดไป/ }).click();
    await expect(dialog.getByRole("button", { name: /^สร้างพัสดุ/ })).toBeVisible({ timeout: 10_000 });
    // หน้าสรุปต้องยืนยันที่จัดเก็บให้เห็นก่อนกดสร้าง
    await expect(dialog.getByText("อาคาร 2 / ชั้น 4 / 402")).toBeVisible();
  }
);

When(
  "ฉันกดปุ่ม {string} ในขั้นตอนตรวจสอบและยืนยัน",
  async ({ page }, label: string) => {
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^${label}`) }).click();
  }
);

Then("ฉันจะเห็นข้อความว่าสร้างพัสดุสำเร็จ", async ({ page }) => {
  await expect(page.getByText(/สร้างพัสดุ.*สำเร็จ/)).toBeVisible({ timeout: 15_000 });
});

Then(
  "ฉันจะเห็นรายการใหม่พร้อมเลขชิ้นย่อย C01 C02 C03 เมื่อเปิดหน้ารายละเอียดของรายการนี้",
  async ({ page, bdd }) => {
    const { rows } = await pool.query(`SELECT code, id FROM items WHERE name = $1`, [bdd.name]);
    const item = rows[0];
    await page.goto(`/items/${item.code}`);
    for (const sub of ["C01", "C02", "C03"]) {
      await expect(page.getByRole("button", { name: new RegExp(`-${sub}$`) }).first()).toBeVisible({ timeout: 15_000 });
    }
  }
);

Then(
  "รายการใหม่ต้องผูกกับที่จัดเก็บที่เลือกไว้ ไม่ใช่ค้างเป็นไม่ระบุ",
  async ({ bdd }) => {
    // wizard เคยไม่ถามที่จัดเก็บเลย พัสดุที่สร้างใหม่ทุกตัวจึงค้างเป็น null — ยันว่ามันผูกจริง
    const { rows } = await pool.query(
      `SELECT l.building, l.floor, l.room
         FROM items i JOIN locations l ON l.id = i."locationId"
        WHERE i.name = $1`,
      [bdd.name]
    );
    expect(rows[0]).toMatchObject({ building: "อาคาร 2", floor: "ชั้น 4", room: "402" });
  }
);
