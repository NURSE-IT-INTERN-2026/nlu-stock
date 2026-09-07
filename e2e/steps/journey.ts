import { createBdd } from "playwright-bdd";
import { test, expect, pool, dbItem } from "../fixtures";
import { createConsumable, borrowSubItem } from "./helpers";

const { Given, When, Then } = createBdd(test);

// สเต็ปที่มีเฉพาะ "เส้นทางของของ" (30-34) ที่เหลือยืมของเดิมมาใช้ทั้งหมด — เส้นทางพวกนี้จงใจ
// เดินผ่านหน้าจอเดียวกับที่เทสเดี่ยว ๆ ใช้ ต่างกันแค่ไม่หยุดตรงกลาง

// ── 30: ส่งซ่อมภายในแล้วไม่ไหว ต้องส่งต่อภายนอก ─────────────────────────────
// ไม่ใช่การส่งซ่อมใบใหม่ แต่เป็นการแก้ใบเดิม (api/repairs ถือว่าเป็น isEdit) ประวัติจึงเขียนว่า
// "แก้ข้อมูลส่งซ่อม (เดิมภายใน → ภายนอก)" ไม่ใช่ "ส่งซ่อมภายนอก" — ตรงนี้เคยเข้าใจผิดกันบ่อย
When(
  'ฉันกดปุ่ม {string} ที่แถวของ C01 แล้วเปลี่ยนไปส่งซ่อมที่ {string}',
  async ({ page, bdd }, button: string, venue: string) => {
    await page.goto("/repairs?tab=receive");
    const row = page
      .getByText(bdd.item.code, { exact: false })
      .locator(`xpath=ancestor::*[self::tr or self::div][.//button[contains(., "${button}") or contains(@aria-label, "${button}")]][1]`)
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: venue, exact: true }).click();
    // dialog แก้ข้อมูล ปิดด้วย "บันทึก" ไม่ใช่ "ยืนยัน" แบบตอนส่งซ่อมครั้งแรก
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.getByText("แก้ข้อมูลการส่งซ่อมแล้ว").first()).toBeVisible({ timeout: 10_000 });
  }
);

/** ปลายทางของทุกเส้นทางซ่อม/หาย: ของกลับเข้าวงจรได้จริง ไม่ใช่แค่สถานะสวย */
Then("C01 ต้องยืมออกได้อีกครั้ง", async ({ request, bdd }) => {
  const { rows } = await pool.query(
    `SELECT id FROM sub_items WHERE "itemId" = $1 AND "subCode" = $2`,
    [bdd.item.id, bdd.item.subCode],
  );
  await borrowSubItem(request, bdd.item.id, rows[0].id);
});

// ── 31/33: ยอดคงเหลือ ───────────────────────────────────────────────────────
Then("ยอดพร้อมใช้ของ X ต้องเป็น {int}", async ({ bdd }, qty: number) => {
  const item = await dbItem(bdd.item.code);
  expect(item.availableQty).toBe(qty);
});

// ── 32: คืนแล้วของหาย แล้วเจอทีหลัง ─────────────────────────────────────────
When(
  "ฉันเลือกคืนชิ้น C01 สภาพสูญหาย กรอกรายละเอียด แนบรูปหลักฐาน แล้วกด {string} และ {string}",
  async ({ page, bdd }, save: string, confirm: string) => {
    const unit = page.getByRole("button").filter({ hasText: bdd.item.subCode }).first();
    await unit.click();
    await page.getByRole("button", { name: "สูญหาย", exact: true }).click();
    await page.getByPlaceholder("ระบุรายละเอียดการสูญหาย").fill("E2E หายระหว่างใช้งาน");
    await page.locator('input[type="file"]').first().setInputFiles("e2e/assets/evidence.png");
    await page.getByRole("button", { name: save, exact: true }).click();
    await page.getByRole("button", { name: confirm }).click();
  }
);

// ทางกลับของ "สูญหาย" อยู่ที่เคส ไม่ใช่ที่ปุ่มแก้สถานะ — กดแล้วยอดกลับมา *และ* เคสปิดไปพร้อมกัน
When("ฉันเปิดรายการสิ่งที่ต้องทำ แล้วกดเรียกคืน C01 ที่หาเจอแล้ว", async ({ page, bdd }) => {
  await page.goto("/alerts");
  await page.getByRole("button", { name: /รายการสิ่งที่ต้องทำ/ }).click();
  await page.getByPlaceholder("ค้นหาเคส / รหัส / พัสดุ…").fill(bdd.item.code);
  // เคสเป็นแถวในตาราง ไม่ใช่ปุ่ม — ในแถวมีปุ่มประเภทเคสอยู่ด้วย จึงต้องเจาะที่ row
  await page.getByRole("row").filter({ hasText: bdd.item.code }).first().click();
  await page.getByRole("button", { name: "เรียกคืน", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "ยืนยัน", exact: true }).click();
  // ทั้ง toast และป้ายสถานะบนเคสพูดคำเดียวกัน — เอาตัวแรกที่เจอพอ
  await expect(page.getByText(/เรียกคืนแล้ว/).first()).toBeVisible({ timeout: 10_000 });
});

// ── 33: สิ้นเปลืองสองล็อต FEFO ──────────────────────────────────────────────
// ล็อตแรกหมดอายุเดือนหน้า ล็อตหลังปีหน้า — ระบบต้องตัดตัวที่ใกล้หมดอายุก่อนเสมอ ไม่ว่ารับเข้าตอนไหน
Given(
  "มีของสิ้นเปลือง X ที่รับเข้ามาสองล็อต ล็อตแรกหมดอายุก่อน",
  async ({ request, bdd, uniqueCode }) => {
    bdd.item = await createConsumable(request, uniqueCode, 0);
    const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    for (const [lotNumber, expiryDate, quantity] of [
      [`${uniqueCode}-NEAR`, iso(30), 4],
      [`${uniqueCode}-FAR`, iso(365), 6],
    ] as const) {
      const res = await request.post("/api/receive", {
        data: { items: [{ itemId: bdd.item.id, quantity, lotNumber, expiryDate }], notes: null },
      });
      if (!res.ok()) throw new Error(`receive lot failed: ${res.status()} ${await res.text()}`);
    }
    bdd.lots = { near: `${uniqueCode}-NEAR`, far: `${uniqueCode}-FAR` };
  }
);

async function lotQty(itemId: string, lotNumber: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT "remainingQty" FROM lots WHERE "itemId" = $1 AND "lotNumber" = $2`,
    [itemId, lotNumber],
  );
  return rows[0]?.remainingQty ?? -1;
}

Then("ล็อตที่หมดอายุก่อนต้องถูกตัดจนหมด ส่วนล็อตหลังต้องยังเต็ม", async ({ bdd }) => {
  expect(await lotQty(bdd.item.id, bdd.lots.near)).toBe(0);
  expect(await lotQty(bdd.item.id, bdd.lots.far)).toBe(6);
});

Then("ล็อตหลังต้องถูกตัดต่อจากล็อตแรก", async ({ bdd }) => {
  expect(await lotQty(bdd.item.id, bdd.lots.near)).toBe(0);
  expect(await lotQty(bdd.item.id, bdd.lots.far)).toBe(4);
});

// ── 34: ใบยืมที่ นศ. เปิดเอง ต้องยังบอกได้ว่าใครยืม ─────────────────────────
Then("ใบยืมที่เปิดอยู่ต้องบอกว่าผู้ยืมคือนักศึกษา ไม่ใช่เจ้าหน้าที่", async ({ page }) => {
  const { rows } = await pool.query(`SELECT name FROM users WHERE "isBorrower" = true LIMIT 1`);
  expect(rows[0], "ไม่มีบัญชี นศ. ใน DB — เทสนี้ต้องรันหลัง 26 หรือหลัง seed").toBeTruthy();
  await expect(page.getByText(rows[0].name).first()).toBeVisible({ timeout: 15_000 });
});
