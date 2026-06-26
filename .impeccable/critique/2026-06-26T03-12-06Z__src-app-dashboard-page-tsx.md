---
target: src/app/(dashboard)/page.tsx (dashboard home)
total_score: 27
p0_count: 0
p1_count: 1
timestamp: 2026-06-26T03-12-06Z
slug: src-app-dashboard-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "อัปเดตล่าสุด" shows device wall-clock, not data-last-fetched — can mislead on stale cache |
| 2 | Match System / Real World | 3 | Thai-fluent; minor "ประเภทพัสดุ / Profile" term mixing |
| 3 | User Control and Freedom | 3 | Metric tiles = one-tap escape to filtered lists; no undo/breadcrumbs |
| 4 | Consistency and Standards | 2 | Thai/English split + semantic-vs-raw palette + inconsistent status-foreground tokens |
| 5 | Error Prevention | 3 | Dispense clamps qty / disables atMax; read-only dashboard has few error paths |
| 6 | Recognition Rather Than Recall | 3 | Clickable metric shortcuts + always-visible nav; chart legend leans on color |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts, no bulk add, no command palette — click-only taxes daily staff |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained, one accent; profile widget adds nested-card noise |
| 9 | Error Recovery | 3 | Error+retry on charts; toasts are English/generic |
| 10 | Help and Documentation | 2 | No tooltips/onboarding/first-run help beyond empty-state text |
| **Total** | | **27/40** | **Acceptable (high) — nearly Good** |

## Anti-Patterns Verdict — PASS

**LLM assessment:** Not AI-generated. Cool clinic-neutral field (hue 264, not cream), single Sarabun family tuned by weight, tinted-destructive buttons, functional status-filter metric tiles (not the vanity hero-metric template), no gradient text / glassmorphism / section eyebrows / numbered scaffolding. The 4-up metric grid flirts with "identical card grid" but earns it — each tile is a distinct semantic-color status filter, not icon-heading-text filler. One genuine ban touch: the profile-summary widget renders bordered `bg-card` rows *inside* a Card (nested cards).

**Deterministic scan:** `detect.mjs` on `src/app/(dashboard)/page.tsx` + `src/components/dashboard/*` → **`[]`, exit 0 (clean)**. Detector caught nothing the review missed; no false positives.

**Visual overlays:** Browser automation is not available in this environment, so no live overlay was injected. Review is source-based (PRODUCT.md, DESIGN.md, dashboard page + all widgets, shared shell). Honest fallback — no overlay claim.

## Overall Impression

A genuinely well-built status dashboard that does the hardest thing right: the four metric tiles *are* the product — each is a one-tap path from "something needs attention" to "here's the list." Skeletons shaped like content, error+retry states, and a hand-rolled ChartContainer that kills recharts' width(-1) warning signal senior craft. What holds it back from "Good" isn't craft, it's **consistency and completeness**: the same concept (status, language, accent) is rendered three different ways across surfaces, and the most frequent users (daily staff) have no accelerators beyond clicking. Single biggest opportunity: **make trust literal** — a data-freshness timestamp and consistent status language would lift the whole surface.

## What's Working

1. **Status-first IA.** The metric row is the dashboard's value, not decoration: total / low-stock / near-expiry / on-loan, each color-coded with an icon and a one-click link to the filtered resolution. This is PRODUCT.md's "status always visible" realized correctly.
2. **State craftsmanship.** Loading = content-shaped skeletons (descending bar skeleton for the chart, row skeletons for the profile list); errors = message + "โหลดใหม่" retry. No lazy spinners-in-void, no dead error walls.
3. **Engineering rigor in service of polish.** `ChartContainer` replaces recharts' `ResponsiveContainer` with its own `ResizeObserver` specifically to silence the console warning — the kind of detail that separates shipped from demo.

## Priority Issues

**[P1] Consistency gaps undermine trust**
- **Why it matters:** The same idea looks different everywhere: sidebar is Thai, the mobile bottom-tab is English ("Home/Items/Alerts…"), action toasts are English ("Item out of stock"). Status badges use `text-warning-foreground` (dark, correct) in one place and `text-warning`/`text-success` (light, broken) in others. Accent uses semantic `primary` in buttons but raw `bg-orange-500` in the sidebar. A daily user builds a mental model; inconsistency forces them to re-decode the same affordance repeatedly — the definition of extraneous cognitive load.
- **Fix:** Pick one language (Thai) across every surface; standardize status-badge foregrounds to a dark-on-tint token per hue; route the sidebar active state through `bg-primary`. This is the audit's theming/systemic finding, now seen through the UX lens.
- **Suggested command:** `/impeccable harden`

**[P2] Status color fails at the exact moment clarity matters**
- **Why it matters:** The amber "ใกล้หมดอายุ" callout (`text-warning` on `bg-warning/5`, ~2.5:1) and tinted success/warning badges sit at the emotional valley — the moment a nurse sees something is wrong. Low contrast there means the warning is hardest to read precisely when it needs to be easiest.
- **Fix:** Dark-on-tint status foregrounds (contrast-compliant); verified via `scripts/contrast-check.mjs`.
- **Suggested command:** `/impeccable harden`

**[P2] No accelerators for the daily user**
- **Why it matters:** STAFF run this flow all day. Adding items is one-click-per-item with no bulk, no keyboard add, no command palette, no multi-scan. The QR scanner is the one good accelerator; everything else is pointer-only. This is the "Alex" failure — the power user has no fast path.
- **Fix:** Shape a power-user layer: `/` command palette, Enter-to-add in dispense search, scan-batch mode, keyboard qty steppers.
- **Suggested command:** `/impeccable shape`

**[P2] First-run / help is absent**
- **Why it matters:** Three roles (ADMIN/STAFF/INSTRUCTOR), institutional context, and the only guidance is empty-state one-liners. A new INSTRUCTOR requesting their first dispense gets no orientation; "Jordan" abandons.
- **Fix:** Lightweight first-run overlay or contextual tooltips on the dashboard's key affordances; task-focused, skippable.
- **Suggested command:** `/impeccable onboard`

**[P3] Nested-card pattern in profile-summary widget**
- **Why it matters:** Bordered `bg-card rounded-lg` rows inside an already-bordered Card — the one ban touch on the surface. Adds a second frame and visual noise where a divider or plain rows would carry the grouping.
- **Fix:** Drop the inner border/bg; use spacing + a single bottom divider per row, or a flat list.
- **Suggested command:** `/impeccable distill`

## Persona Red Flags

**Alex (Power User / daily STAFF):** No keyboard shortcuts anywhere — can't add-to-cart, clear filters, or jump sections from the keyboard. Dispense is strictly one-item-per-click with no bulk/multi-add. No command palette. The QR scanner is the sole accelerator. High click-tax on the single most-repeated workflow.

**Sam (Accessibility-dependent):** Focus-visible rings are consistently present (good). But the primary CTA fails WCAG AA contrast (white-on-orange 3.95); qty-stepper and icon buttons lack `aria-label`; status is partly color-only (status dots), though mostly paired with text; chart series rely on color with no pattern/label fallback. Screen-reader flow is functional but under-labeled.

**P'Oui — Staff Nurse (project-specific, STAFF role):** walks to the supply counter between rounds, ~30 seconds to check what's low or expiring. Glanceable counts (✓) and one-tap to the expiring list (✓). Red flag: "อัปเดตล่าสุด" shows the *device clock* updating every 60s, not when the data was actually fetched — so the timestamp can read "just now" while the cache is stale. Trust breaks at the exact second she decides to act on a low-stock count.

## Minor Observations

- Greeting `<h1>` contains the subtitle sentence ("นี่คือสถานะสต๊อกล่าสุดประจำวันนี้") inline — semantics; subtitle belongs outside the heading.
- Profile widget colors come from server-provided class strings (`r.color`) — dynamic, not tokenized; can't be themed centrally.
- Progress bars use `transition-all`, animating the `width` layout property.
- Dashboard has no explicit empty state for the chart when `data === []` (recharts renders blank) — Riley sees an unexplained empty chart.

## Questions to Consider

- Should "อัปเดตล่าสุด" show react-query's data-last-fetched instead of the wall clock? (trust)
- What's the power-user path the daily staff are begging for — keyboard add, scan-batch, or a `/` command palette?
- Does a first-run INSTRUCTOR need a 3-step orientation, or is the dashboard self-evident enough that empty-state text suffices?
- Could the metric tiles carry a trend indicator (vs last week) — more information without more clutter?
