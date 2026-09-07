import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";

const { When, Then } = createBdd(test);

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
