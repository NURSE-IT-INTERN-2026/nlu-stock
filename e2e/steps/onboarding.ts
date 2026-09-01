import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures";
import { BASE_PATH } from "../../src/lib/base-path";

const { Given, When, Then } = createBdd(test);

/** The project storageState is an admin session — login scenarios need it gone first. */
async function logout(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
}

Given("ฉันเปิดหน้า \\/login", async ({ page }) => {
  await logout(page);
  await page.goto("/login");
});

Given("อีเมลของผู้ดูแลระบบถูกตั้งสิทธิ์ไว้ล่วงหน้า", async () => {
  // seeded admin@nlu.ac.th is in ADMIN_EMAILS of the dev env — nothing to do.
});

When("ฉันกรอกอีเมลในช่อง {string} แล้วกดเข้าสู่ระบบ", async ({ page }, placeholder: string) => {
  // ตั้งค่า menu is SUPERADMIN-only, so the "ผู้ดูแลระบบ" the scenario means is superadmin.
  await page.getByPlaceholder(placeholder).fill("superadmin@nlu.ac.th");
  await page.getByRole("button", { name: "Sign In" }).click();
});

When("ฉันกรอกอีเมลที่ไม่อยู่ในรายชื่อแล้วกดเข้าสู่ระบบ", async ({ page }) => {
  await logout(page);
  await page.goto("/login");
  await page.getByPlaceholder("email@example.com").fill("outsider@nowhere.ac.th");
  await page.getByRole("button", { name: "Sign In" }).click();
});

Given("ฉันเข้าสู่ระบบด้วยบัญชีสิทธิ์ stockOnly", async ({ page }) => {
  // EXECUTIVE is the read/borrow role: no ตั้งค่า, no stock-management menus.
  await logout(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Executive", exact: true }).click();
  await page.waitForURL(new RegExp(`${BASE_PATH}/?$`));
});

Then("ฉันจะเห็นหน้าแดชบอร์ด", async ({ page }) => {
  await page.waitForURL(new RegExp(`${BASE_PATH}/?$`));
});

Then("ฉันจะเห็นเมนู {string} ในแถบข้าง", async ({ page }, label: string) => {
  await expect(page.getByRole("link", { name: label })).toBeVisible();
});

Then("ฉันจะไม่เห็นเมนู {string} ในแถบข้าง", async ({ page }, label: string) => {
  await expect(page.getByRole("link", { name: label })).toHaveCount(0);
});

Then(
  "ฉันจะเห็นข้อความว่าเข้าไม่ได้ และยังอยู่หน้า \\/login",
  async ({ page }) => {
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  }
);

Then("ฉันจะไม่เห็นเมนู {string} และ {string}", async ({ page }, a: string, b: string) => {
  await expect(page.getByRole("link", { name: a })).toHaveCount(0);
  await expect(page.getByRole("link", { name: b })).toHaveCount(0);
});
