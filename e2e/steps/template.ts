import { createBdd } from "playwright-bdd";
import { test, expect, pool } from "../fixtures";
import { createConsumable } from "./helpers";

const { Given, When, Then } = createBdd(test);

async function addToCart(page: import("@playwright/test").Page, code: string) {
  await page.goto("/dispense");
  await expect(page.getByText(/พบ \d+ รายการ|ไม่พบพัสดุ/)).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("ค้นหารหัส / ชื่อพัสดุ…").fill(code);
  const card = page.locator("article", { hasText: code }).first();
  await card.getByRole("button", { name: "เพิ่ม", exact: true }).click();
  await expect(card.getByText(/ในตะกร้า \d+/)).toBeVisible();
}

Given("ตะกร้าของฉันมีของ {int} รายการ", async ({ page, request, bdd, uniqueCode }, _n: number) => {
  bdd.item = await createConsumable(request, uniqueCode, 5);
  await addToCart(page, bdd.item.code);
});

When("ฉันกด {string} บนหน้าตะกร้า แล้วตั้งชื่อเทมเพลต", async ({ page, bdd }, save: string) => {
  await page.goto("/cart");
  await page.getByRole("button", { name: save }).click();
  bdd.template = `E2E เทมเพลต ${bdd.item.code}`;
  const dialog = page.getByRole("dialog");
  await dialog.locator("input, textarea").first().fill(bdd.template);
  await dialog.getByRole("button", { name: /บันทึก|สร้าง|ยืนยัน/ }).click();
  await page.waitForTimeout(1000);
});

When(
  "ฉันล้างตะกร้า แล้วกด {string} เลือกเทมเพลตที่บันทึกไว้",
  async ({ page, bdd }, load: string) => {
    await page.getByRole("button", { name: "ล้าง" }).click();
    await page.getByRole("button", { name: "ล้างทั้งหมด" }).click();
    await expect(page.getByText("ตะกร้าว่าง")).toBeVisible();
    await page.getByRole("button", { name: load }).click();
    await page.getByText(bdd.template, { exact: false }).first().click();
  }
);

Then("ฉันจะเห็นของกลับมาในตะกร้าครบตามเทมเพลต", async ({ page, bdd }) => {
  await expect(page.getByText(bdd.item.code).first()).toBeVisible({ timeout: 10_000 });
});

// ── regression: ตะกร้าต้องไม่ทะลุยอดคงเหลือ ──
// POST /api/cart เป็น increment ล้วน ๆ (จงใจไม่ clamp) แล้วคืนตะกร้าทั้งใบมาทับ state
// ฝั่ง client จึงต้องส่ง "ส่วนที่เพิ่มได้จริง" ไม่ใช่จำนวนดิบ ไม่งั้น 2 + 2 = 4 บนของที่เหลือ 2
Given("ตะกร้าของฉันมีของสิ้นเปลือง X เต็มยอดคงเหลือ {int}", async ({ page, request, bdd, uniqueCode }, qty: number) => {
  // ตะกร้าอยู่ใน DB แล้ว ของค้างจาก scenario ก่อนจะปนเข้ามาในเทมเพลตที่กำลังจะบันทึก
  await pool.query(`DELETE FROM cart_lines`);
  bdd.item = await createConsumable(request, uniqueCode, qty);
  await addToCart(page, bdd.item.code);
  const card = page.locator("article", { hasText: bdd.item.code }).first();
  for (let i = 1; i < qty; i++) {
    await card.getByRole("button", { name: "เพิ่มจำนวน" }).click();
  }
  await expect(card.getByText(new RegExp(`ในตะกร้า ${qty}`))).toBeVisible({ timeout: 10_000 });
});

When("ฉันบันทึกตะกร้าเป็นเทมเพลต แล้วโหลดเทมเพลตนั้นทับตะกร้าเดิม", async ({ page, bdd }) => {
  await page.goto("/cart");
  await page.getByRole("button", { name: "บันทึกเทมเพลต" }).click();
  bdd.template = `E2E เต็มเพดาน ${bdd.item.code}`;
  const dialog = page.getByRole("dialog");
  await dialog.locator("input, textarea").first().fill(bdd.template);
  await dialog.getByRole("button", { name: /บันทึก|สร้าง|ยืนยัน/ }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  // ไม่ล้างตะกร้าก่อน — ตรงนี้แหละที่ของเดิมบวกทับจนทะลุเพดาน
  await page.getByRole("button", { name: "โหลดเทมเพลต" }).click();
  await page.getByText(bdd.template, { exact: false }).first().click();
  await expect(page.getByText(/โหลดเทมเพลตแล้ว/)).toBeVisible({ timeout: 10_000 });
});

Then("จำนวนของ X ในตะกร้าต้องยังเป็น {int}", async ({ bdd }, qty: number) => {
  await expect
    .poll(async () => {
      const { rows } = await pool.query(`SELECT quantity FROM cart_lines WHERE "itemId" = $1`, [bdd.item.id]);
      return rows.reduce((sum, r) => sum + Number(r.quantity), 0);
    }, { timeout: 10_000 })
    .toBe(qty);
});
