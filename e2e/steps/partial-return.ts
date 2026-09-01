import { createBdd } from "playwright-bdd";
import { test, expect, pool, makeTracked } from "../fixtures";
import { expectHistory } from "./helpers";

const { Given, When, Then } = createBdd(test);

Given("มีใบยืมของ X ที่ยืมชิ้น C01 C02 C03 ไปพร้อมกัน", async ({ request, bdd, uniqueCode }) => {
  const item = await makeTracked(request, uniqueCode, 3);
  const { rows } = await pool.query(
    `SELECT id, "subCode" FROM sub_items WHERE "itemId" = $1 ORDER BY "subCode"`,
    [item.id],
  );
  bdd.item = item;
  bdd.subs = rows;
  // ใบเดียว 3 ชิ้น — คืนทีละชิ้นถึงจะมีความหมาย ถ้าแยกใบมันคือ 3 เคสที่ไม่เกี่ยวกัน
  const due = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const res = await request.post("/api/dispense", {
    data: {
      items: rows.map((s: { id: string }) => ({ itemId: item.id, subItemId: s.id, quantity: 1 })),
      usageType: "ACTIVITY",
      usageNote: "E2E ยืม 3 ชิ้น",
      dueAt: due,
    },
  });
  if (!res.ok()) throw new Error(`borrow 3 failed: ${res.status()} ${await res.text()}`);
});

When(
  "ฉันเปิดแท็บ {string} แล้วคืนเฉพาะชิ้น C01 สภาพปกติ",
  async ({ page, bdd }, tab: string) => {
    await page.goto("/receive?tab=return");
    await expect(page.getByRole("button", { name: tab }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button").filter({ hasText: bdd.item.code }).first().click();
    // เลือกแค่ C01 — อีกสองชิ้นต้องไม่ถูกติ๊กตามไปด้วย
    await page.getByRole("button").filter({ hasText: bdd.subs[0].subCode }).first().click();
    await page.getByRole("button", { name: "ปกติ", exact: true }).click();
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page.getByRole("button", { name: "ยืนยันบันทึก" }).click();
  }
);

// "ฉันจะเห็นข้อความว่าบันทึกการคืนเรียบร้อย" นิยามอยู่แล้วที่ return.ts — ใช้ตัวเดิมร่วมกัน

Then("C01 ต้องกลับมาพร้อมใช้งาน ส่วน C02 C03 ต้องยังถูกยืมอยู่", async ({ bdd }) => {
  const { rows } = await pool.query(
    `SELECT "subCode", status FROM sub_items WHERE "itemId" = $1 ORDER BY "subCode"`,
    [bdd.item.id],
  );
  expect(rows.map((r: { status: string }) => r.status)).toEqual(["AVAILABLE", "ON_LOAN", "ON_LOAN"]);
});

Then(
  "ประวัติของ X บนสุดต้องเป็นการรับคืน เปิดดูแล้วมีรายละเอียดของชิ้นที่คืน",
  async ({ page, bdd }) => {
    // ใบของ C01 ปิดแล้วทั้งที่ทั้งรายการยังมี 2 ชิ้นค้าง — คนละใบ คนละสถานะ
    await expectHistory(page, bdd.item.code, [/การยืม[\s\S]*คืนครบแล้ว/], {
      copy: bdd.subs[0].subCode,
      steps: ["ยืม", "คืน"],
      contains: /E2E ยืม 3 ชิ้น/,
    });
  }
);
