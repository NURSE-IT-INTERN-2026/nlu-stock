import { test, expect } from "./fixtures";

test("search-ai returns results via text fallback", async ({ request }) => {
  const res = await request.get("/api/items/search-ai?q=pen");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(Array.isArray(data.items)).toBe(true);
  if (data.items.length > 0) {
    expect(data.items[0]).toHaveProperty("code");
    expect(data.items[0]).toHaveProperty("name");
  }
});

// Semantic (Gemini) path only runs with a valid API key.
test("search-ai uses embeddings when Gemini key configured", async ({ request }) => {
  test.skip(
    !process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    "no GOOGLE_GENERATIVE_AI_API_KEY — skipping semantic path"
  );
  const res = await request.get("/api/items/search-ai?q=writing%20instrument");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(Array.isArray(data.items)).toBe(true);
});
