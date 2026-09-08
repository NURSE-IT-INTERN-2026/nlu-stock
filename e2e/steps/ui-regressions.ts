import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";

const { Given, When, Then } = createBdd(test);

// ── ตัวแบ่งหน้าของ CaseWorkspace ──────────────────────────────────────────────
// ตารางเคสหั่นข้อมูลฝั่ง server แล้วส่งตัวแบ่งหน้าเข้าไปเป็น footer ของ ReportDataTable
// ซึ่งเคยคืนค่าออกก่อนถึง footer ทั้งตอน loading และตอนไม่มีแถว. คุมข้อมูลจาก route แทน
// การเพาะเคสจริงหลายสิบใบ เพราะสิ่งที่พังอยู่ฝั่งจอล้วน ไม่ได้อยู่ที่ /api/cases —
// และ "หน้าถัดไปตอบช้า" เป็นเงื่อนไขที่เพาะด้วยข้อมูลจริงไม่ได้เลย
const PER_PAGE = 20;
const TOTAL = 45;

function fakeCases(page: number) {
  const start = (page - 1) * PER_PAGE;
  return {
    cases: Array.from({ length: PER_PAGE }, (_, i) => ({
      id: `e2e-case-${start + i}`,
      type: "REPAIR",
      state: "DONE",
      code: `RP-E2E-${String(start + i).padStart(3, "0")}`,
      subject: `เคสทดสอบหน้า ${page}`,
      statusLabel: "ซ่อมเสร็จ",
      title: `พัสดุทดสอบ ${start + i}`,
      itemId: `e2e-item-${start + i}`,
      itemCode: `NLU-E2E-${start + i}`,
      subCode: null,
      qty: null,
      unit: "",
      openedBy: "Admin User",
      openedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    total: TOTAL,
    page,
    perPage: PER_PAGE,
    summary: { lostCases: 0, lostPriced: 0, lostExact: 0, lostValue: 0, repairCost: 0 },
  };
}

Given("รายการเคสมีหลายหน้า และหน้าถัดไปตอบช้า", async ({ page, bdd }) => {
  await page.route("**/api/cases?**", async (route) => {
    const p = Number(new URL(route.request().url()).searchParams.get("page") ?? 1);
    // หน่วงเฉพาะหน้าที่สอง: หน้าแรกต้องมาเร็วเพื่อให้มีตัวแบ่งหน้าให้กด แล้วค่อยเปิดช่อง
    // ให้มองสถานะ "กำลังโหลด" ได้นานพอจะยืนยันว่าตัวแบ่งหน้ายังอยู่
    if (p > 1) await new Promise((r) => setTimeout(r, 2500));
    await route.fulfill({ json: fakeCases(p) });
  });
  bdd.pagerMocked = true;
});

When("ฉันเปิดประวัติงานซ่อมแล้วกดไปหน้าถัดไป", async ({ page }) => {
  await page.goto("/repairs?tab=history");

  const pager = page.getByRole("navigation", { name: "Pagination" });
  await expect(pager).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("เคสทดสอบหน้า 1").first()).toBeVisible();

  await pager.getByRole("button", { name: "Next page" }).click();

  // ระหว่างที่หน้าสองยังไม่มา ตารางแสดง "กำลังโหลด…" — ตัวแบ่งหน้าต้องไม่หายไปกับมัน.
  // เช็คตรงนี้ ไม่ใช่หลังโหลดเสร็จ: หลังเสร็จมันกลับมาเองอยู่แล้วแม้โค้ดจะพัง
  await expect(page.getByText("กำลังโหลด…")).toBeVisible({ timeout: 5_000 });
  // isVisible() ไม่ใช่ expect().toBeVisible(): ตัวหลัง retry จนหมด timeout ซึ่งกินเวลานาน
  // พอให้หน้าสองมาถึงและตัวแบ่งหน้ากลับมาเอง — แล้วมันก็เขียวทั้งที่แถบเพิ่งหายไปต่อหน้า
  expect(
    await pager.isVisible(),
    "ตัวแบ่งหน้าหายไประหว่างโหลดหน้าถัดไป — ไม่เหลืออะไรให้กดกลับ ถ้าหน้าที่ขอมาไม่มีแถว",
  ).toBe(true);
});

Then("ตัวแบ่งหน้าต้องยังอยู่ตลอดระหว่างโหลด และไปถึงหน้า 2 จริง", async ({ page }) => {
  await expect(page.getByText("เคสทดสอบหน้า 2").first()).toBeVisible({ timeout: 15_000 });
  const pager = page.getByRole("navigation", { name: "Pagination" });
  await expect(pager).toBeVisible();
  await expect(pager.getByRole("button", { name: "2", exact: true })).toHaveAttribute("aria-current", "page");
});

// ── รางแท็บของหน้าหลักบนจอแคบ ────────────────────────────────────────────────
Given("ฉันเปิดหน้าหลักบนจอกว้าง 375", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("tab").first()).toBeVisible({ timeout: 15_000 });
});

Then("แท็บแรกต้องอยู่ในกรอบราง ไม่ถูกดันออกไปทางซ้าย", async ({ page }) => {
  const list = page.getByRole("tablist").first();
  const first = page.getByRole("tab").first();

  // ยันที่ตำแหน่งจริง ไม่ใช่ scrollLeft: อาการคือรางไม่ได้เลื่อนไปไหน (scrollLeft = 0)
  // แต่ justify-center ดันเนื้อในออกไปเองก่อนแล้ว ขอบซ้ายของแท็บแรกจึงติดลบเทียบกับราง
  const [listBox, firstBox] = await Promise.all([list.boundingBox(), first.boundingBox()]);
  expect(listBox && firstBox, "หาแท็บแรกหรือรางไม่เจอ").toBeTruthy();
  expect(
    firstBox!.x,
    `แท็บแรกเริ่มที่ ${firstBox!.x} ซึ่งอยู่ซ้ายของรางที่ ${listBox!.x} — ส่วนที่ล้นถูกดันออกไปทางที่เลื่อนกลับไม่ได้`,
  ).toBeGreaterThanOrEqual(listBox!.x - 1);
});
