---
target: dashboard page
total_score: 25
p0_count: 0
p1_count: 1
timestamp: 2026-06-08T05-32-47Z
slug: src-app-dashboard-page-tsx
---
# Dashboard Critique

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeleton loading and error retry work well. No real-time refresh indicator. |
| 2 | Match System / Real World | 3 | Thai interface overall. Chart titles still in English, breaks flow for Thai-only users. |
| 3 | User Control and Freedom | 3 | Metric cards link to filtered views, table rows link to items. No date range control on charts. |
| 4 | Consistency and Standards | 3 | Design tokens used consistently after fixes. Language mixing (EN chart titles, TH everything else). |
| 5 | Error Prevention | 2 | Read-only dashboard limits error surface. No input validation needed but no data staleness indicator. |
| 6 | Recognition Rather Than Recall | 3 | All metrics visible, navigation persistent. Charts could benefit from better labeling. |
| 7 | Flexibility and Efficiency | 2 | Keyboard nav works on cards/tables. No shortcuts, no date filtering, no drill-down from charts. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean layout, purposeful elements. Status Overview section feels cramped at 1/4 width. |
| 9 | Error Recovery | 2 | Soft retry works. Generic error message, no detail about what failed or which API. |
| 10 | Help and Documentation | 1 | No help, tooltips, or contextual guidance beyond empty states. |
| **Total** | | **25/40** | **Acceptable** |

## Anti-Patterns Verdict

**Pass.** No AI slop tells detected. Design is functional and restrained: no gradient text, no glassmorphism, no side-stripe borders, no hero-metric template, no uppercase eyebrows. Metric cards are compact and purposeful, not oversized SaaS cliches. Color palette uses custom OKLCH tokens with semantic meaning. Clean build.

**Deterministic scan**: 0 findings across 12 dashboard component files.

## Overall Impression

A functional, well-structured stock management dashboard that does its job without visual noise. The harden/polish/colorize passes fixed real accessibility and consistency issues. The remaining gaps are about depth, not surface: language mixing, lack of interactive controls on charts, and missing guidance for new users. The biggest opportunity is deciding whether this dashboard speaks Thai or English, and committing fully.

## What's Working

1. **Skeleton loading states** — Every chart and widget has custom ghost skeletons that match the real layout. Not generic spinners. Shows care for perceived performance.
2. **Alert metric cards** — Compact, clickable, semantic colors (orange/info/danger), keyboard accessible, link to filtered views. Purposeful and efficient.
3. **Responsive table design** — Progressive column hiding (`hidden sm:table-cell`, `hidden md:table-cell`) with `overflow-x-auto`. Tables work on mobile without breaking.
4. **Empty states with teaching** — Thai-language empty states explain what will appear when data exists ("ข้อมูลจะแสดงเมื่อมีการเบิกครั้งแรก"). Not just "No data".

## Priority Issues

### [P1] Language inconsistency: chart titles English, rest Thai
- **Why it matters**: Chart titles say "Top Dispensed This Month" and "Usage by Type This Month" while everything else (greeting, metric cards, empty states, navigation) is Thai. Thai-only users may not understand the chart titles. Creates cognitive friction.
- **Fix**: Translate chart titles to Thai. "Top Dispensed This Month" → "รายการเบิกมากที่สุดเดือนนี้", "Usage by Type This Month" → "สัดส่วนการใช้งานเดือนนี้", "Recent Dispense" → "รายการเบิกล่าสุด", "Recent Receive" → "รายการรับเข้าล่าสุด", "Status Overview" → "สถานะภาพรวม".
- **Suggested command**: `/impeccable clarify`

### [P2] Status Overview cramped at 1/4 width
- **Why it matters**: The pie chart is 160px tall with a 2-column legend squeezed into `lg:col-span-1`. At narrow widths the legend items truncate. The pie chart becomes visually insignificant.
- **Fix**: Consider swapping the layout to give Status Overview more space (e.g., `lg:grid-cols-3` with tables taking 2 cols and status taking 1), or make the widget collapsible/expandable.
- **Suggested command**: `/impeccable layout`

### [P2] No data freshness indicator
- **Why it matters**: Dashboard shows "this month" data but users can't tell how stale it is. No "last updated" timestamp, no auto-refresh, no manual refresh button. Users may make decisions on cached data.
- **Fix**: Add a subtle "อัปเดตล่าสุด: [timestamp]" indicator near the greeting or at the top of the dashboard.
- **Suggested command**: `/impeccable harden`

### [P2] Greeting uses em dash
- **Why it matters**: The greeting says "สวัสดีตอนเช้า, ชื่อ — นี่คือสถานะสต๊อกล่าสุดประจำวันนี้". The em dash (—) is an English punctuation convention that feels out of place in Thai copy. The absolute bans also prohibit em dashes.
- **Fix**: Replace em dash with natural Thai connector or restructure: "สวัสดีตอนเช้า, ชื่อ สถานะสต๊อกล่าสุดประจำวันนี้" or use a period.
- **Suggested command**: `/impeccable clarify`

### [P3] No tooltips or contextual help
- **Why it matters**: Metric cards show "below min threshold", "expiring within 90 days", "past due date" as subtitles. New users may not know what "min threshold" means or what actions to take. No tooltips explain these concepts.
- **Fix**: Add tooltips on metric card titles or icons with brief explanations. "Low Stock: จำนวนคงเหลือต่ำกว่าจุดสั่งซื้อขั้นต่ำ" etc.
- **Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Alex (Power User)**:
- No date range picker on charts. Stuck viewing "this month" only. Alex wants to compare months or pick custom ranges.
- No drill-down from chart bars. Clicking a bar in "Top Dispensed" should show that item's history. Currently does nothing.
- Table pagination at 5 per page means lots of clicking. No option to show more rows.
- No keyboard shortcut to jump between dashboard sections.

**Sam (Accessibility)**:
- Recharts tooltips are mouse-only. Screen readers cannot access hover data on chart bars/pie slices.
- No skip-link to jump past navigation to main content.
- Chart `aria-label` provides summary text but no structured data table alternative for screen readers.

## Minor Observations

- Dashboard greeting shows time-based greeting but no actual date. Users may appreciate seeing today's date.
- "All clear" text when metric value is 0 is English. Should be "ปกติ" or "ไม่มี" in Thai.
- The `DashboardSkeleton` component (used in `DashboardTables`) has a `md:grid-cols-2` layout that doesn't match the actual table grid structure. Cosmetic only.

## Questions to Consider

- Should the dashboard commit fully to Thai, or is mixed EN/TH intentional (e.g., staff who read both)?
- Would a "last updated" timestamp reduce anxiety about data freshness?
- What if the Status Overview were a full-width section above the tables instead of a squeezed sidebar widget?
