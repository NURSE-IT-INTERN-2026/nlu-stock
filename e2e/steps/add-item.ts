import { createBdd } from "playwright-bdd";
import { test, expect, pool } from "../fixtures";

const { Given, When, Then } = createBdd(test);

/** ห้องเดียวกันทั้งสามรายการ — wizard เคยไม่ถามที่จัดเก็บเลย ของใหม่จึงค้างเป็น null */
const LOCATION = { building: "อาคาร 2", floor: "ชั้น 4", room: "402" };

interface Created {
  name: string;
  qty: number;
  /** ยืม-คืน ตาม Code — ได้ชิ้นย่อย C01.. แทนยอดรวม */
  tracked: boolean;
}

/** โค้ดที่ระบบออกให้ตอนสร้าง (wizard ตั้งเอง เทสไม่ได้เป็นคนกรอก) */
async function codeOf(name: string) {
  const { rows } = await pool.query(`SELECT code FROM items WHERE name = $1`, [name]);
  if (!rows[0]) throw new Error(`ไม่พบพัสดุชื่อ ${name} ใน DB`);
  return rows[0].code as string;
}

Given("ฉันเปิดหน้ารับเข้า-คืนพัสดุ", async ({ page, bdd }) => {
  bdd.created = [] as Created[];
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

    // toast อ้างชื่อรายการ — ยันทีละใบได้แม้ toast ใบก่อนยังไม่หาย
    await expect(page.getByText(`สร้างพัสดุ "${name}" สำเร็จ`)).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toBeHidden();

    (bdd.created as Created[]).push({ name, qty, tracked });
  }
);

Then("ฉันจะเห็นทั้งสามรายการอยู่บนหน้ารายละเอียดของตัวเอง", async ({ page, bdd }) => {
  const created = bdd.created as Created[];
  expect(created).toHaveLength(3);
  for (const item of created) {
    const code = await codeOf(item.name);
    await page.goto(`/items/${code}`);
    await expect(page.getByRole("heading", { name: item.name, level: 1 })).toBeVisible({ timeout: 15_000 });
    // หัวเรื่องพิมพ์รหัสรวมกับจำนวนในก้อนเดียว ("NLU-KRU-167 · 3 ชิ้น") จับแบบมีอยู่ในข้อความ
    await expect(page.getByText(code).first()).toBeVisible();
  }
});

Then("รายการแบบตาม Code ต้องมีเลขชิ้นย่อย C01 C02 C03", async ({ page, bdd }) => {
  const item = (bdd.created as Created[]).find((c) => c.tracked)!;
  await page.goto(`/items/${await codeOf(item.name)}`);
  for (const sub of ["C01", "C02", "C03"]) {
    await expect(page.getByRole("button", { name: new RegExp(`-${sub}$`) }).first()).toBeVisible({ timeout: 15_000 });
  }
});

Then("อีกสองรายการต้องมียอดคงเหลือเท่าจำนวนที่ตั้งไว้", async ({ page, bdd }) => {
  for (const item of (bdd.created as Created[]).filter((c) => !c.tracked)) {
    await page.goto(`/items/${await codeOf(item.name)}`);
    // การ์ดสต็อกพิมพ์ "คงเหลือ / รวม หน่วย" — ยันฝั่งรวม ซึ่งเป็นจำนวนที่กรอกไว้ตอนสร้าง
    await expect(page.getByText(new RegExp(`^/\\s*${item.qty}\\s`)).first()).toBeVisible({ timeout: 15_000 });
  }
});

Then("ทั้งสามรายการต้องผูกกับที่จัดเก็บที่เลือกไว้ ไม่ใช่ค้างเป็นไม่ระบุ", async ({ bdd }) => {
  for (const item of bdd.created as Created[]) {
    const { rows } = await pool.query(
      `SELECT l.building, l.floor, l.room
         FROM items i JOIN locations l ON l.id = i."locationId"
        WHERE i.name = $1`,
      [item.name]
    );
    expect(rows[0], `${item.name} ไม่ผูกที่จัดเก็บ`).toMatchObject(LOCATION);
  }
});
