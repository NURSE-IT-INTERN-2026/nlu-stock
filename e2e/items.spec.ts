import { test, expect, pool } from "./fixtures";

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

// ── Cursor pagination (/api/items?mode=cursor) ──

type CursorItem = { id: string; categoryId: string };
type CursorResp = { items: CursorItem[]; nextCursor: string | null; total: number | null };

async function getCursor(request: import("@playwright/test").APIRequestContext, qs: string) {
  const res = await request.get(`/api/items?mode=cursor&${qs}`);
  expect(res.ok(), `cursor fetch failed: ${res.status()}`).toBeTruthy();
  return (await res.json()) as CursorResp;
}

test("cursor: first page (no cursor) returns count + bounded items", async ({ request }) => {
  const body = await getCursor(request, "limit=5");
  expect(body.items.length).toBeLessThanOrEqual(5);
  expect(typeof body.total).toBe("number"); // count present on first fetch
  // nextCursor iff exactly a full page came back
  expect(body.nextCursor === null ? body.items.length < 5 : body.items.length === 5).toBe(true);
});

test("cursor: next page appends with no overlap", async ({ request }) => {
  const first = await getCursor(request, "limit=5");
  test.skip(!first.nextCursor, "seeded DB has <=5 items — nothing to page");
  const second = await getCursor(request, `limit=5&cursor=${first.nextCursor}`);
  const firstIds = new Set(first.items.map((i) => i.id));
  expect(second.items.every((i) => !firstIds.has(i.id))).toBe(true);
});

test("cursor: invalid cursor falls back to first page (not 400)", async ({ request }) => {
  const first = await getCursor(request, "limit=5");
  const body = await getCursor(request, "limit=5&cursor=does-not-exist");
  expect(body.items.map((i) => i.id)).toEqual(first.items.map((i) => i.id));
});

test("cursor: filter + cursor together", async ({ request }) => {
  const first = await getCursor(request, "limit=5");
  test.skip(first.items.length === 0, "no items to derive a filter from");
  const categoryId = first.items[0].categoryId;
  const body = await getCursor(request, `limit=5&categoryId=${categoryId}`);
  expect(body.items.every((i) => i.categoryId === categoryId)).toBe(true);
});

test("mobile: load-more appends items", async ({ page, request }) => {
  const probe = await getCursor(request, "limit=20");
  test.skip(!probe.nextCursor, "seeded DB has <=20 items — load-more not exercisable");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/items");

  const moreBtn = page.getByRole("button", { name: "โหลดเพิ่มเติม" });
  await expect(moreBtn).toBeVisible();
  const label = page.getByText(/แสดง \d+ จาก/);
  const shown = async () =>
    parseInt((await label.innerText()).match(/แสดง (\d+) จาก/)![1], 10);
  const before = await shown();

  await moreBtn.click();
  // appended → shown count strictly increases (filter-reset path is covered at API level)
  await expect.poll(shown, { timeout: 10_000 }).toBeGreaterThan(before);
});

test("desktop: numbered nav replaces via cursor walk", async ({ page, request }) => {
  const probe = await getCursor(request, "limit=20");
  test.skip(!probe.nextCursor, "seeded DB has <=20 items — only one page");

  // chromium project runs at desktop width → numbered pagination (not mobile load-more).
  await page.goto("/items");
  const btn2 = page.getByRole("button", { name: "2", exact: true });
  await expect(btn2).toBeVisible();
  await btn2.click();
  // page 2 became active — items replaced (not appended), proven by the active marker moving
  await expect(btn2).toHaveAttribute("aria-current", "page");
});
