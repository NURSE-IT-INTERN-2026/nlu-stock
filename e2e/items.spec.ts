import { test, expect, pool, uniqueCode } from "./fixtures";

async function lookupIds(profile: string) {
  const cat = (
    await pool.query(
      `SELECT c.id FROM categories c JOIN category_profiles p ON c."profileId" = p.id WHERE p.code = $1 LIMIT 1`,
      [profile]
    )
  ).rows[0];
  const unit = (await pool.query(`SELECT id FROM units LIMIT 1`)).rows[0];
  return { categoryId: cat.id, unitId: unit.id };
}

test("quick-create wizard: item + counters persisted", async ({ request, uniqueCode }) => {
  const { categoryId, unitId } = await lookupIds("CON");

  const res = await request.post("/api/items/quick-create", {
    data: {
      code: uniqueCode,
      name: `E2E ${uniqueCode}`,
      categoryId,
      issueUnitId: unitId,
      copyCount: 1,
      setSize: 1,
      initialQty: 12,
    },
  });
  expect(res.ok()).toBeTruthy();
  const created = await res.json();
  expect(created.code).toBe(uniqueCode);

  const row = (
    await pool.query(
      `SELECT "availableQty", "totalQty", "trackIndividually" FROM items WHERE code = $1`,
      [uniqueCode]
    )
  ).rows[0];
  expect(row, "item not persisted").toBeTruthy();
  expect(row.trackIndividually).toBe(false); // CON profile → not individually tracked
  expect(row.totalQty).toBe(12);
  expect(row.availableQty).toBe(12);
});

test("item detail GET returns relations", async ({ request }) => {
  const row = (
    await pool.query(`SELECT id FROM items ORDER BY "createdAt" LIMIT 1`)
  ).rows[0];
  const res = await request.get(`/api/items/${row.id}`);
  expect(res.ok()).toBeTruthy();
  const item = await res.json();
  expect(item.id).toBe(row.id);
  // relations included
  expect(item.category).toBeTruthy();
  expect(Array.isArray(item.lots)).toBe(true);
  expect(Array.isArray(item.subItems)).toBe(true);
});
