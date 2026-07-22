import { test, expect, pool, findCount, findConsumable, makeTracked, receive } from "./fixtures";

/** Whole months between two dates, rounded — cycles are month arithmetic, not 30-day blocks. */
function monthsBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (30.44 * 24 * 3600 * 1000));
}

async function countState(itemId: string) {
  const { rows } = await pool.query(
    `SELECT "availableQty", "totalQty", "lastCountDate", "nextCountDate" FROM items WHERE id = $1`,
    [itemId]
  );
  return rows[0];
}

async function lastAdjustment(itemId: string) {
  const { rows } = await pool.query(
    `SELECT id, reason, delta, "previousQty", "newQty", notes FROM stock_adjustments
      WHERE "itemId" = $1 ORDER BY "adjustedAt" DESC LIMIT 1`,
    [itemId]
  );
  return rows[0] ?? null;
}

test("count that matches stamps the cycle and writes no adjustment", async ({ request }) => {
  const item = await findCount();
  expect(item).toBeTruthy();
  const before = await countState(item.id);
  const adjBefore = await lastAdjustment(item.id);

  const res = await request.post(`/api/items/${item.id}/adjust`, {
    data: { stockCount: true, shelfCount: before.availableQty },
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  const after = await countState(item.id);
  expect(after.availableQty).toBe(before.availableQty);
  expect(after.lastCountDate).toBeTruthy();
  // Durable default cycle = 12 months.
  expect(monthsBetween(new Date(after.lastCountDate), new Date(after.nextCountDate))).toBe(12);

  const adjAfter = await lastAdjustment(item.id);
  expect(adjAfter?.id ?? null).toBe(adjBefore?.id ?? null);
});

test("counting over requires a note, then adds to available as COUNT_MISMATCH_OVER", async ({ request }) => {
  const item = await findCount();
  const before = await countState(item.id);
  const target = before.availableQty + 3;

  const noNote = await request.post(`/api/items/${item.id}/adjust`, {
    data: { stockCount: true, shelfCount: target },
  });
  expect(noNote.status()).toBe(400);
  expect(await noNote.text()).toContain("หมายเหตุ");

  const ok = await request.post(`/api/items/${item.id}/adjust`, {
    data: { stockCount: true, shelfCount: target, notes: "เจอในลิ้นชักสำรอง" },
  });
  expect(ok.ok(), await ok.text()).toBeTruthy();

  const after = await countState(item.id);
  expect(after.availableQty).toBe(target);
  expect(after.totalQty).toBe(before.totalQty + 3);

  const adj = await lastAdjustment(item.id);
  expect(adj.reason).toBe("COUNT_MISMATCH_OVER");
  expect(adj.delta).toBe(3);
  expect(adj.notes).toBe("เจอในลิ้นชักสำรอง");
});

test("counting short books the missing units as LOST", async ({ request }) => {
  const item = await findCount();
  const before = await countState(item.id);
  const target = before.availableQty - 2;
  expect(target).toBeGreaterThanOrEqual(0);

  const res = await request.post(`/api/items/${item.id}/adjust`, {
    data: { stockCount: true, shelfCount: target },
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  const after = await countState(item.id);
  expect(after.availableQty).toBe(target);

  const adj = await lastAdjustment(item.id);
  expect(adj.reason).toBe("LOST");
  expect(adj.delta).toBe(-2);
});

test("a LOST count on a lot is recoverable back into that lot", async ({ request, uniqueCode }) => {
  const item = await findConsumable();
  expect(item).toBeTruthy();
  // Receive our own lot — the seeded ones get drained by the dispense specs.
  const recv = await receive(request, item.id, 10, `LOT-${uniqueCode}`);
  expect(recv.ok(), await recv.text()).toBeTruthy();
  const lot = (
    await pool.query(`SELECT id, "remainingQty" FROM lots WHERE "itemId" = $1 AND "lotNumber" = $2`, [
      item.id,
      `LOT-${uniqueCode}`,
    ])
  ).rows[0];
  expect(lot?.remainingQty).toBe(10);

  const res = await request.post(`/api/items/${item.id}/adjust`, {
    data: { stockCount: true, lotId: lot.id, lotCount: lot.remainingQty - 1 },
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  const after = await countState(item.id);
  // Consumable default cycle = 3 months.
  expect(monthsBetween(new Date(after.lastCountDate), new Date(after.nextCountDate))).toBe(3);

  const adj = await lastAdjustment(item.id);
  expect(adj.reason).toBe("LOST");

  const rec = await request.post(`/api/items/${item.id}/recover-loss`, {
    data: { source: "ADJUSTMENT", recordId: adj.id },
  });
  expect(rec.ok(), await rec.text()).toBeTruthy();

  const lotAfter = (await pool.query(`SELECT "remainingQty" FROM lots WHERE id = $1`, [lot.id])).rows[0];
  expect(lotAfter.remainingQty).toBe(lot.remainingQty);
});

test("a shelf count on a lot-tracked consumable drains lots FEFO", async ({ request, uniqueCode }) => {
  // Staff count the shelf as one number — the server spreads the shortfall over the
  // lots, nearest expiry first, so a lot-tracked item never has to be counted per lot.
  const cat = (await pool.query(
    `SELECT c.id FROM categories c JOIN category_profiles p ON p.id = c."profileId"
      WHERE p."dispenseType" = 'CONSUMABLE' LIMIT 1`
  )).rows[0];
  const unit = (await pool.query(`SELECT id FROM units LIMIT 1`)).rows[0];
  const created = await request.post("/api/items/quick-create", {
    data: { code: uniqueCode, name: `E2E ${uniqueCode}`, categoryId: cat.id, issueUnitId: unit.id, copyCount: 1, setSize: 1, initialQty: 0 },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const item = await created.json();

  // Two lots: the later expiry received first, so FEFO ≠ FIFO here.
  const mk = async (lotNumber: string, quantity: number, expiryDate: string) => {
    const res = await request.post("/api/receive", {
      data: { items: [{ itemId: item.id, quantity, lotNumber, expiryDate }], notes: null },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  };
  await mk(`LATE-${uniqueCode}`, 10, "2028-12-31");
  await mk(`SOON-${uniqueCode}`, 6, "2027-01-31");

  const remaining = async (lotNumber: string) =>
    (await pool.query(`SELECT "remainingQty" FROM lots WHERE "itemId" = $1 AND "lotNumber" = $2`, [item.id, lotNumber]))
      .rows[0].remainingQty;

  // Counted 8 of 16 — the 8 missing come out of the soon-to-expire lot first.
  const res = await request.post(`/api/items/${item.id}/adjust`, {
    data: { stockCount: true, shelfCount: 8 },
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  expect(await remaining(`SOON-${uniqueCode}`)).toBe(0);
  expect(await remaining(`LATE-${uniqueCode}`)).toBe(8);
  expect((await countState(item.id)).availableQty, "count must survive the lot resync").toBe(8);

  const adj = await lastAdjustment(item.id);
  expect(adj.reason).toBe("LOST");
  expect(adj.delta).toBe(-8);

  // Recovering an item-level loss puts the qty back on a lot, not beside them.
  const rec = await request.post(`/api/items/${item.id}/recover-loss`, {
    data: { source: "ADJUSTMENT", recordId: adj.id },
  });
  expect(rec.ok(), await rec.text()).toBeTruthy();
  expect((await countState(item.id)).availableQty).toBe(16);
});

test("tracked item count is a confirmation, not a qty write", async ({ request, uniqueCode }) => {
  const tracked = await makeTracked(request, uniqueCode);
  const before = await countState(tracked.id);

  // Without the count flag a tracked item still refuses a blind shelf count.
  const blind = await request.post(`/api/items/${tracked.id}/adjust`, {
    data: { shelfCount: 1, reason: "OTHER" },
  });
  expect(blind.status()).toBe(400);

  const res = await request.post(`/api/items/${tracked.id}/adjust`, { data: { stockCount: true } });
  expect(res.ok(), await res.text()).toBeTruthy();

  const after = await countState(tracked.id);
  expect(after.availableQty).toBe(before.availableQty);
  expect(after.lastCountDate).toBeTruthy();
  expect(monthsBetween(new Date(after.lastCountDate), new Date(after.nextCountDate))).toBe(12);
  expect(await lastAdjustment(tracked.id)).toBeNull();
});

test("changing the count cycle re-dates the next count from the last one", async ({ request, uniqueCode }) => {
  const tracked = await makeTracked(request, uniqueCode);
  await request.post(`/api/items/${tracked.id}/adjust`, { data: { stockCount: true } });

  const put = await request.put(`/api/settings/items/${tracked.id}`, { data: { countCycleMonths: 6 } });
  expect(put.ok(), await put.text()).toBeTruthy();

  const after = await countState(tracked.id);
  expect(monthsBetween(new Date(after.lastCountDate), new Date(after.nextCountDate))).toBe(6);
});

test("finishing a repair schedules the next maintenance a cycle later", async ({ request, uniqueCode }) => {
  const tracked = await makeTracked(request, uniqueCode);
  const performedAt = "2026-03-10";

  const res = await request.post(`/api/items/${tracked.id}/maintenance`, {
    data: {
      type: "CORRECTIVE",
      result: "AVAILABLE",
      performedAt,
      issue: "มอเตอร์ไม่หมุน",
      attachmentUrls: [],
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  const { rows } = await pool.query(
    `SELECT "lastMaintenanceDate", "nextMaintenanceDate", "maintenanceCycleMonths" FROM items WHERE id = $1`,
    [tracked.id]
  );
  const item = rows[0];
  expect(item.nextMaintenanceDate).toBeTruthy();
  expect(monthsBetween(new Date(item.lastMaintenanceDate), new Date(item.nextMaintenanceDate))).toBe(
    item.maintenanceCycleMonths
  );
});
