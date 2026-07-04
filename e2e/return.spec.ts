import { test, expect, pool, findCount, makeTracked } from "./fixtures";

type Req = import("@playwright/test").APIRequestContext;

const dispense = (request: Req, body: unknown) => request.post("/api/dispense", { data: body });
const returnLoan = (request: Req, body: unknown) => request.post("/api/returns", { data: body });
const returnCount = (request: Req, itemId: string, body: unknown) =>
  request.post(`/api/items/${itemId}/return`, { data: body });

async function dispenseIds(request: Req, body: unknown): Promise<string[]> {
  const res = await dispense(request, body);
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return json.ids as string[];
}

// ── Tracked (ITEM) returns ──────────────────────────────────────────────

test("return tracked → AVAILABLE: sub-item usable again + loan closed", async ({ request, uniqueCode }) => {
  const tracked = await makeTracked(request, uniqueCode);
  const [recordId] = await dispenseIds(request, {
    items: [{ itemId: tracked.id, subItemId: tracked.subId, quantity: 1 }],
  });

  const res = await returnLoan(request, {
    entries: [{ dispenseRecordId: recordId, subItemId: tracked.subId, status: "AVAILABLE" }],
  });
  expect(res.ok()).toBeTruthy();

  const sub = (await pool.query(`SELECT status FROM sub_items WHERE id = $1`, [tracked.subId])).rows[0];
  expect(sub.status).toBe("AVAILABLE");

  const rec = (await pool.query(`SELECT "returnedAt" FROM dispense_records WHERE id = $1`, [recordId])).rows[0];
  expect(rec.returnedAt).not.toBeNull();
});

test("return tracked → DAMAGED: sub-item under repair + repair draft opened", async ({ request, uniqueCode }) => {
  const tracked = await makeTracked(request, uniqueCode);
  const [recordId] = await dispenseIds(request, {
    items: [{ itemId: tracked.id, subItemId: tracked.subId, quantity: 1 }],
  });

  const res = await returnLoan(request, {
    entries: [
      { dispenseRecordId: recordId, subItemId: tracked.subId, status: "DAMAGED", photos: ["/uploads/e2e-proof.jpg"] },
    ],
  });
  expect(res.ok()).toBeTruthy();

  const sub = (await pool.query(`SELECT status FROM sub_items WHERE id = $1`, [tracked.subId])).rows[0];
  expect(sub.status).toBe("UNDER_REPAIR");

  const repair = (
    await pool.query(
      `SELECT type, result FROM maintenance_records WHERE "subItemId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [tracked.subId]
    )
  ).rows[0];
  expect(repair.type).toBe("CORRECTIVE");
  expect(repair.result).toBe("NEEDS_MORE_REPAIR");
});

// ── Count (COUNT) returns ───────────────────────────────────────────────

test("return count → AVAILABLE: partial then full closes the loan", async ({ request }) => {
  const item = await findCount();
  expect(item).toBeTruthy();

  const before = (await pool.query(`SELECT "availableQty" FROM items WHERE id = $1`, [item.id])).rows[0];
  const [recordId] = await dispenseIds(request, { items: [{ itemId: item.id, quantity: 4 }] });
  const afterDispense = (await pool.query(`SELECT "availableQty" FROM items WHERE id = $1`, [item.id])).rows[0];
  expect(afterDispense.availableQty).toBe(before.availableQty - 4);

  // return 1 of 4 — loan stays open
  let res = await returnCount(request, item.id, { dispenseRecordId: recordId, quantity: 1, status: "AVAILABLE" });
  expect(res.ok()).toBeTruthy();
  let rec = (await pool.query(`SELECT "resolvedQty", "returnedAt" FROM dispense_records WHERE id = $1`, [recordId])).rows[0];
  expect(rec.resolvedQty).toBe(1);
  expect(rec.returnedAt).toBeNull();

  // return remaining 3 — loan closes, stock fully restored
  res = await returnCount(request, item.id, { dispenseRecordId: recordId, quantity: 3, status: "AVAILABLE" });
  expect(res.ok()).toBeTruthy();
  rec = (await pool.query(`SELECT "resolvedQty", "returnedAt" FROM dispense_records WHERE id = $1`, [recordId])).rows[0];
  expect(rec.resolvedQty).toBe(4);
  expect(rec.returnedAt).not.toBeNull();

  const restored = (await pool.query(`SELECT "availableQty" FROM items WHERE id = $1`, [item.id])).rows[0];
  expect(restored.availableQty).toBe(before.availableQty);
});

test("return count → DAMAGED: writes off stock + opens a repair draft (no sub-item)", async ({ request }) => {
  const item = await findCount();
  expect(item).toBeTruthy();

  const before = (await pool.query(`SELECT "totalQty" FROM items WHERE id = $1`, [item.id])).rows[0];
  const [recordId] = await dispenseIds(request, { items: [{ itemId: item.id, quantity: 2 }] });

  const res = await returnCount(request, item.id, {
    dispenseRecordId: recordId,
    quantity: 2,
    status: "DAMAGED",
    proofUrls: ["/uploads/e2e-proof.jpg"],
  });
  expect(res.ok()).toBeTruthy();

  const after = (await pool.query(`SELECT "totalQty" FROM items WHERE id = $1`, [item.id])).rows[0];
  expect(after.totalQty).toBe(before.totalQty - 2);

  const adj = (
    await pool.query(
      `SELECT reason, delta FROM stock_adjustments WHERE "itemId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [item.id]
    )
  ).rows[0];
  expect(adj.reason).toBe("DAMAGED_PENDING_REPAIR");
  expect(adj.delta).toBe(-2);

  // Feature: count-based damage also surfaces on the maintenance/repair views.
  const repair = (
    await pool.query(
      `SELECT result, "subItemId" FROM maintenance_records WHERE "itemId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [item.id]
    )
  ).rows[0];
  expect(repair.result).toBe("NEEDS_MORE_REPAIR");
  expect(repair.subItemId).toBeNull();
});

test("return count → LOST: writes off stock as lost", async ({ request }) => {
  const item = await findCount();
  expect(item).toBeTruthy();

  const before = (await pool.query(`SELECT "totalQty" FROM items WHERE id = $1`, [item.id])).rows[0];
  const [recordId] = await dispenseIds(request, { items: [{ itemId: item.id, quantity: 1 }] });

  const res = await returnCount(request, item.id, {
    dispenseRecordId: recordId,
    quantity: 1,
    status: "LOST",
    proofUrls: ["/uploads/e2e-proof.jpg"],
  });
  expect(res.ok()).toBeTruthy();

  const after = (await pool.query(`SELECT "totalQty" FROM items WHERE id = $1`, [item.id])).rows[0];
  expect(after.totalQty).toBe(before.totalQty - 1);

  const adj = (
    await pool.query(
      `SELECT reason FROM stock_adjustments WHERE "itemId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [item.id]
    )
  ).rows[0];
  expect(adj.reason).toBe("LOST");
});
