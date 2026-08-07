# Ponytail Debt Ledger

Every deliberate `ponytail:` shortcut, ceiling, and revisit trigger in one place.

Generated: 2026-07-09 — **29 markers, 3 with trigger.**

Row format: `file:line — what was simplified. ceiling: <limit>. upgrade: <trigger>.`
`no-trigger` = names no revisit condition → silently rots.

---

## e2e/visual.spec.ts
- `:3` — stdlib `toHaveScreenshot` instead of percy/chromatic. ceiling: native playwright snapshot. upgrade: none. `no-trigger`

## scripts/contrast-check.mjs
- `:2` — self-contained, no deps; verify contrast claims instead of guessing. ceiling: zero-dep script. upgrade: none. `no-trigger`

## src/app/api/kits/route.ts
- `:75` — no lot tracking → single item-level availableQty adjustment. ceiling: no lots. upgrade: when lot-level tracking is needed.
- `:91` — decrement availableQty only, totalQty untouched (same pattern as dispense). ceiling: availableQty-only mutation. upgrade: none. `no-trigger`

## src/app/api/items/route.ts
- `:12` — dual-mode: cursor when client sends one (mobile load-more), offset otherwise. ceiling: cursor+offset coexist. upgrade: none. `no-trigger`
- `:158` — `take: limit+1` to know exactly whether more remain. ceiling: +1 probe. upgrade: none. `no-trigger`

## src/app/api/items/[id]/route.ts
- `:7` — mutate only fields this endpoint owns; settings PUT owns the rest. ceiling: field-scoped PUT. upgrade: none. `no-trigger`
- `:53` — include every BOM row (no take); kit BOMs are small, need count + full list in detail. ceiling: unpaginated BOM. upgrade: bump/take when BOMs grow large.

## src/app/api/items/[id]/return/route.ts
- `:59` — tracked counts derive from sub-item statuses; no StockAdjustment on write-off. ceiling: derived counts. upgrade: none. `no-trigger`

## src/app/api/reports/export/route.ts
- `:10` — inlined from `lib/export-utils`; sole consumer + report-specific Response builders. ceiling: single consumer. upgrade: second consumer appears.

## src/app/(dashboard)/layout.tsx
- `:94` — app-shell pages keep mobile fixed-height scroll (bounded ancestor for h-full panes). ceiling: bounded-ancestor scroll model. upgrade: none. `no-trigger`

## src/app/(dashboard)/dispense/page.tsx
- `:139` — dev test helper, randomly adds up to 10 items from current list. ceiling: dev-only helper in prod path. upgrade: remove or gate behind dev flag before prod.

## src/app/(dashboard)/receive/page.tsx
- `:24` — `crypto.randomUUID` requires secure context (HTTPS/localhost). ceiling: secure-context dependency. upgrade: fallback id-gen if non-secure context must be supported.

## src/app/(dashboard)/maintenance/page.tsx
- `:99` — perPage 200 covers overdue + due-soon set. ceiling: 200 rows. upgrade: tenant exceeds → bump.

## src/components/settings/locations-tab.tsx
- `:40` — tree built client-side from already-sorted flat list; no backend change. ceiling: client-side tree. upgrade: none. `no-trigger`
- `:171` — lazy-fetch on open; no preload of every row. ceiling: lazy per-row. upgrade: none. `no-trigger`

## src/components/shared/pagination.tsx
- `:13` — one presentational component, two UI modes, three transports (offset/cursor/client-slice). ceiling: one comp many modes. upgrade: none. `no-trigger`

## src/components/dashboard/dashboard-greeting.tsx
- `:35` — last-refreshed snapshot, not a ticking wall-clock. ceiling: static moment. upgrade: none. `no-trigger`

## src/components/dashboard/chart-container.tsx
- `:17` — replaces recharts ResponsiveContainer (which logs noise). ceiling: custom resize container. upgrade: none. `no-trigger`

## src/components/reports/dispense-history-tab.tsx
- `:74` — client-side grouping of the current page only. ceiling: page-scoped grouping. upgrade: server-side grouping when cross-page totals are required.

## src/hooks/use-inventory-list.ts
- `:83` — cursor can't jump → walk forward from highest known page, caching each. ceiling: forward-only cursor walk. upgrade: none. `no-trigger`

## src/hooks/use-lookup-data.ts
- `:6` — react-query powers dashboard hooks; hand-rolled module cache here instead. ceiling: duplicate cache layer. upgrade: collapse into react-query.

## src/hooks/use-is-mobile.ts
- `:5` — one breakpoint (md) drives every mobile-only UI branch. ceiling: single breakpoint. upgrade: none. `no-trigger`

## src/hooks/use-paged-list.ts
- `:5` — offset transport abstracted over `fetchPage(page) → {items,total}`. ceiling: offset-only. upgrade: none. `no-trigger`

## src/lib/api-utils.ts
- `:29` — shared catch tail (`err instanceof Error ? err.message : fallback`). ceiling: one catch tail. upgrade: none. `no-trigger`

## src/lib/image.ts
- `:1` — demo-only placeholder images via Lorem Picsum. ceiling: demo images. upgrade: swap/blank in prod.

## src/lib/format.ts
- `:1` — token formatter covering only yyyy/MM/dd/MMM/HH/mm. ceiling: limited token set. upgrade: extend tokens when a new pattern is needed.

## src/lib/validators/dispense.ts
- `:3` — plain type; cartItemSchema never parsed at runtime (cart built client-side). ceiling: unchecked type. upgrade: none. `no-trigger`
- `:37` — per-dispense flag, not a DB column. ceiling: transient flag. upgrade: persist as column if reporting needs it.

---

## High rot risk (`no-trigger`)

Most `no-trigger` rows are permanent-by-design shortcuts (stdlib, single breakpoint, shared tail) — not real debt. These three deserve a trigger or removal:

- `kits/route.ts:75` — no-lot shortcut; no revisit condition.
- `receive/page.tsx:24` — secure-context dependency; no fallback path named.
- `dispense/page.tsx:139` — dev helper lives in prod path; no gate.

Re-generate: `/ponytail:ponytail-debt`
