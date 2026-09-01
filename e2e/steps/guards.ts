import { createBdd } from "playwright-bdd";
import { test, expect, pool, makeTracked } from "../fixtures";
import { createConsumable, createCountItem, borrowSubItem } from "./helpers";

const { Given, When, Then } = createBdd(test);

/** จำนวนแถวประวัติของพัสดุ — ใช้ยันว่าคำขอที่ถูกปฏิเสธไม่ได้แอบเขียนอะไรทิ้งไว้ */
async function historyRows(itemId: string) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*) FROM dispense_records WHERE "itemId" = $1) AS dispensed,
       (SELECT count(*) FROM stock_adjustments WHERE "itemId" = $1) AS adjusted`,
    [itemId],
  );
  return { dispensed: Number(rows[0].dispensed), adjusted: Number(rows[0].adjusted) };
}

// ─── เบิกเกินจำนวนที่มี ───

Given("มีของสิ้นเปลือง X เหลือ {int} หน่วย", async ({ request, bdd, uniqueCode }, qty: number) => {
  bdd.item = await createConsumable(request, uniqueCode, qty);
  bdd.before = await historyRows(bdd.item.id);
});

When("ฉันสั่งเบิก X {int} หน่วย", async ({ request, bdd }, qty: number) => {
  bdd.res = await request.post("/api/dispense", {
    data: { items: [{ itemId: bdd.item.id, quantity: qty }], usageType: "ACTIVITY", usageNote: "E2E over-dispense" },
  });
});

Then("ระบบต้องปฏิเสธและบอกว่าเหลือเท่าไหร่", async ({ bdd }) => {
  expect(bdd.res.ok()).toBeFalsy();
  // ข้อความต้องบอกตัวเลขจริง ไม่ใช่ "ทำไม่ได้" เปล่า ๆ — คนที่อ่านต้องรู้ว่าต้องแก้จำนวนเป็นเท่าไหร่
  expect(await bdd.res.text()).toMatch(/เหลือเพียง 3/);
});

Then(
  "ยอดของ X ต้องยังเป็น {int} และประวัติต้องไม่มีรายการเบิก",
  async ({ bdd }, qty: number) => {
    const { rows } = await pool.query(`SELECT "availableQty" FROM items WHERE id = $1`, [bdd.item.id]);
    expect(rows[0].availableQty).toBe(qty);
    expect(await historyRows(bdd.item.id)).toEqual(bdd.before);
  }
);

// ─── ยืมชิ้นที่ถูกยืมอยู่ ───

Given("มีรายการนับรายชิ้น X ที่ชิ้น C01 ถูกยืมออกไปแล้ว", async ({ request, bdd, uniqueCode }) => {
  bdd.item = await makeTracked(request, uniqueCode, 3);
  await borrowSubItem(request, bdd.item.id, bdd.item.subId);
  bdd.before = await historyRows(bdd.item.id);
});

When("ฉันสั่งยืมชิ้น C01 ซ้ำอีกครั้ง", async ({ request, bdd }) => {
  const due = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  bdd.res = await request.post("/api/dispense", {
    data: {
      items: [{ itemId: bdd.item.id, subItemId: bdd.item.subId, quantity: 1 }],
      usageType: "ACTIVITY",
      usageNote: "E2E double borrow",
      dueAt: due,
    },
  });
});

Then("ระบบต้องปฏิเสธว่าชิ้นย่อยนั้นไม่พร้อมใช้งาน", async ({ bdd }) => {
  expect(bdd.res.ok()).toBeFalsy();
  expect(await bdd.res.text()).toContain("ไม่พร้อมใช้งาน");
});

Then("C01 ต้องยังถูกยืมอยู่ใบเดิม ไม่เกิดใบยืมใบที่สอง", async ({ bdd }) => {
  const { rows } = await pool.query(`SELECT status FROM sub_items WHERE id = $1`, [bdd.item.subId]);
  expect(rows[0].status).toBe("ON_LOAN");
  expect(await historyRows(bdd.item.id)).toEqual(bdd.before);
});

// ─── ประกอบชุดเมื่อของไม่พอ ───

/** สูตรชุด 1 ใบ + ส่วนประกอบคงทน 1 ชนิด — คืน { kitId, compId } */
async function makeKit(
  request: Parameters<typeof createCountItem>[0],
  code: string,
  compQty: number,
  perSet: number,
) {
  const comp = await createCountItem(request, `${code}K`, compQty);
  const unit = (await pool.query(`SELECT id FROM units LIMIT 1`)).rows[0];
  const res = await request.post("/api/kits", {
    data: {
      name: `E2E ชุด ${code}`,
      issueUnitId: unit.id,
      components: [{ componentItemId: comp.id, quantity: perSet }],
    },
  });
  if (!res.ok()) throw new Error(`makeKit failed: ${res.status()} ${await res.text()}`);
  const kit = await res.json();
  return { kitId: kit.kitItemId ?? kit.id, compId: comp.id };
}

Given(
  "มีสูตรชุด K ที่ใช้ส่วนประกอบ {int} ชิ้นต่อชุด แต่ในคลังมีอยู่ {int} ชิ้น",
  async ({ request, bdd, uniqueCode }, perSet: number, stock: number) => {
    bdd.kit = await makeKit(request, uniqueCode, stock, perSet);
  }
);

When("ฉันสั่งประกอบ K {int} ชุด", async ({ request, bdd }, sets: number) => {
  bdd.res = await request.post(`/api/kits/${bdd.kit.kitId}/assemble`, { data: { sets } });
});

Then("ระบบต้องปฏิเสธว่าส่วนประกอบมีไม่พอ", async ({ bdd }) => {
  expect(bdd.res.ok()).toBeFalsy();
  expect(await bdd.res.text()).toMatch(/ไม่พอ/);
});

Then(
  "ส่วนประกอบต้องยังอยู่ครบ {int} ชิ้น และ K ต้องยังไม่มีชุดที่ประกอบไว้",
  async ({ bdd }, qty: number) => {
    // ส่วนประกอบเป็นของคงทนแบบนับรวม (profile DUR) — ยอดอยู่ที่ items.availableQty ไม่มี sub_items
    const comp = await pool.query(`SELECT "availableQty" FROM items WHERE id = $1`, [bdd.kit.compId]);
    expect(comp.rows[0].availableQty).toBe(qty);
    // ล้มกลางคันแล้วเหลือชุดครึ่งใบคือสิ่งที่ transaction ต้องกัน
    const sets = await pool.query(`SELECT count(*)::int AS n FROM sub_items WHERE "itemId" = $1`, [bdd.kit.kitId]);
    expect(sets.rows[0].n).toBe(0);
  }
);

// ─── ยกเลิกชุดที่ยืมอยู่ ───

Given("มีสูตรชุด K ที่ประกอบไว้ {int} ชุด และชุดนั้นถูกยืมออกไปแล้ว", async ({ request, bdd, uniqueCode }, sets: number) => {
  bdd.kit = await makeKit(request, uniqueCode, 5, 1);
  const asm = await request.post(`/api/kits/${bdd.kit.kitId}/assemble`, { data: { sets } });
  if (!asm.ok()) throw new Error(`assemble failed: ${asm.status()} ${await asm.text()}`);
  const { setSubItemIds } = await asm.json();
  bdd.setId = setSubItemIds[0];
  await borrowSubItem(request, bdd.kit.kitId, bdd.setId);
});

When("ฉันสั่งยกเลิกชุดนั้น", async ({ request, bdd }) => {
  bdd.res = await request.post(`/api/kits/sets/${bdd.setId}`, { data: { note: "E2E cancel" } });
});

Then("ระบบต้องปฏิเสธว่าต้องรับคืนก่อน", async ({ bdd }) => {
  expect(bdd.res.ok()).toBeFalsy();
  expect(await bdd.res.text()).toContain("ต้องรับคืนก่อน");
});

Then("ชุดนั้นต้องยังอยู่ในสถานะถูกยืม", async ({ bdd }) => {
  const { rows } = await pool.query(`SELECT status FROM sub_items WHERE id = $1`, [bdd.setId]);
  expect(rows[0].status).toBe("ON_LOAN");
});

// ─── ใบรับเข้าแก้ได้แค่ราคา ───

Given("มีใบรับเข้าของ X จำนวน {int} หน่วย", async ({ request, bdd, uniqueCode }, qty: number) => {
  bdd.item = await createConsumable(request, uniqueCode, 0);
  bdd.qty = qty;
  const res = await request.post("/api/receive", {
    data: { items: [{ itemId: bdd.item.id, quantity: qty, lotNumber: `E2E-${uniqueCode}`, expiryDate: null }] },
  });
  if (!res.ok()) throw new Error(`receive setup failed: ${res.status()}`);
});

When("ฉันเปิดแท็บ {string} ของหน้ารายงาน", async ({ page }, tab: string) => {
  await page.goto("/reports?tab=receive-history");
  await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible({ timeout: 15_000 });
});

Then(
  "แถวนั้นต้องมีช่องกรอกเฉพาะราคาต่อหน่วย และจำนวนต้องเป็นข้อความอ่านอย่างเดียว",
  async ({ page, bdd }) => {
    const row = page.getByRole("row").filter({ hasText: bdd.item.code }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // ราคาเป็นช่องเดียวในแถวที่แก้ได้ — จำนวนที่แก้ได้จะทำให้สต๊อกกับใบรับเข้าเล่าคนละเรื่อง
    // (ดู api/receive/[id] PATCH: schema รับแค่ unitCost)
    await expect(row.getByRole("spinbutton")).toHaveCount(1);
    await expect(row.getByRole("textbox")).toHaveCount(0);
    await expect(row).toContainText(String(bdd.qty));
  }
);
