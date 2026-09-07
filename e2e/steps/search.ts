import { createBdd } from "playwright-bdd";
import { test, expect, pool, dbHomeLocation } from "../fixtures";

const { When, Then } = createBdd(test);

/** First seeded consumable name — searched for and asserted visible. */
async function firstConsumableName() {
  const { rows } = await pool.query(
    `SELECT i.code, i.name FROM items i
      JOIN categories c ON c.id = i."categoryId"
      JOIN category_profiles p ON p.id = c."profileId"
     WHERE p.code = 'CON' AND i."isActive" = true AND i.name NOT LIKE 'E2E %' LIMIT 1`
  );
  return rows[0];
}

When("ฉันพิมพ์ชื่อรายการลงในช่อง {string}", async ({ page, bdd }, placeholder: string) => {
  const item = await firstConsumableName();
  bdd.item = item;
  // wait for the list's first load, then type and wait for the SEARCH request itself —
  // the baseline count grows during a run, so it can never be the hydration signal
  await expect(page.getByRole("row").first()).toBeVisible({ timeout: 15_000 });
  const box = page.getByPlaceholder(placeholder);
  const searched = page.waitForResponse(
    (r) => r.url().includes("/api/items") && r.url().includes("search="),
    { timeout: 15_000 }
  );
  await box.fill(item.name);
  expect((await searched).ok()).toBeTruthy();
});

Then("ฉันจะเห็นรายการที่ชื่อตรงในตาราง", async ({ page, bdd }) => {
  await expect(page.getByText(bdd.item.code, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
});

Then("เมื่อฉันกดที่แถวนั้น ฉันจะเห็นหน้ารายละเอียดของรายการ", async ({ page, bdd }) => {
  await page.getByText(bdd.item.code).first().click();
  await page.waitForURL(new RegExp(`/items/.+`));
});

// ─── Semantic search ───
// A cross-language pair on purpose: the query shares no substring with the item name, so
// the text-search fallback inside /api/items/search-ai cannot produce this hit. Seeing the
// item back is proof the pgvector path ran. Measured cosine ≈ 0.66, well over the route's
// 0.5 threshold.
const SEMANTIC_NAME = "เครื่องวัดความดันโลหิตแบบดิจิทัล";
const SEMANTIC_QUERY = "blood pressure monitor";

/** `prisma db seed` writes no vectors, so the search needs an item embedded first. */
async function waitForEmbedding(code: string, timeoutMs = 15_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const { rows } = await pool.query(
      `SELECT 1 FROM items WHERE code = $1 AND embedding IS NOT NULL`,
      [code]
    );
    if (rows.length) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

When(
  "ฉันค้นหาด้วยคำที่ไม่ใช่ชื่อจริงแต่ใกล้เคียงความหมาย",
  async ({ page, request, bdd, uniqueCode }) => {
    // quick-create is the only path that generates a vector, and the seed writes none —
    // without this the whole table is unembedded and similaritySearch can only return [].
    const cat = (
      await pool.query(
        `SELECT c.id FROM categories c JOIN category_profiles p ON c."profileId" = p.id WHERE p.code = 'CON' LIMIT 1`
      )
    ).rows[0];
    const unit = (await pool.query(`SELECT id FROM units LIMIT 1`)).rows[0];
    const res = await request.post("/api/items/quick-create", {
      data: {
        code: uniqueCode,
        name: SEMANTIC_NAME,
        categoryId: cat.id,
        issueUnitId: unit.id,
        initialQty: 1,
        locationId: await dbHomeLocation(),
      },
    });
    expect(res.ok()).toBeTruthy();
    bdd.code = uniqueCode;

    // embedItem is fire-and-forget and needs a Gemini key plus per-minute quota. No vector
    // means there is nothing to assert — a config/quota fact, not a regression.
    test.skip(
      !(await waitForEmbedding(uniqueCode)),
      "no embedding — GOOGLE_GENERATIVE_AI_API_KEY unset or Gemini quota exhausted"
    );

    // The similar-items panel in the เพิ่มรายการ wizard is the only AI-search surface.
    await page.goto("/settings?tab=items");
    await page.getByRole("button", { name: /^เพิ่มรายการ/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("ชื่อพัสดุ")).toBeVisible();
    // the field is debounced 500ms — wait for the search it fires, not for a timeout
    const searched = page.waitForResponse(
      (r) => r.url().includes("/api/items/search-ai"),
      { timeout: 20_000 }
    );
    await dialog.getByLabel("ชื่อพัสดุ").fill(SEMANTIC_QUERY);
    expect((await searched).ok()).toBeTruthy();
  }
);

Then("ฉันจะเห็นรายการที่เกี่ยวข้องขึ้นมาในผลค้นหา", async ({ page, bdd }) => {
  const dialog = page.getByRole("dialog");
  // หัวข้อนี้ขึ้นเฉพาะตอนผลมาจาก similarity จริง — ถ้าตกไป textSearch หัวข้อจะเปลี่ยนเป็น
  // "ค้นแบบเทียบชื่อ ไม่ใช่ AI" (step-item-details.tsx) เห็นอันนี้จึงแปลว่า pgvector ทำงาน
  await expect(dialog.getByText("พบพัสดุที่ชื่อคล้ายกัน")).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText(/ค้นแบบเทียบชื่อ/)).toHaveCount(0);
  await expect(dialog.getByText(bdd.code)).toBeVisible();
});
