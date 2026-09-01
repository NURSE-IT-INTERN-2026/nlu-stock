// The BDD runtime needs its fixtures on the test instance, so the chain starts from
// playwright-bdd's test (itself an extension of @playwright/test's base).
import { test as base } from "playwright-bdd";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import { withBase } from "../src/lib/base-path";

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
      initialQty: 0,
    },
  });
  if (!res.ok()) throw new Error(`makeTracked failed: ${res.status()}`);
  const item = await res.json();
  const sub = await dbAvailableSubItem(item.id);
  return { id: item.id, code: item.code, subId: sub.id, subCode: sub.subCode };
}

// Byte-stable names, not timestamps: the suite runs serially against a DB reset once per run,
// so a counter is unique enough — and unlike Date.now() it makes two runs produce the same
// rows, which is what the visual snapshots compare against.
let lotSeq = 0;

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
          lotNumber: lotNumber ?? `E2E-LOT-${String(++lotSeq).padStart(3, "0")}`,
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

/**
 * Playwright resolves a relative URL with `new URL(url, baseURL)`, and a leading slash
 * resolves against the ORIGIN — so "/api/items" against a baseURL of
 * http://host/nlu-stock drops the basePath and lands on a 404. Every spec writes
 * app-absolute paths, so prefix them here once instead of in ~70 call sites.
 * withBase() is the app's own helper and is idempotent, so a path that already carries
 * the prefix passes through.
 */
const REQUEST_METHODS = ["get", "post", "put", "patch", "delete", "head", "fetch"] as const;

function prefixRequest(ctx: APIRequestContext): APIRequestContext {
  for (const method of REQUEST_METHODS) {
    const original = ctx[method].bind(ctx);
    // @ts-expect-error same signature, only the url argument is rewritten
    ctx[method] = (url: string, options?: unknown) => original(withBase(url), options);
  }
  return ctx;
}

function prefixPage(page: Page): Page {
  const goto = page.goto.bind(page);
  page.goto = (url: string, options?: Parameters<Page["goto"]>[1]) => goto(withBase(url), options);
  prefixRequest(page.request);
  return page;
}

/* eslint-disable react-hooks/rules-of-hooks --
   `use` here is Playwright's fixture callback (hand the value to the test, then tear down),
   not React's. The rule only matches on the name. */
export const test = base.extend<{
  /** unique item code per test — avoids collisions on the shared seeded DB. */
  uniqueCode: string;
  /** หน้าเดียวกัน แต่ล็อกอินเป็น นศ./บุคลากร (BORROWER) — คนละ context กับ page ปกติที่เป็น
   *  SUPERADMIN ทั้ง suite. ใช้กับ ยืมเอง ผ่าน QR ซึ่งเป็นงานเดียวที่ staff ทำแทนไม่ได้. */
  borrowerPage: Page;
  /** shared mutable state for BDD steps — pass item code / subCode / qty between Given/When/Then */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a per-scenario bag by design
  bdd: Record<string, any>;
}>({
  bdd: async ({}, use) => {
    await use({});
  },
  page: async ({ page }, use) => {
    await use(prefixPage(page));
  },
  request: async ({ request }, use) => {
    await use(prefixRequest(request));
  },
  borrowerPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: "e2e/.auth/borrower.json" });
    const page = prefixPage(await ctx.newPage());
    await use(page);
    await ctx.close();
  },
  uniqueCode: async ({}, use, testInfo) => {
    // Derived from the test's own title, not the clock: same test → same code on every run.
    // Unique because no two tests share a title, and the DB is reset before each run.
    let h = 0x811c9dc5;
    for (const ch of testInfo.titlePath.join("/")) {
      h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    }
    await use(`E2E-${h.toString(36).toUpperCase().padStart(7, "0")}`);
  },
});

export { expect, pool };
