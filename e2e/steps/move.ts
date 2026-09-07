import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";
import { createConsumable } from "./helpers";

const { Given, When, Then } = createBdd(test);

Given("มีรายการ X ในระบบ", async ({ request, bdd, uniqueCode }) => {
  bdd.item = await createConsumable(request, uniqueCode, 1);
});

When(
  "ฉันเปิดหน้า {string} เลือกแถว X แล้วกด {string} กรอกอาคาร ชั้น และห้อง แล้วบันทึก",
  async ({ page, bdd }, pageLabel: string, move: string) => {
    await page.goto("/items");
    await expect(page.getByText(/พบ \d+ รายการ/)).toBeVisible();
    await page.getByPlaceholder("ค้นหารหัส / ชื่อพัสดุ…").fill(bdd.item.code);
    const row = page.getByRole("row").filter({ hasText: bdd.item.code }).first();
    await row.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: move, exact: true }).click();
    const dialog = page.getByRole("dialog");
    // ต้องเป็นห้องที่ไม่ใช่ห้องเดิม: createConsumable วางของไว้ที่ dbHomeLocation() = อาคาร 2 /
    // ชั้น 4 / 402 ย้ายไปห้องเดิมคือ no-op และ PATCH /api/items/[id] เขียน LocationChangeLog
    // เฉพาะตอนที่ locationId เปลี่ยนจริง (ถูกแล้ว) ประวัติจึงว่างและ Then ตกทั้งที่ระบบไม่ผิด
    // ห้อง 401 อยู่ในชุด seed เหมือนกัน และยังเป็น "อาคาร 2" ตามที่ Then ข้อสุดท้ายเช็ค
    // typing gets wiped when the combobox remounts with its options, so type a prefix and
    // click the dropdown suggestion to commit
    await dialog.getByPlaceholder("เช่น อาคาร 2").fill("อาคาร");
    await dialog.getByRole("button", { name: "อาคาร 2", exact: true }).first().click();
    await dialog.getByPlaceholder("เช่น 4", { exact: true }).fill("ชั้น");
    await dialog.getByRole("button", { name: "ชั้น 4", exact: true }).first().click();
    await dialog.getByPlaceholder("เช่น 402", { exact: true }).fill("401");
    await dialog.getByRole("button", { name: "401", exact: true }).first().click();
    // the cascade emits its ref from an effect — let it settle before saving
    await page.waitForTimeout(400);
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  }
);

Then("ฉันจะเห็นข้อความยืนยันว่าย้ายไปยังที่ตั้งใหม่เรียบร้อย", async ({ page }) => {
  await expect(page.getByText(/ย้ายไปยัง.*เรียบร้อย/)).toBeVisible({ timeout: 10_000 });
});

Then(
  "ฉันจะเห็นแถว {string} ในแท็บ {string} ของ X",
  async ({ page, bdd }, kind: string, tab: string) => {
    await page.goto(`/items/${bdd.item.code}`);
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(
      page.getByRole("button").filter({ hasText: kind }).first()
    ).toBeVisible({ timeout: 20_000 });
  }
);

// ── ย้ายไปที่เดิม: ต้องถูกกันไว้ก่อนกด ────────────────────────────────────────
// createConsumable วางของไว้ที่ dbHomeLocation() = อาคาร 2 / ชั้น 4 / 402 — เลือกที่เดิมซ้ำ
When(
  "ฉันเปิดหน้า {string} เลือกแถว X แล้วกด {string} เลือกที่ตั้งเดิมของ X",
  async ({ page, bdd }, _pageLabel: string, move: string) => {
    await page.goto("/items");
    await expect(page.getByText(/พบ \d+ รายการ/)).toBeVisible();
    await page.getByPlaceholder("ค้นหารหัส / ชื่อพัสดุ…").fill(bdd.item.code);
    const row = page.getByRole("row").filter({ hasText: bdd.item.code }).first();
    await row.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: move, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("เช่น อาคาร 2").fill("อาคาร");
    await dialog.getByRole("button", { name: "อาคาร 2", exact: true }).first().click();
    await dialog.getByPlaceholder("เช่น 4", { exact: true }).fill("ชั้น");
    await dialog.getByRole("button", { name: "ชั้น 4", exact: true }).first().click();
    await dialog.getByPlaceholder("เช่น 402", { exact: true }).fill("402");
    await dialog.getByRole("button", { name: "402", exact: true }).first().click();
    await page.waitForTimeout(400);
  }
);

Then("ฉันจะเห็นคำเตือนว่าอยู่ที่นี่อยู่แล้ว และปุ่มบันทึกกดไม่ได้", async ({ page }) => {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("อยู่ที่นี่อยู่แล้ว");
  await expect(dialog.getByRole("button", { name: "บันทึก", exact: true })).toBeDisabled();
});
