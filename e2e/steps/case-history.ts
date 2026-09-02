import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";
import { sendRepair } from "./helpers";

const { When, Then } = createBdd(test);

/** แถวการ์ดในลิสต์ประวัติ — Rail() ห่อไว้อีกชั้น (ดู expectHistory ใน helpers.ts) */
const historyRows = (page: import("@playwright/test").Page) => page.locator("ol > li > div > button");

async function openHistory(page: import("@playwright/test").Page, code: string) {
  await page.goto(`/items/${code}`);
  await page.getByRole("button", { name: "ประวัติ", exact: true }).click();
  await expect(historyRows(page).first()).toBeVisible({ timeout: 15_000 });
}

When("ฉันคืน C01 พร้อมระบุว่าชำรุด", async ({ request, bdd }) => {
  // ทางนี้เขียน log "ON_LOAN → DAMAGED" ซึ่งเป็นแถวที่ /cases ใช้เปิดเคสซ่อม และเป็นแถวที่
  // ไทม์ไลน์ตัดทิ้งในฐานะแถวซ้ำของใบคืน — จุดที่ id ของสองฝั่งเคยไม่ตรงกัน
  const res = await request.post(`/api/items/${bdd.item.id}/return`, {
    data: { subItemId: bdd.item.subId, status: "DAMAGED", note: "E2E คืนมาชำรุด" },
  });
  expect(res.ok(), `คืนชำรุดไม่สำเร็จ: ${res.status()} ${await res.text()}`).toBeTruthy();
});

When("ฉันส่ง C01 ซ่อมภายใน", async ({ request, bdd }) => {
  await sendRepair(request, bdd.item.id, bdd.item.subId, "INTERNAL");
});

When("ฉันรับ C01 คืนจากซ่อมด้วยผล {string}", async ({ page, bdd }, result: string) => {
  await page.goto("/repairs?tab=receive");
  const row = page
    .getByText(bdd.item.code, { exact: false })
    .locator(`xpath=ancestor::div[.//button[contains(., "รับคืนจากส่งซ่อม")]][1]`)
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "รับคืนจากส่งซ่อม", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: result }).click();
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
});

Then(
  "ประวัติของ X ต้องมีการ์ดเคส {string} ที่มีเลขเคสและบอกว่าเป็นชิ้น {string}",
  async ({ page, bdd }, label: string, sub: string) => {
    await openHistory(page, bdd.item.code);
    const card = historyRows(page).filter({ hasText: label }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    // เลขเคสต้องเป็นเลขจริงจาก /cases ไม่ใช่ช่องว่าง — ว่างแปลว่าไทม์ไลน์จับคู่เคสไม่ได้
    await expect(card).toContainText(/RC-\d{4}-\d{4}/);
    await expect(card).toContainText(sub);
  }
);

Then(
  "ไทม์ไลน์ในเคสนั้นต้องเรียง {string} แล้ว {string} แล้ว {string}",
  async ({ page }, first: string, second: string, third: string) => {
    await historyRows(page).filter({ hasText: "งานซ่อม" }).first().click();
    const pane = page
      .locator("section")
      .filter({ has: page.getByRole("button", { name: "ไทม์ไลน์", exact: true }) })
      .last();
    await pane.getByRole("button", { name: "ไทม์ไลน์", exact: true }).click();
    const steps = pane.locator("ol > li");
    for (const [i, label] of [first, second, third].entries()) {
      await expect(steps.nth(i)).toContainText(label, { timeout: 10_000 });
    }
  }
);

Then("ประวัติของ X ต้องไม่มีการ์ดเปลี่ยนสถานะของการปิดงานซ่อมลอยอยู่", async ({ page, bdd }) => {
  // ปิดงานซ่อมเขียนสองแถวในทรานแซกชันเดียว (MaintenanceRecord + ItemStatusLog) เหตุการณ์
  // เดียวกัน ห่างกันไม่กี่ ms — แถวสถานะต้องไม่โผล่เป็นการ์ดของตัวเองข้างการ์ดเคสที่ปิดไปแล้ว
  await openHistory(page, bdd.item.code);
  await expect(
    historyRows(page).filter({ hasText: /ส่งซ่อม\s*→\s*พร้อมใช้งาน/ })
  ).toHaveCount(0);
});
