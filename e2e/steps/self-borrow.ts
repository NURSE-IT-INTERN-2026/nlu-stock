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
