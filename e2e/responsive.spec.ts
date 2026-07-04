import { test, expect } from "./fixtures";

// Responsive audit guard — runs across the mobile→desktop viewport projects
// declared in playwright.config.ts (mobile-320 / mobile-375 / tablet-768 / desktop-1024).
// For every key page it asserts the document does not scroll horizontally, which is
// the most common symptom of a layout that breaks at narrow widths.

const PAGES: { path: string; name: string; selector?: string }[] = [
  { path: "/", name: "dashboard" },
  { path: "/items", name: "items" },
  { path: "/dispense", name: "dispense" },
  { path: "/receive", name: "receive" },
  { path: "/alerts", name: "alerts" },
  { path: "/maintenance", name: "maintenance" },
  { path: "/reports", name: "reports" },
  // Dispense-history rows come from unseeded Math.random data, so scope the
  // snapshot to the filter/export card — the layout we actually rebalanced.
  // All report tabs mount a filters card, so match the visible (active) one.
  { path: "/reports?tab=dispense-history", name: "reports-dispense-history", selector: '[data-testid="report-filters"]:visible' },
  { path: "/settings", name: "settings" },
];

for (const { path, name } of PAGES) {
  test(`no horizontal overflow: ${name}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    // The document root must not be wider than the viewport (allow 1px rounding).
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow, `${name} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
  });
}

// ── Touch-target size (WCAG 2.5.8 AA — Target Size (Minimum) = 24×24 CSS px) ──
// Every visible, enabled button presents at least a 24×24 hit area. We measure
// `button` / `[role=button]` only: native checkbox/radio controls extend their
// tap area via an `::after` pseudo-element (see ui/checkbox) that a bounding-box
// read can't see, and they fall under the spec's user-agent / spacing exception.
const MIN_TAP = 24;

for (const { path, name } of PAGES) {
  test(`touch targets ≥ ${MIN_TAP}px: ${name}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const offenders = await page.evaluate((min) => {
      const sel = 'button, [role="button"]';
      const out: { label: string; w: number; h: number }[] = [];
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const node = el as HTMLElement;
        if ((node as HTMLButtonElement).disabled) continue;
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") continue;
        const r = node.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue; // not rendered
        if (r.width < min || r.height < min) {
          const label = (node.getAttribute("aria-label") || node.textContent || node.getAttribute("name") || node.className || "?")
            .trim()
            .slice(0, 40);
          out.push({ label, w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
      return out;
    }, MIN_TAP);

    expect(
      offenders,
      `${name}: ${offenders.length} tap target(s) under ${MIN_TAP}px → ${JSON.stringify(offenders)}`
    ).toEqual([]);
  });
}

// ── Visual snapshots (one baseline per page × per viewport project) ──────────
// Playwright names snapshots per project, so a single test yields a 320 / 375 /
// 768 / 1024 baseline each. The seed uses unseeded Math.random (expiry dates,
// dispense counts) and picsum cover images, so we mask every img / svg / canvas
// and the greeting + "อัปเดตล่าสุด" timestamp — what remains is pure layout,
// which is what a responsive regression guard should watch.
for (const { path, name, selector } of PAGES) {
  test(`visual: ${name}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const mask = [
      page.locator("img"),
      page.locator("svg"),
      page.locator("canvas"),
      page.locator("h1"),
      page.getByText(/อัปเดตล่าสุด/),
    ];

    // A per-page selector scopes the snapshot to a stable region (used where the
    // rest of the page renders unseeded random data that would flake). The scoped
    // region here holds only static filter controls, so it needs no masking.
    if (selector) {
      const el = page.locator(selector).first();
      await el.waitFor({ state: "visible" });
      const buf = await el.screenshot({ animations: "disabled" });
      expect(buf).toMatchSnapshot(`${name}.png`, { maxDiffPixelRatio: 0.02 });
      return;
    }

    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      mask,
    });
  });
}
