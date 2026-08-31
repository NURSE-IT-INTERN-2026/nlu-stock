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

test("borrower may ยืมเอง but nothing else", async ({ request }) => {
  // Not on any allowlist — orgCode is what earns the role, exactly as CMU's claim would.
  const login = await request.post("/api/auth/login", {
    data: { email: "student@cmu.ac.th", orgCode: "12", accountType: "StudentAccount" },
  });
  expect(login.status()).toBe(200);
  // ยืมเอง passes the guard (422 = the body failed validation, not the role check).
  expect((await request.post("/api/borrow", { data: {} })).status()).toBe(422);
  // ...and a loan with no ใช้ใน is refused by the server, not only by the dialog.
  expect((await request.post("/api/borrow", { data: { itemId: "x", usageType: "COURSE" } })).status()).toBe(422);
  // กำหนดคืน arrives as a day count and is bounded there — a hand-rolled request cannot
  // file a loan due years out.
  expect((await request.post("/api/borrow", {
    data: { itemId: "x", usageType: "OTHER", usageNote: "เทส", days: 9999 },
  })).status()).toBe(422);
  // Every other write, including the staff เบิก screen a borrower must never reach.
  expect((await request.post("/api/dispense", { data: { items: [] } })).status()).toBe(403);
  expect((await request.post("/api/returns", { data: {} })).status()).toBe(403);
  expect((await request.post("/api/receive", { data: {} })).status()).toBe(403);
});

test("a graduate cannot sign in on a faculty org alone", async ({ request }) => {
  // The one case org matching cannot catch: alumni keep the faculty they left.
  const login = await request.post("/api/auth/login", {
    data: {
      email: "alumni@cmu.ac.th",
      orgCode: "12",
      orgName: "คณะพยาบาลศาสตร์",
      accountType: "AlumniAccount",
    },
  });
  expect(login.status()).toBe(403);
});

test("borrower is penned to /items", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "ผู้ยืม (นศ.)" }).click();
  await expect(page).toHaveURL(/\/items/);
  // Every other page bounces back rather than rendering a shell they cannot use.
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/items/);
});
