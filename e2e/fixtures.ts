import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Look up a seeded item's live DB counters. */
export async function dbItem(code: string) {
  const { rows } = await pool.query(
    `SELECT id, "availableQty", "totalQty", "trackIndividually" FROM items WHERE code = $1`,
    [code]
  );
  return rows[0] ?? null;
}

/** First sub-item id (AVAILABLE) for an individually-tracked item. */
export async function dbAvailableSubItem(itemId: string) {
  const { rows } = await pool.query(
    `SELECT id, "subCode" FROM sub_items WHERE "itemId" = $1 AND status = 'AVAILABLE' ORDER BY "subCode" LIMIT 1`,
    [itemId]
  );
  return rows[0] ?? null;
}

/** First open lot id + remainingQty for a consumable item. */
export async function dbFirstLot(itemId: string) {
  const { rows } = await pool.query(
    `SELECT id, "lotNumber", "remainingQty" FROM lots WHERE "itemId" = $1 AND "remainingQty" > 0 ORDER BY "expiryDate" NULLS LAST LIMIT 1`,
    [itemId]
  );
  return rows[0] ?? null;
}

/** Find a seeded item by category-profile code. */
async function findByProfile(
  code: string,
  extra = ""
) {
  const { rows } = await pool.query(
    `SELECT i.id, i.code, i."availableQty", i."totalQty"
       FROM items i
       JOIN categories c ON c.id = i."categoryId"
       JOIN category_profiles p ON p.id = c."profileId"
      WHERE p.code = $1 AND i."isActive" = true ${extra}
      LIMIT 1`,
    [code]
  );
  return rows[0] ?? null;
}

export const findConsumable = () => findByProfile("CON");
export const findCount = () => findByProfile("DUR", `AND i."availableQty" > 0`);
export async function findTracked() {
  const item = await findByProfile("KRU");
  if (!item) return null;
  const sub = await dbAvailableSubItem(item.id);
  return sub ? { ...item, subId: sub.id, subCode: sub.subCode } : null;
}

/**
 * Create a fresh individually-tracked item with N AVAILABLE sub-items.
 * Used by tracked tests so they don't fight over the same seeded sub-item
 * on the shared (reset-once-per-run) DB.
 */
export async function makeTracked(
  request: APIRequestContext,
  code: string,
  copyCount = 3
) {
  const cat = (
    await pool.query(
      `SELECT c.id FROM categories c JOIN category_profiles p ON c."profileId" = p.id WHERE p.code = 'KRU' LIMIT 1`
    )
  ).rows[0];
  const unit = (await pool.query(`SELECT id FROM units LIMIT 1`)).rows[0];
  const res = await request.post("/api/items/quick-create", {
    data: {
      code,
      name: `E2E ${code}`,
      categoryId: cat.id,
      issueUnitId: unit.id,
      copyCount,
      setSize: 1,
      initialQty: 0,
    },
  });
  if (!res.ok()) throw new Error(`makeTracked failed: ${res.status()}`);
  const item = await res.json();
  const sub = await dbAvailableSubItem(item.id);
  return { id: item.id, code: item.code, subId: sub.id, subCode: sub.subCode };
}

/** Receive stock into an item (creates/updates a lot for consumables). */
export async function receive(
  request: APIRequestContext,
  itemId: string,
  quantity: number,
  lotNumber?: string
) {
  return request.post("/api/receive", {
    data: {
      items: [
        {
          itemId,
          quantity,
          lotNumber: lotNumber ?? `E2E-LOT-${Date.now()}`,
          expiryDate: null,
        },
      ],
      notes: null,
    },
  });
}

/** POST to the app API as the seeded admin (uses storageState session cookie). */
export async function apiPost(
  request: APIRequestContext,
  path: string,
  body: unknown
) {
  return request.post(path, { data: body });
}

export const test = base.extend<{
  /** unique item code per test — avoids collisions on the shared seeded DB. */
  uniqueCode: string;
}>({
  uniqueCode: async ({}, use) => {
    const code = `E2E-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    await use(code);
  },
});

export { expect, pool };
