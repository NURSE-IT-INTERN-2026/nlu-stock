import { createBdd } from "playwright-bdd";
import { test, expect, pool, makeTracked } from "../fixtures";
import { expectHistory } from "./helpers";

const { Given, When, Then } = createBdd(test);

const ACTIVITY = "E2E ฝึกปฏิบัติในห้อง Lab";

Given("มีรายการนับรายชิ้น X ที่มีชิ้นว่างอยู่", async ({ request, bdd, uniqueCode }) => {
  bdd.item = await makeTracked(request, uniqueCode, 2);
});

When(
  "นักศึกษาเปิดหน้าพัสดุ X ตามที่ QR ชี้มา แล้วกดยืมพัสดุนี้ ระบุกิจกรรม แล้วยืนยัน",
  async ({ borrowerPage, bdd }) => {
    // QR พิมพ์เป็น /items/<code> — เดินทางเดียวกับที่กล้องพาไป ไม่ได้ลัดเข้า dialog
    await borrowerPage.goto(`/items/${bdd.item.code}`);
    await borrowerPage.getByRole("button", { name: "ยืมพัสดุนี้" }).click();

    const dialog = borrowerPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("combobox").first().click();
    await borrowerPage.getByRole("option", { name: "กิจกรรม" }).click();
    await dialog.getByLabel("ระบุกิจกรรมที่นำไปใช้").fill(ACTIVITY);
    await dialog.getByRole("button", { name: /^ยืนยัน/ }).click();
  }
);

Then("นักศึกษาจะเห็นข้อความว่ายืมสำเร็จ", async ({ borrowerPage }) => {
  await expect(borrowerPage.getByText(/ยืมสำเร็จ/)).toBeVisible({ timeout: 15_000 });
});

Then(
  "ใบยืมต้องบันทึกชื่อนักศึกษาเป็นผู้ยืม และชิ้นนั้นต้องเป็นสถานะถูกยืม",
  async ({ bdd }) => {
    // ผู้ยืมต้องเป็นตัว นศ. เอง ไม่ใช่เจ้าหน้าที่ที่กดแทน — นี่คือเหตุผลเดียวที่ ยืมเอง มีอยู่.
    // staffId คือคอลัมน์ผู้ทำรายการ (api/borrow เขียน นศ. ลงช่องนี้ตรง ๆ เพื่อให้ใบหน้าตาเหมือนใบที่เจ้าหน้าที่คีย์)
    const { rows } = await pool.query(
      `SELECT u.email, d."subItemId", s.status
         FROM dispense_records d
         JOIN users u ON u.id = d."staffId"
         JOIN sub_items s ON s.id = d."subItemId"
        WHERE d."itemId" = $1
        ORDER BY d."dispensedAt" DESC LIMIT 1`,
      [bdd.item.id],
    );
    expect(rows[0]?.email).toBe("student@cmu.ac.th");
    expect(rows[0]?.status).toBe("ON_LOAN");
    bdd.borrowedSubId = rows[0].subItemId;
  }
);

Then(
  "ประวัติของชิ้นนั้นต้องมีการยืมที่ยังไม่คืน เปิดดูแล้วเห็นกิจกรรมที่ระบุไว้",
  async ({ page, bdd }) => {
    const { rows } = await pool.query(`SELECT "subCode" FROM sub_items WHERE id = $1`, [bdd.borrowedSubId]);
    // อ่านด้วยตาเจ้าหน้าที่: ของที่ นศ. ยืมเองต้องโผล่ในประวัติเหมือนใบที่เจ้าหน้าที่คีย์เอง
    await expectHistory(page, bdd.item.code, [/การยืม[\s\S]*กำลังยืม/], {
      copy: rows[0].subCode,
      steps: ["ยืม"],
      contains: ACTIVITY,
    });
  }
);

When("นักศึกษาเปิดหน้าตั้งค่า", async ({ borrowerPage }) => {
  await borrowerPage.goto("/settings?tab=items");
});

Then("นักศึกษาต้องไม่ได้เห็นหน้าตั้งค่า", async ({ borrowerPage }) => {
  // middleware.ts BORROWER_PAGES ปล่อยแค่ /items/[code] กับ /scan — ที่เหลือต้องถูกพาออก
  await expect(borrowerPage).not.toHaveURL(/\/settings/, { timeout: 15_000 });
});

// ── ของหมด: ปุ่มยืมต้องไม่โผล่ ─────────────────────────────────────────────
Given("มีรายการนับรายชิ้น X ที่ทุกชิ้นถูกยืมออกไปแล้ว", async ({ request, bdd, uniqueCode }) => {
  bdd.item = await makeTracked(request, uniqueCode, 1);
  // ยืมออกด้วย SQL ตรง ๆ — สนใจแค่ "ชั้นวางว่าง" ไม่ได้เทสเส้นทางการยืม (สองเคสข้างบนทำแล้ว)
  await pool.query(`UPDATE sub_items SET status = 'ON_LOAN' WHERE "itemId" = $1`, [bdd.item.id]);
  await pool.query(`UPDATE items SET "availableQty" = 0 WHERE id = $1`, [bdd.item.id]);
});

When("นักศึกษาเปิดหน้าพัสดุ X ตามที่ QR ชี้มา", async ({ borrowerPage, bdd }) => {
  await borrowerPage.goto(`/items/${bdd.item.code}`);
});

Then("นักศึกษาต้องเห็นว่าของหมด และไม่มีปุ่มให้ยืม", async ({ borrowerPage }) => {
  await expect(borrowerPage.getByText(/ของหมด/)).toBeVisible({ timeout: 15_000 });
  await expect(borrowerPage.getByRole("button", { name: "ยืมพัสดุนี้" })).toHaveCount(0);
});

// ── ตะกร้าหลายรายการ: 1 การยืนยัน = 1 ใบ (loanGroupId เดียว) ────────────────
When(
  "นักศึกษาเปิดหน้าเบิก-ยืม ใส่ X ลงตะกร้าสองชิ้น ระบุกิจกรรม แล้วยืนยัน",
  async ({ borrowerPage, bdd }) => {
    await borrowerPage.goto(`/dispense?q=${bdd.item.code}`);
    const card = borrowerPage.getByRole("article").filter({ hasText: bdd.item.code });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole("button", { name: "เพิ่ม", exact: true }).click();
    // ชิ้นที่สอง — ของนับรายชิ้นจะหยิบ sub-item ตัวถัดไปที่ยังไม่อยู่ในตะกร้า
    await card.getByRole("button", { name: "เพิ่มจำนวน" }).click();

    await borrowerPage.getByRole("button", { name: "ดูตะกร้า" }).click();
    // ทรงเดียวกับ /cart: ปุ่มที่ footer เปิด dialog กรอกข้อมูล แล้วค่อยยืนยัน
    await borrowerPage.getByRole("button", { name: "ยืมพัสดุ", exact: true }).click();

    const dialog = borrowerPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("combobox").first().click();
    await borrowerPage.getByRole("option", { name: "กิจกรรม" }).click();
    await dialog.getByLabel("ระบุกิจกรรมที่นำไปใช้").fill(ACTIVITY);
    await dialog.getByRole("button", { name: /^ยืนยันการ/ }).click();
  }
);

Then("ทั้งสองชิ้นต้องถูกยืมในใบเดียวกัน", async ({ bdd }) => {
  const { rows } = await pool.query(
    `SELECT d."loanGroupId", s.status
       FROM dispense_records d
       JOIN sub_items s ON s.id = d."subItemId"
      WHERE d."itemId" = $1`,
    [bdd.item.id],
  );
  expect(rows).toHaveLength(2);
  // ตะกร้าเดียว = ใบเดียว: /api/borrow แจก loanGroupId ก้อนเดียวให้ทุกบรรทัด
  expect(new Set(rows.map((r) => r.loanGroupId)).size).toBe(1);
  expect(rows.every((r) => r.status === "ON_LOAN")).toBe(true);
});

// ── กระดิ่งแจ้งเตือนบนหัวหน้าจอ ────────────────────────────────────────────────
When("นักศึกษาเปิดหน้าพัสดุ X บนจอกว้าง", async ({ borrowerPage, bdd }) => {
  // ปุ่มนี้เป็น hidden lg:flex — จอแคบซ่อนมันให้ทุก role อยู่แล้ว เทสจึงต้องกว้างพอ
  // ที่จะเห็นมัน ไม่งั้นผ่านด้วยเหตุผลที่ไม่เกี่ยวกับสิทธิ์เลย
  await borrowerPage.setViewportSize({ width: 1440, height: 900 });
  await borrowerPage.goto(`/items/${bdd.item.code}`);
  await expect(borrowerPage.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
});

Then("หัวหน้าจอต้องไม่มีปุ่มรายการที่ต้องจัดการ", async ({ borrowerPage }) => {
  await expect(borrowerPage.getByRole("button", { name: "รายการที่ต้องจัดการ" })).toHaveCount(0);
  // ยันว่าจอกว้างจริง: ตะกร้าเป็นปุ่มข้างกันที่ทุก role เห็น ถ้ามันหายไปด้วยแปลว่า
  // เทสกำลังยืนยันเรื่องความกว้าง ไม่ใช่เรื่องสิทธิ์
  await expect(borrowerPage.getByRole("button", { name: "ดูตะกร้า" })).toBeVisible();
});
