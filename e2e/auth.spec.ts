import { test, expect } from "@playwright/test";

// Login spec starts with NO session cookie.
test.use({ storageState: { cookies: [], origins: [] } });

test("login (Admin quick button) → dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  // redirected to "/" dashboard, no longer on /login
  await expect(page).toHaveURL(/\/$/);
  await expect(page).not.toHaveURL(/\/login/);
});

test("login form (typed email) → dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("email@example.com").fill("admin@nlu.ac.th");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("an email on no allowlist cannot sign in", async ({ request }) => {
  const login = await request.post("/api/auth/login", {
    data: { email: "nobody@nlu.ac.th" },
  });
  expect(login.status()).toBe(403);
});

test("executive may เบิก but not touch stock", async ({ request }) => {
  const login = await request.post("/api/auth/login", {
    data: { email: "executive@nlu.ac.th" },
  });
  expect(login.status()).toBe(200);
  // same request context carries the session cookie from the login response.
  // เบิก passes the guard (400 = validation, not 403).
  const dispense = await request.post("/api/dispense", { data: { items: [] } });
  expect(dispense.status()).toBe(400);
  // รับคืน and รับเข้า are stock work — refused outright.
  expect((await request.post("/api/returns", { data: {} })).status()).toBe(403);
  expect((await request.post("/api/receive", { data: {} })).status()).toBe(403);
});
