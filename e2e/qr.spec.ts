import { test, expect, pool } from "./fixtures";

test("item detail renders QR + print dialog opens", async ({ page }) => {
  const row = (await pool.query(`SELECT id, code FROM items LIMIT 1`)).rows[0];
  await page.goto(`/items/${row.id}`);

  // QR code image is generated client-side and shown.
  await expect(page.locator('img[alt^="QR for"]')).toBeVisible({ timeout: 15_000 });

  // Open the print dialog.
  await page.getByRole("button", { name: /พิมพ์/ }).click();
  // dialog surfaced a printable preview (look for the item code inside it).
  await expect(page.getByText(row.code).first()).toBeVisible({ timeout: 5_000 });
});
