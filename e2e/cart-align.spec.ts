import { test, expect } from "@playwright/test";

// Synthetic cart (localStorage "dispense-cart") — mix of lot/no-lot/tracked/count
// so the table must keep columns aligned whether or not the Lot cell has content.
const ITEMS = [
  {
    itemId: "syn-1", itemCode: "SYN-CON-1",
    itemName: "วัสดุสิ้นเปลือง มีหลาย Lot ชื่อยาวเพื่อทดสอบการ truncate ของ dropdown trigger",
    categoryName: "วัสดุสิ้นเปลือง", dispenseType: "CONSUMABLE", trackIndividually: false,
    issueUnit: "คู่", quantity: 2, availableQty: 14, lotId: "lot-1", lotNumber: "LOT-A",
    lots: [
      { id: "lot-1", lotNumber: "LOT-A", expiryDate: null, quantity: 8 },
      { id: "lot-2", lotNumber: "LOT-B", expiryDate: "2026-12-31", quantity: 6 },
    ],
    subItems: [], location: { building: "อาคาร 2", floor: "ชั้น 5", room: "404", detail: null },
  },
  {
    itemId: "syn-2", itemCode: "SYN-CON-2", itemName: "วัสดุสิ้นเปลือง ไม่มี Lot (cell ว่าง → แสดง -)",
    categoryName: "วัสดุสิ้นเปลือง", dispenseType: "CONSUMABLE", trackIndividually: false,
    issueUnit: "แพ็ค", quantity: 3, availableQty: 40, lotId: null, lotNumber: null,
    lots: [], subItems: [], location: { building: "อาคาร 2", floor: "ชั้น 5", room: "404", detail: null },
  },
  {
    itemId: "syn-5", itemCode: "SYN-CON-5", itemName: "วัสดุสิ้นเปลือง Lot เดียว (badge ต้องเป็น secondary)",
    categoryName: "วัสดุสิ้นเปลือง", dispenseType: "CONSUMABLE", trackIndividually: false,
    issueUnit: "กล่อง", quantity: 1, availableQty: 9, lotId: "l5", lotNumber: "LOT-X",
    lots: [{ id: "l5", lotNumber: "LOT-X", expiryDate: null, quantity: 9 }],
    subItems: [], location: { building: "อาคาร 1", floor: "ชั้น 2", room: "201", detail: null },
  },
  {
    itemId: "syn-3", itemCode: "SYN-DUR-3", itemName: "วัสดุคงทน ติดตามรายชิ้น (sub-item select)",
    categoryName: "วัสดุคงทน", dispenseType: "ITEM", trackIndividually: true,
    issueUnit: "ชิ้น", quantity: 1, availableQty: 1, subItemId: "sub-1", subCode: "C01",
    lots: [],
    subItems: [
      { id: "sub-1", subCode: "C01", condition: "GOOD" },
      { id: "sub-2", subCode: "C02", condition: null },
    ],
    location: null,
  },
  {
    itemId: "syn-4", itemCode: "SYN-DUR-4", itemName: "วัสดุคงทน นับจำนวน (ไม่มี lot/sub, cell -)",
    categoryName: "วัสดุคงทน", dispenseType: "COUNT", trackIndividually: false,
    issueUnit: "ชุด", quantity: 4, availableQty: 10, lotId: null, lotNumber: null,
    lots: [], subItems: [], location: null,
  },
];

async function seedCart(page: import("@playwright/test").Page) {
  await page.addInitScript((data) => {
    localStorage.setItem("dispense-cart", JSON.stringify(data));
  }, ITEMS);
}

test("desktop (≥md): table columns align incl. rows without lot", async ({ page }) => {
  await seedCart(page);
  await page.goto("/cart");
  await page.locator('[aria-label="ลดจำนวน"]').first().waitFor({ state: "visible" });
  await page.screenshot({ path: "e2e/cart-table-desktop.png", fullPage: true });

  // header columns present (scope to first section's table — there are 2)
  const headers = await page.locator("table").first().locator("thead th").allTextContents();
  expect(headers.map((h) => h.trim())).toEqual(["", "รายการ", "Lot", "เหลือ", "ที่อยู่", "จำนวน", ""]);

  // col-4 (qty) left edge identical across all rows (incl. rows with empty Lot cell)
  const minusXs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-label="ลดจำนวน"]'))
      .filter((b) => (b as HTMLElement).offsetParent !== null)
      .map((b) => Math.round((b as HTMLElement).getBoundingClientRect().left))
  );
  expect(minusXs.length).toBeGreaterThanOrEqual(4);
  expect(new Set(minusXs).size, `qty column misaligned: ${minusXs.join(", ")}`).toBe(1);

  // col-3 (Lot) left edge identical across rows that have a select trigger
  const selXs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-slot="select-trigger"]'))
      .filter((s) => (s as HTMLElement).offsetParent !== null)
      .map((s) => Math.round((s as HTMLElement).getBoundingClientRect().left))
  );
  expect(selXs.length).toBeGreaterThanOrEqual(2);
  expect(new Set(selXs).size, `Lot column misaligned: ${selXs.join(", ")}`).toBe(1);

  // header "จำนวน" sits over the qty column (th[5] vs first row td[5], same table)
  const qtyAlign = await page.evaluate(() => {
    const table = document.querySelector("table");
    if (!table) return { header: -1, body: -1 };
    const qtyTh = table.querySelectorAll("thead th")[5];
    const qtyTd = table.querySelector("tbody tr")?.children[5] as HTMLElement | undefined;
    return {
      header: qtyTh ? Math.round(qtyTh.getBoundingClientRect().left) : -1,
      body: qtyTd ? Math.round(qtyTd.getBoundingClientRect().left) : -1,
    };
  });
  expect(Math.abs(qtyAlign.header - qtyAlign.body), `header ${qtyAlign.header} vs body ${qtyAlign.body}`).toBeLessThan(2);
});

test("mobile (<md): table hidden, stacked layout active", async ({ page }) => {
  await seedCart(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/cart");
  await page.locator('[aria-label="ลดจำนวน"] >> visible=true').first().waitFor({ state: "visible" });
  await page.screenshot({ path: "e2e/cart-stacked-mobile.png", fullPage: true });

  // desktop table must be hidden at mobile breakpoint
  expect(await page.locator("table").first().isHidden()).toBeTruthy();

  // stacked (mobile) steppers are visible
  const visibleSteppers = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-label="ลดจำนวน"]'))
      .filter((b) => (b as HTMLElement).offsetParent !== null).length
  );
  expect(visibleSteppers).toBeGreaterThanOrEqual(4);
});

test("typography: exactly 2 scales (primary / secondary / header ≤ secondary)", async ({ page }) => {
  await seedCart(page);
  await page.goto("/cart");
  await page.locator('[aria-label="ลดจำนวน"]').first().waitFor({ state: "visible" });

  // NOTE: this project's @theme bumps the scale — text-xs = 14px, text-sm = 16px
  // (see globals.css). So primary(text-sm)=16, secondary(text-xs)=14.
  // columns: 0 thumb / 1 รายการ / 2 Lot / 3 เหลือ / 4 ที่อยู่ / 5 จำนวน / 6 delete
  const fs = await page.evaluate(() => {
    const row = document.querySelector("table tbody tr");
    if (!row) return null;
    const c = row.children;
    const px = (el: Element | null) => (el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : -1);
    return {
      name: px(c[1].querySelector("div > span:nth-child(2)")), // primary
      code: px(c[1].querySelector("div > span:nth-child(1)")), // secondary
      lotValue: px(c[2].querySelector('[data-slot="select-value"]')), // primary
      remain: px(c[3]), // secondary
      location: px(c[4].querySelector("span")), // secondary
      qtyNumber: px(c[5].querySelector("button > span")), // primary
    };
  });
  expect(fs, "row cells resolved").not.toBeNull();
  // primary (text-sm = 16): name, lot value, qty number — must match exactly
  expect(fs!.name).toBe(16);
  expect(fs!.lotValue).toBe(16);
  expect(fs!.qtyNumber).toBe(16);
  // secondary (text-xs = 14): code, เหลือ, ที่อยู่ — must match exactly
  expect(fs!.code).toBe(14);
  expect(fs!.remain).toBe(14);
  expect(fs!.location).toBe(14);
  // header ≤ secondary
  const headerPx = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll("table thead th"));
    const th = ths.find((t) => (t.textContent ?? "").trim().length > 0);
    return th ? Math.round(parseFloat(getComputedStyle(th).fontSize)) : -1;
  });
  expect(headerPx).toBeLessThanOrEqual(14);
  // no third scale anywhere in the table — only the two allowed sizes
  const otherSizes = await page.evaluate(() =>
    Array.from(new Set(
      Array.from(document.querySelectorAll("table *"))
        .map((el) => Math.round(parseFloat(getComputedStyle(el).fontSize)))
    )).sort((a, b) => a - b)
  );
  expect(otherSizes.every((s) => s === 14 || s === 16), `unexpected sizes: ${otherSizes.join(",")}`).toBe(true);
});

