import { test, expect, pool, findCount, makeTracked, uniqueCode } from "./fixtures";

test("adjust (shelfCount) corrects counters + writes StockAdjustment", async ({ request }) => {
  const item = await findCount();
  expect(item).toBeTruthy();

  const res = await request.post(`/api/items/${item.id}/adjust`, {
    data: { shelfCount: 25, reason: "COUNT_MISMATCH" },
  });
  expect(res.ok()).toBeTruthy();

  const after = (
    await pool.query(
      `SELECT "availableQty", "totalQty" FROM items WHERE id = $1`,
      [item.id]
    )
  ).rows[0];
  expect(after.availableQty).toBe(25);

  const adj = (
    await pool.query(
      `SELECT "newQty", "previousQty" FROM stock_adjustments WHERE "itemId" = $1 ORDER BY "adjustedAt" DESC LIMIT 1`,
      [item.id]
    )
  ).rows[0];
  expect(adj, "StockAdjustment not written").toBeTruthy();
  expect(adj.newQty).toBe(25);
});

test("status change moves a sub-item to a new status", async ({ request, uniqueCode }) => {
  const tracked = await makeTracked(request, uniqueCode);

  const res = await request.post(`/api/items/${tracked.id}/status`, {
    data: { subItemId: tracked.subId, newStatus: "DAMAGED" },
  });
  expect(res.ok()).toBeTruthy();

  const sub = (
    await pool.query(`SELECT status FROM sub_items WHERE id = $1`, [tracked.subId])
  ).rows[0];
  expect(sub.status).toBe("DAMAGED");
});

test("return checks a sub-item back in after dispense", async ({ request, uniqueCode }) => {
  const tracked = await makeTracked(request, uniqueCode);
  // dispense first → ON_LOAN
  await request.post("/api/dispense", {
    data: { items: [{ itemId: tracked.id, subItemId: tracked.subId, quantity: 1 }] },
  });

  const res = await request.post(`/api/items/${tracked.id}/return`, {
    data: { subItemId: tracked.subId },
  });
  expect(res.ok()).toBeTruthy();

  const sub = (
    await pool.query(`SELECT status FROM sub_items WHERE id = $1`, [tracked.subId])
  ).rows[0];
  expect(sub.status).toBe("AVAILABLE");
});
