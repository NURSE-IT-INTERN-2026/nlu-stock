import { test, expect, pool, findCount } from "./fixtures";

test("maintenance record updates item dates + status", async ({ request }) => {
  const item = await findCount();
  expect(item).toBeTruthy();

  const performedAt = new Date().toISOString();
  const next = new Date(Date.now() + 365 * 86400000).toISOString();

  const res = await request.post(`/api/items/${item.id}/maintenance`, {
    data: {
      type: "PREVENTIVE",
      result: "AVAILABLE",
      performedAt,
      cost: 250,
      issue: "e2e routine check",
      nextMaintenanceAt: next,
    },
  });
  expect(res.ok()).toBeTruthy();

  const rec = (
    await pool.query(
      `SELECT type, result, cost FROM maintenance_records WHERE "itemId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [item.id]
    )
  ).rows[0];
  expect(rec, "MaintenanceRecord not created").toBeTruthy();
  expect(rec.type).toBe("PREVENTIVE");
  expect(rec.cost).toBe(250);

  const itemRow = (
    await pool.query(
      `SELECT "lastMaintenanceDate", "nextMaintenanceDate", status FROM items WHERE id = $1`,
      [item.id]
    )
  ).rows[0];
  expect(itemRow.status).toBe("AVAILABLE");
  expect(itemRow.lastMaintenanceDate).toBeTruthy();
  expect(itemRow.nextMaintenanceDate).toBeTruthy();
});
