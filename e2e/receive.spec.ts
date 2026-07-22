import { test, expect, pool, findConsumable, receive } from "./fixtures";
import { autoLotNumber } from "../src/lib/lot-code";

type Req = import("@playwright/test").APIRequestContext;

/** Receive with no lot number at all — the "ไม่มีเลขล็อต" path the form now allows. */
const receiveNoLot = (req: Req, itemId: string, quantity: number, expiryDate: string | null = null) =>
  req.post("/api/receive", {
    data: { items: [{ itemId, quantity, lotNumber: null, expiryDate }], notes: null },
  });

const lotsOf = async (itemId: string, lotNumber: string) =>
  (
    await pool.query(
      `SELECT "remainingQty", "receivedQty" FROM lots WHERE "itemId" = $1 AND "lotNumber" = $2`,
      [itemId, lotNumber]
    )
  ).rows[0] ?? null;

const countLotsOf = async (itemId: string) =>
  Number((await pool.query(`SELECT count(*)::int AS n FROM lots WHERE "itemId" = $1`, [itemId])).rows[0].n);

const qtyOf = async (itemId: string) =>
  (await pool.query(`SELECT "availableQty", "totalQty" FROM items WHERE id = $1`, [itemId])).rows[0];

/** Fresh lot-less consumable — the state most imported items are in. */
async function freshConsumable(request: Req, code: string, initialQty: number) {
  const cat = (await pool.query(
    `SELECT c.id FROM categories c JOIN category_profiles p ON p.id = c."profileId"
      WHERE p."dispenseType" = 'CONSUMABLE' LIMIT 1`
  )).rows[0];
  const unit = (await pool.query(`SELECT id FROM units LIMIT 1`)).rows[0];
  const created = await request.post("/api/items/quick-create", {
    data: { code, name: `E2E ${code}`, categoryId: cat.id, issueUnitId: unit.id, copyCount: 1, setSize: 1, initialQty },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const item = await created.json();
  expect(await countLotsOf(item.id), "fresh consumable should start lot-less").toBe(0);
  return item;
}

test("receive creates a lot and increments item counters", async ({ request }) => {
  const item = await findConsumable();
  expect(item, "no seeded CON item").toBeTruthy();

  const before = (
    await pool.query(`SELECT "availableQty", "totalQty" FROM items WHERE id = $1`, [item.id])
  ).rows[0];

  const lotNumber = `MFR-${Date.now()}`;
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

test("receive with no lot number creates no lot at all", async ({ request, uniqueCode }) => {
  // Nothing to hold: no typed lot, no expiry, no existing lots → availableQty is the
  // whole story and the lot machinery stays out of it.
  const item = await freshConsumable(request, uniqueCode, 9);

  const res = await receiveNoLot(request, item.id, 7);
  expect(res.ok(), await res.text()).toBeTruthy();

  expect(await countLotsOf(item.id), "lot-less receive must not create a lot").toBe(0);
  const after = await qtyOf(item.id);
  expect(after.availableQty).toBe(16);
  expect(after.totalQty).toBe(16);
});

test("an expiry date is enough to open a lot on a lot-less item", async ({ request, uniqueCode }) => {
  const item = await freshConsumable(request, uniqueCode, 4);
  const today = autoLotNumber(new Date());

  expect((await receiveNoLot(request, item.id, 6, "2027-03-31")).ok()).toBeTruthy();

  const dated = await lotsOf(item.id, today);
  expect(dated, `expected auto lot ${today}`).toBeTruthy();
  expect(dated.receivedQty).toBe(6);
  // The pre-lot balance is parked so the recompute can't drop it (ADR-0002).
  expect((await lotsOf(item.id, "OPENING"))?.remainingQty).toBe(4);
  expect((await qtyOf(item.id)).availableQty).toBe(10);
});

test("once an item tracks lots, lot-less receives keep landing in the day's lot", async ({ request, uniqueCode }) => {
  // lotCount > 0 means availableQty is synced from SUM(lots) — stock received outside
  // a lot would vanish at the next recompute, so the auto date code still applies.
  const item = await freshConsumable(request, uniqueCode, 5);
  const today = autoLotNumber(new Date());
  expect((await receive(request, item.id, 3, `MFR-${Date.now()}`)).ok()).toBeTruthy();
  const afterFirst = await countLotsOf(item.id);

  expect((await receiveNoLot(request, item.id, 4)).ok()).toBeTruthy();
  expect((await receiveNoLot(request, item.id, 6)).ok()).toBeTruthy();

  // Both lot-less receives merged into today's lot — exactly one new lot appeared.
  expect(await countLotsOf(item.id)).toBe(afterFirst + 1);
  expect((await lotsOf(item.id, today)).receivedQty).toBe(10);
  expect((await qtyOf(item.id)).availableQty).toBe(18);
});

test("same-day receive with a different expiry splits into -2 instead of failing", async ({ request, uniqueCode }) => {
  const item = await freshConsumable(request, uniqueCode, 0);
  const today = autoLotNumber(new Date());

  const first = await receiveNoLot(request, item.id, 3, "2027-01-31");
  expect(first.ok(), await first.text()).toBeTruthy();

  // Different expiry can't merge (would corrupt FEFO) — and the user can't retype the
  // auto code, so the server splits the day instead of erroring.
  const second = await receiveNoLot(request, item.id, 5, "2028-06-30");
  expect(second.ok(), await second.text()).toBeTruthy();

  const split = await lotsOf(item.id, `${today}-2`);
  expect(split, `expected split lot ${today}-2`).toBeTruthy();
  expect(split.receivedQty).toBe(5);
});

test("first lot on a lot-less consumable carries the old balance over", async ({ request, uniqueCode }) => {
  // A consumable whose stock has only ever lived in availableQty (the state most
  // imported items are in) must not lose it when its first lot appears.
  const item = await freshConsumable(request, uniqueCode, 14);

  expect((await receive(request, item.id, 6, `MFR-${Date.now()}`)).ok()).toBeTruthy();

  const opening = await lotsOf(item.id, "OPENING");
  expect(opening, "opening balance lot not created").toBeTruthy();
  expect(opening.remainingQty).toBe(14);

  // availableQty and SUM(lots) now agree — a recompute can't drop the old 14.
  const state = (await pool.query(
    `SELECT i."availableQty", (SELECT COALESCE(SUM(l."remainingQty"),0) FROM lots l WHERE l."itemId" = i.id)::int AS lotsum
       FROM items i WHERE i.id = $1`,
    [item.id]
  )).rows[0];
  expect(state.availableQty).toBe(20);
  expect(state.lotsum).toBe(20);
});
