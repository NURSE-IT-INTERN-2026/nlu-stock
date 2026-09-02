import { createBdd } from "playwright-bdd";
import { test, expect, pool } from "../fixtures";

const { Given, When, Then } = createBdd(test);

/** ห้องเดียวกันทุกไฟล์ — wizard เคยไม่ถามที่จัดเก็บเลย ของใหม่จึงค้างเป็น null */
const LOCATION = { building: "อาคาร 2", floor: "ชั้น 4", room: "402" };

/** โค้ดที่ระบบออกให้ตอนสร้าง (wizard ตั้งเอง เทสไม่ได้เป็นคนกรอก) */
async function codeOf(name: string) {
  const { rows } = await pool.query(`SELECT code FROM items WHERE name = $1`, [name]);
  if (!rows[0]) throw new Error(`ไม่พบพัสดุชื่อ ${name} ใน DB`);
  return rows[0].code as string;
}

/** เปิดหน้ารายละเอียดของรายการที่ scenario นี้เพิ่งสร้าง */
async function openNewItem(page: import("@playwright/test").Page, name: string) {
  const code = await codeOf(name);
  await page.goto(`/items/${code}`);
  return code;
}

Given("ฉันเปิดหน้ารับเข้า-คืนพัสดุ", async ({ page }) => {
  await page.goto("/receive");
});

When(
  "ฉันสร้างพัสดุแบบ {string} ประเภท {string} หมวด {string} จำนวน {int}",
  async ({ page, bdd, uniqueCode }, usage: string, profile: string, category: string, qty: number) => {
    const name = `E2E ${uniqueCode} ${usage}`;
    const tracked = usage.includes("ตาม Code");

    // ปุ่มท้ายผลค้นหาของแท็บค้นหา — ทางเข้า wizard ของหน้ารับเข้า
    await page.getByRole("button", { name: /เพิ่มใหม่/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("ชื่อพัสดุ")).toBeVisible();

    // ขั้น 1 — ชื่อ + แบบการใช้งาน (แบบที่เลือกกรองหมวดหมู่ในขั้นถัดไปให้เอง)
    await dialog.getByLabel("ชื่อพัสดุ").fill(name);
    await dialog.getByRole("button", { name: new RegExp(usage) }).click();
    await dialog.getByRole("button", { name: /^ถัดไป/ }).click();
    await expect(dialog.getByRole("button", { name: "หมวดหมู่", exact: true })).toBeVisible({ timeout: 10_000 });

    // ขั้น 2 — cascade ประเภท → หมวดหมู่ย่อย (popover อยู่นอก dialog จึงหาจาก page)
    // ระบุคอลัมน์ทุกครั้ง เพราะประเภทกับหมวดหมู่ย่อยชื่อซ้ำกันได้
    await dialog.getByRole("button", { name: "หมวดหมู่", exact: true }).click();
    await page.getByRole("group", { name: "ประเภท" }).getByRole("button", { name: profile, exact: true }).click();
    await page.getByRole("group", { name: "หมวดหมู่ย่อย" }).getByRole("button", { name: category, exact: true }).click();

    // ตาม Code ได้ตัวสร้างรหัส (จำนวน = ชิ้นย่อย) ส่วนอีกสองแบบได้ยอดตั้งต้นของกอง
    if (tracked) {
      await dialog.locator("#copy-count").fill(String(qty));
    } else {
      await expect(dialog.getByText("รหัสที่จะได้:")).toBeVisible({ timeout: 10_000 });
      await dialog.locator("#initial-qty").fill(String(qty));
      await dialog.locator("#initial-qty").blur(); // NumericInput commit ตอน blur ไม่ใช่ทุกคีย์
    }

    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();

    // ที่จัดเก็บ — พิมพ์แล้วกดตัวเลือกจาก dropdown เหมือน ย้ายที่ตั้ง: การพิมพ์อย่างเดียว
    // ถูกล้างตอน combobox remount พร้อม options
    await dialog.getByPlaceholder("เช่น อาคาร 2").fill("อาคาร");
    await dialog.getByRole("button", { name: LOCATION.building, exact: true }).first().click();
    await dialog.getByPlaceholder("เช่น 4", { exact: true }).fill("ชั้น");
    await dialog.getByRole("button", { name: LOCATION.floor, exact: true }).first().click();
    await dialog.getByPlaceholder("เช่น 402", { exact: true }).fill(LOCATION.room);
    await dialog.getByRole("button", { name: LOCATION.room, exact: true }).first().click();
    await dialog.getByRole("button", { name: /^ถัดไป/ }).click();

    // ขั้น 3 — หน้าสรุปต้องยืนยันที่จัดเก็บให้เห็นก่อนกดสร้าง
    await expect(dialog.getByRole("button", { name: /^สร้างพัสดุ/ })).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(`${LOCATION.building} / ${LOCATION.floor} / ${LOCATION.room}`)).toBeVisible();
    await dialog.getByRole("button", { name: /^สร้างพัสดุ/ }).click();

    await expect(page.getByText(`สร้างพัสดุ "${name}" สำเร็จ`)).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toBeHidden();

    bdd.newItem = { name, qty };
  }
);

Then("ฉันจะเห็นรายการใหม่บนหน้ารายละเอียดของมัน", async ({ page, bdd }) => {
  const code = await openNewItem(page, bdd.newItem.name);
  await expect(page.getByRole("heading", { name: bdd.newItem.name, level: 1 })).toBeVisible({ timeout: 15_000 });
  // หัวเรื่องพิมพ์รหัสรวมกับจำนวนในก้อนเดียว ("NLU-KRU-167 · 3 ชิ้น") จับแบบมีอยู่ในข้อความ
  await expect(page.getByText(code).first()).toBeVisible();
});

Then("รายการใหม่ต้องมีเลขชิ้นย่อย C01 C02 C03", async ({ page, bdd }) => {
  await openNewItem(page, bdd.newItem.name);
  for (const sub of ["C01", "C02", "C03"]) {
    await expect(page.getByRole("button", { name: new RegExp(`-${sub}$`) }).first()).toBeVisible({ timeout: 15_000 });
  }
});

Then("รายการใหม่ต้องมียอดคงเหลือเท่าจำนวนที่ตั้งไว้", async ({ page, bdd }) => {
  await openNewItem(page, bdd.newItem.name);
  // การ์ดสต็อกพิมพ์ "คงเหลือ / รวม หน่วย" — ยันฝั่งรวม ซึ่งเป็นจำนวนที่กรอกไว้ตอนสร้าง
  await expect(
    page.getByText(new RegExp(String.raw`^/\s*${bdd.newItem.qty}\s`)).first()
  ).toBeVisible({ timeout: 15_000 });
});

Then("รายการใหม่ต้องผูกกับที่จัดเก็บที่เลือกไว้ ไม่ใช่ค้างเป็นไม่ระบุ", async ({ bdd }) => {
  const { rows } = await pool.query(
    `SELECT l.building, l.floor, l.room
       FROM items i JOIN locations l ON l.id = i."locationId"
      WHERE i.name = $1`,
    [bdd.newItem.name]
  );
  expect(rows[0], `${bdd.newItem.name} ไม่ผูกที่จัดเก็บ`).toMatchObject(LOCATION);
});

Then("ประวัติระดับรายการของรายการใหม่ต้องมีแถวยอดตั้งต้น", async ({ request, bdd }) => {
  // หน้ารายละเอียดของของที่ติดตามรายชิ้นเปิดมาที่ชิ้น C01 เสมอ และแท็บประวัติของมันถูกกรอง
  // ตามชิ้น — ยอดตั้งต้นเป็นแถวระดับรายการ (ไม่ผูกชิ้นไหน) จึงไม่โผล่บนจอนั้น
  // ยันผ่าน API ตัวเดียวกับที่หน้าประวัติเรียก แต่ไม่กรองชิ้น
  const { rows } = await pool.query(`SELECT id FROM items WHERE name = $1`, [bdd.newItem.name]);
  const res = await request.get(`/api/items/${rows[0].id}/history?perPage=50`);
  expect(res.ok(), `ประวัติเปิดไม่ได้ (HTTP ${res.status()})`).toBeTruthy();
  const body = await res.json();
  const opening = (body.events ?? []).filter(
    (e: { note?: string }) => e.note === "ยอดตั้งต้นตอนขึ้นทะเบียน"
  );
  expect(opening.length, "ไม่มีแถวยอดตั้งต้นในประวัติ").toBe(1);
});

Then("ประวัติของรายการใหม่ต้องมีแถวยอดตั้งต้น", async ({ page, bdd }) => {
  // ของที่เพิ่งขึ้นทะเบียนมีของอยู่ในคลังทันที ประวัติจึงต้องตอบได้ว่ายอดนั้นมาจากไหน
  // ไม่ใช่ "ยังไม่มีประวัติของพัสดุนี้" ทั้งที่ยอดขึ้นไปแล้ว
  await openNewItem(page, bdd.newItem.name);
  await page.getByRole("button", { name: "ประวัติ", exact: true }).click();
  const rows = page.locator("ol > li > div > button");
  await expect(rows.first()).toContainText("ยอดตั้งต้นตอนขึ้นทะเบียน", { timeout: 15_000 });
});
