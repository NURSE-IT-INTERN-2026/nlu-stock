import { test, expect } from "./fixtures";

for (const fmt of ["xlsx", "pdf"] as const) {
  test(`export ${fmt} returns a non-empty file`, async ({ request }) => {
    const res = await request.get(`/api/reports/export?type=stock-summary&format=${fmt}`);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`${fmt} export ${res.status()}: ${body.slice(0, 300)}`);
    }
    const ct = res.headers()["content-type"] || "";
    if (fmt === "xlsx") expect(ct).toContain("spreadsheet");
    else expect(ct).toContain("pdf");
    const body = await res.body();
    expect(body.length).toBeGreaterThan(0);
  });
}

test("export rejects unknown report type", async ({ request }) => {
  const res = await request.get(`/api/reports/export?type=bogus&format=xlsx`);
  expect(res.ok()).toBeFalsy();
});
