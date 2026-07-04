import { test, expect, pool, findConsumable, findCount, makeTracked, receive } from "./fixtures";

async function dispense(
  request: import("@playwright/test").APIRequestContext,
  body: unknown
) {
  return request.post("/api/dispense", { data: body });
}

test("dispense CONSUMABLE: deducts lot + item counters (FIFO guard)", async ({ request }) => {
  const item = await findConsumable();
  expect(item).toBeTruthy();
  // stock a fresh lot of 20 so we control the state
  const lotNumber = `DSP-${Date.now()}`;
  await receive(request, item.id, 20, lotNumber);

  const lot = (
    await pool.query(
      `SELECT id, "remainingQty" FROM lots WHERE "itemId" = $1 AND "lotNumber" = $2`,
      [item.id, lotNumber]
    )
  ).rows[0];
  const beforeItem = (
    await pool.query(`SELECT "availableQty" FROM items WHERE id = $1`, [item.id])
  ).rows[0];

  const res = await dispense(request, {
    items: [{ itemId: item.id, lotId: lot.id, quantity: 5 }],
    usageType: "COURSE",
    notes: "e2e",
  });
  expect(res.ok()).toBeTruthy();

  const lotAfter = (
    await pool.query(`SELECT "remainingQty" FROM lots WHERE id = $1`, [lot.id])
  ).rows[0];
  const itemAfter = (
    await pool.query(`SELECT "availableQty" FROM items WHERE id = $1`, [item.id])
  ).rows[0];
  expect(lotAfter.remainingQty).toBe(lot.remainingQty - 5);
  expect(itemAfter.availableQty).toBe(beforeItem.availableQty - 5);
});

test("dispense COUNT: decrements availableQty (atomic guard)", async ({ request }) => {
  const item = await findCount();
  expect(item).toBeTruthy();
  const before = item.availableQty;

  const res = await dispense(request, {
    items: [{ itemId: item.id, quantity: 3 }],
  });
  expect(res.ok()).toBeTruthy();

  const after = (
    await pool.query(`SELECT "availableQty" FROM items WHERE id = $1`, [item.id])
  ).rows[0];
  expect(after.availableQty).toBe(before - 3);
});

test("dispense ITEM: checks out a sub-item", async ({ request, uniqueCode }) => {
  const tracked = await makeTracked(request, uniqueCode);

  const res = await dispense(request, {
    items: [{ itemId: tracked.id, subItemId: tracked.subId, quantity: 1 }],
  });
  expect(res.ok()).toBeTruthy();

  const sub = (
    await pool.query(`SELECT status FROM sub_items WHERE id = $1`, [tracked.subId])
  ).rows[0];
  expect(sub.status).toBe("ON_LOAN");
});

test("concurrent dispense cannot drive stock negative (bug-1 guard)", async ({ request }) => {
  const item = await findCount();
  expect(item).toBeTruthy();
  // pin availableQty to exactly 1
  await request.post(`/api/items/${item.id}/adjust`, {
    data: { shelfCount: 1, reason: "COUNT_MISMATCH" },
  });
  const before = (
    await pool.query(`SELECT "availableQty" FROM items WHERE id = $1`, [item.id])
  ).rows[0];
  expect(before.availableQty).toBe(1);

  // fire two qty-1 dispenses simultaneously
  const [a, b] = await Promise.all([
    dispense(request, { items: [{ itemId: item.id, quantity: 1 }] }),
    dispense(request, { items: [{ itemId: item.id, quantity: 1 }] }),
  ]);
  const okCount = [a, b].filter((r) => r.ok()).length;
  expect(okCount).toBe(1); // exactly one succeeds

  const after = (
    await pool.query(`SELECT "availableQty" FROM items WHERE id = $1`, [item.id])
  ).rows[0];
  expect(after.availableQty).toBe(0); // never negative
});
