import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";

const { Given, When, Then } = createBdd(test);

When(
  'ฉันกดครบทั้ง 5 แท็บ {string} {string} {string} {string} {string}',
  async ({ page }, t1: string, t2: string, t3: string, t4: string, t5: string) => {
    for (const tab of [t1, t2, t3, t4, t5]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible();
    }
  }
);

Then("แต่ละแท็บจะแสดงข้อมูลโดยไม่มีข้อความ error", async ({ page }) => {
  await expect(page.getByText(/เกิดข้อผิดพลาด|error/i)).toHaveCount(0);
});

Then("เมื่อฉันกดปุ่ม {string} ฉันจะเห็นหน้าต่างส่งออกรายงาน", async ({ page }, button: string) => {
  await page.getByRole("button", { name: "ออกจากคลัง", exact: true }).click();
  // รูปแบบไฟล์อยู่ในเมนูของปุ่ม "ส่งออก" ไม่ได้กางเป็นปุ่มของตัวเองแล้ว
  await page.getByRole("button", { name: "ส่งออก", exact: true }).filter({ visible: true }).click();
  // export is window.open on some tabs, a direct download on others — accept either
  const outcome = Promise.race([
    page.waitForEvent("popup", { timeout: 15_000 }).then((p) => p.url()),
    page.waitForEvent("download", { timeout: 15_000 }).then((d) => d.url()),
  ]).catch(() => null);
  await page.getByRole("menuitem", { name: button, exact: true }).click();
  const url = await outcome;
  expect(url, "export fired neither a popup nor a download").toMatch(/format=xlsx/);
  // The URL alone passed even while the route 404'd: window.open skips basePath, so the
  // popup opened /api/... instead of /nlu-stock/api/... . Fetch it and demand a real file.
  const res = await page.request.get(url!);
  expect(res.status(), `export returned ${res.status()} for ${url}`).toBe(200);
});

// ── regression: ตัวกรองที่ segment ใหม่ไม่มีช่องให้แก้ ต้องหลุดออกจากคำขอด้วย ──
// ยืนยันที่ URL ของคำขอ ไม่ใช่จำนวนแถว: แถวว่างเป็นได้ทั้ง "ไม่มีข้อมูล" และ "โดนกรองล่องหน"
// ซึ่งอ่านจากหน้าจอแล้วแยกไม่ออก — อาการเดิมของบั๊กนี้พอดี
const REPORT_API = "/api/reports/dispense-history";

Given("ฉันเปิดแท็บ {string} ของรายงาน", async ({ page }, tab: string) => {
  await page.goto("/reports?tab=dispense-history");
  await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible({ timeout: 15_000 });
});

When(
  'ฉันพิมพ์ {string} ในช่องค้นหาเหตุผล แล้วสลับ segment เป็น {string}',
  async ({ page, bdd }, text: string, segment: string) => {
    const box = page.getByPlaceholder("ค้นหาวิชา / กิจกรรม / เหตุผล").filter({ visible: true }).first();
    await expect(box).toBeVisible({ timeout: 15_000 });

    // ต้องเห็นก่อนว่าค่านี้ "ติด" จริง ไม่งั้น Then ที่บอกว่ามันหลุดไปแล้วผ่านฟรีทุกครั้ง
    const applied = page.waitForRequest(
      (r) => r.url().includes(REPORT_API) && r.url().includes("recipient="),
      { timeout: 15_000 },
    );
    await box.fill(text);
    await applied;

    // ราง segment เป็น Base UI Tabs (role=tab); เผื่อ fallback ไว้เป็นปุ่มธรรมดา
    const chip = page
      .getByRole("tab", { name: segment, exact: true })
      .or(page.getByRole("button", { name: segment, exact: true }))
      .first();
    const next = page.waitForRequest(
      (r) => r.url().includes(REPORT_API) && r.url().includes("kind=inuse"),
      { timeout: 15_000 },
    );
    await chip.click();
    bdd.reportUrl = (await next).url();
  },
);

Then("คำขอรายงานของ segment ใหม่ต้องไม่มี recipient หรือ usageType ติดไป", async ({ bdd }) => {
  const q = new URL(bdd.reportUrl).searchParams;
  expect(q.get("recipient"), `recipient ยังติดไปกับ ${bdd.reportUrl}`).toBeNull();
  expect(q.get("usageType"), `usageType ยังติดไปกับ ${bdd.reportUrl}`).toBeNull();
});

Then("ช่องค้นหาเหตุผลต้องหายไปจากแถบตัวกรอง", async ({ page }) => {
  await expect(page.getByPlaceholder("ค้นหาวิชา / กิจกรรม / เหตุผล")).toHaveCount(0);
});
