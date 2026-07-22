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

/** First active item of a profile, plus its current cycle. */
async function itemOfProfile(profileCode: string) {
  return (await pool.query(
    `SELECT i.id, i.code, i."maintenanceCycleMonths"
       FROM items i
       JOIN categories c ON c.id = i."categoryId"
       JOIN category_profiles p ON p.id = c."profileId"
      WHERE p.code = $1 AND i."isActive" = true
      LIMIT 1`,
    [profileCode]
  )).rows[0] ?? null;
}

const cycleOf = async (id: string) =>
  (await pool.query(`SELECT "maintenanceCycleMonths", "nextMaintenanceDate" FROM items WHERE id = $1`, [id])).rows[0];

test("วัสดุคงทน can set its own maintenance cycle", async ({ request }) => {
  const item = await itemOfProfile("DUR");
  expect(item, "no seeded DUR item").toBeTruthy();

  // Give it a baseline so the cycle change has something to re-date from.
  const performedAt = "2026-03-10";
  expect((await request.post(`/api/items/${item.id}/maintenance`, {
    data: { type: "CORRECTIVE", result: "AVAILABLE", performedAt, issue: "e2e", attachmentUrls: [] },
  })).ok()).toBeTruthy();

  const res = await request.put(`/api/settings/items/${item.id}`, { data: { maintenanceCycleMonths: 6 } });
  expect(res.ok(), await res.text()).toBeTruthy();

  const after = await cycleOf(item.id);
  expect(after.maintenanceCycleMonths).toBe(6);
  // Re-dated from the last maintenance, not left on the old 12-month cadence.
  expect(new Date(after.nextMaintenanceDate).getMonth()).toBe(8); // 2026-03 + 6 = 2026-09
});

test("consumables have no maintenance cycle to set", async ({ request }) => {
  const item = await itemOfProfile("CON");
  expect(item, "no seeded CON item").toBeTruthy();

  const res = await request.put(`/api/settings/items/${item.id}`, { data: { maintenanceCycleMonths: 6 } });
  expect(res.ok(), await res.text()).toBeTruthy();

  // Stripped by sanitizeItemByProfile — a consumable is used up, never serviced.
  expect((await cycleOf(item.id)).maintenanceCycleMonths).toBe(item.maintenanceCycleMonths);
});
