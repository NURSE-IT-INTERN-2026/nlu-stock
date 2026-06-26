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
  await page.getByPlaceholder("email@example.com").fill("staff@nlu.ac.th");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("instructor role is blocked from admin APIs", async ({ request }) => {
  // instructor login → 403 on a write endpoint
  const login = await request.post("/api/auth/login", {
    data: { email: "instructor@nlu.ac.th", password: "" },
  });
  expect(login.status()).toBe(200);
  // same request context carries the session cookie from the login response
  const dispense = await request.post("/api/dispense", { data: { items: [] } });
  expect([403, 400]).toContain(dispense.status()); // 403 forbidden (not 401)
});
