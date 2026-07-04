import { test, expect, pool, findConsumable, receive } from "./fixtures";

test("receive creates a lot and increments item counters", async ({ request }) => {
  const item = await findConsumable();
  expect(item, "no seeded CON item").toBeTruthy();

  const before = (
    await pool.query(`SELECT "availableQty", "totalQty" FROM items WHERE id = $1`, [item.id])
  ).rows[0];

  const lotNumber = `RCV-${Date.now()}`;
  const res = await receive(request, item.id, 10, lotNumber);
  expect(res.ok()).toBeTruthy();

  const after = (
    await pool.query(`SELECT "availableQty", "totalQty" FROM items WHERE id = $1`, [item.id])
  ).rows[0];
  expect(after.availableQty).toBe(before.availableQty + 10);
  expect(after.totalQty).toBe(before.totalQty + 10);

  const lot = (
    await pool.query(
      `SELECT "remainingQty", "receivedQty" FROM lots WHERE "itemId" = $1 AND "lotNumber" = $2`,
      [item.id, lotNumber]
    )
  ).rows[0];
  expect(lot, "lot not created").toBeTruthy();
  expect(lot.receivedQty).toBe(10);
  expect(lot.remainingQty).toBe(10);
});
