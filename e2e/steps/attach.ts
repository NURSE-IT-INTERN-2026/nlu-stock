import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";
import { expectHistory, freshTracked } from "./helpers";

const { Given, When, Then } = createBdd(test);

Given("มีรายการนับรายชิ้น X มีชิ้นย่อยพร้อมใช้อยู่", async ({ request, bdd, uniqueCode }) => {
  bdd.item = await freshTracked(request, uniqueCode);
});

When(
  "ฉันเปิดหน้ารายละเอียดของ X กด {string} กรอกอาการ แนบรูป แล้วยืนยัน",
  async ({ page, bdd }, label: string) => {
    await page.goto(`/items/${bdd.item.code}`);
    await page.getByRole("button", { name: label }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder(/อธิบายรายละเอียดการชำรุด/).fill("E2E จอแตก");
    await dialog.getByRole("button", { name: "แนบรูป/เอกสาร" }).click();
    await page.locator('input[type="file"]').last().setInputFiles("e2e/assets/evidence.png");
    await dialog.getByRole("button", { name: label }).click();
  }
);

Then("ฉันจะเห็นข้อความว่าแจ้งชำรุดแล้ว", async ({ page }) => {
  await expect(page.getByText("แจ้งชำรุดแล้ว")).toBeVisible({ timeout: 10_000 });
});

Then("ฉันจะเห็นหลักฐาน {int} รูปในแท็บ {string} ของ X", async ({ page, bdd }, n: number, tab: string) => {
  await page.goto(`/items/${bdd.item.code}`);
  await page.getByRole("button", { name: tab, exact: true }).click();
  await expect(
    page.getByRole("button").filter({ hasText: new RegExp(`หลักฐาน\\s*${n}`) }).first()
  ).toBeVisible({ timeout: 15_000 });
});

Then(
  "ประวัติของ X บนสุดต้องเป็นการ์ดเคส {string} ของชิ้น {string} เปิดดูแล้วมีรายละเอียดและหลักฐาน {int} ไฟล์",
  async ({ page, bdd }, label: string, sub: string, files: number) => {
    // แจ้งชำรุดเปิดเคสซ่อมทันที (รอส่งซ่อม) ประวัติจึงต้องขึ้นเป็นใบเคสที่มีเลข RC และบอกชิ้น
    // ไม่ใช่แถว "เปลี่ยนสถานะ" ลอย ๆ ที่กดแล้วไม่มีเคสให้เปิด
    await expectHistory(page, bdd.item.code, [new RegExp(String.raw`${label}[\s\S]*${sub}`)], {
      row: label,
      contains: "E2E จอแตก",
      evidence: files,
    });
  }
);
