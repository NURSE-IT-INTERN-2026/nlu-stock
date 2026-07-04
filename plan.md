# NLU Stock — Plan (source of truth)

> **This file supersedes the old `plan.md` (M1 schema) and `plan-nlu-stock/CONTEXT.md`.**
> Those described an aspirational/legacy state. This doc reflects the code as it is
> today + the locked decisions. `prisma/schema.prisma` is the authoritative data model;
> this plan explains intent, scope, and the realignment work.
>
_domain_: Nursing Learning Unit stock system. Replace scattered Excel with a web app.
_Phase 1_ = dispense-focused stock management. _Phase 2_ = borrow/return (deferred).

---

## 1. Locked decisions (2026-06-19)

| # | Decision | Why |
|---|---|---|
| D1 | **Cut Kit / BOM entirely from Phase 1.** | No UI defines kit components → the only composite code path (`dispense` deduct) can never find components. Kit is a Phase 2 "borrow set" feature per `talk.txt`. Dead until then. |
| D2 | **Auth = dev/demo email-only.** No Entra/MSAL, no passwords. | Prod SSO was never built; `bcryptjs` removed (was never wired). Email-only is a known limitation, not a bug — flagged for a later auth milestone. |
| D3 | **Keep AI semantic search** (pgvector + Gemini). | Used in add-item-modal to detect duplicates. Documented here as in-scope. |
| D4 | **Enforce `assetTracking` / `setTracking` server-side.** | Today they're decorative in the API (selected but never branched on). Make the flags constrain what gets stored so UI and server agree. |
| D5 | **`CategoryProfile` + `DispenseType` enum is the category model.** Not the legacy `Category` enum. | Already live; 5 profiles seeded (CON/KIT→plain/DUR/KRU/BAT). |
| D6 | **`UsageType` enum replaces the `Subject` table.** | COURSE/ACTIVITY/OTHER matches the requirement's "ระบุวิชา/กิจกรรม". Subject table was over-engineering. |

---

## 2. Authoritative data model

Source of truth: `prisma/schema.prisma`. Summary:

**Profiles (the only fixed enum is `DispenseType`):**

| Profile (seed code) | Name | `dispenseType` | `assetTracking` | `setTracking` | `trackIndividually` |
|---|---|---|---|---|---|
| `CON` | วัสดุสิ้นเปลือง | CONSUMABLE | – | – | false |
| `DUR` | วัสดุคงทน | COUNT | – | – | false |
| `KRU` | ครุภัณฑ์ | ITEM | ✓ | – | true |
| `BAT` | หนังสือและของเล่น | ITEM | – | ✓ | true |
| ~~`KIT`~~ | อุปกรณ์ประกอบวิชา | (Phase 2) | – | – | – |

**`trackIndividually` rule** (`forcedTrackIndividually`): `dispenseType === "ITEM" → true`, else `false`. Server always overrides client input. No per-item override.

**Dispense behavior by `dispenseType`:**
- `CONSUMABLE` → pick lot (FIFO), decrement `Lot.remainingQty` (optimistic-locked).
- `COUNT` → qty, decrement `Item.availableQty`.
- `ITEM` → pick sub-item, set `SubItem.status = ON_LOAN`.

**Stock counters** (ADR-0002): `Lot.receivedQty` immutable, `Lot.remainingQty` decremented on dispense. `Item.totalQty` / `availableQty` are maintained counters (single-source derivation deferred — too risky in dev).

**Code scheme** (ADR-0001): `NLU-{PREFIX}-{NNN}[-SNN]`. Copy segment `-CNN` lives on `SubItem.subCode`, uniform across tracked categories.

---

## 3. Phase scope

**Phase 1 (current) — dispense-focused stock management:**
- Auth (email-only), dashboard (8 widgets), items + detail (5 tabs), dispense (cart + 3 types), receive, adjust, maintenance, reports (8 + export), alerts (query only), QR gen/scan/print, file upload, AI duplicate search, CSV import.

**Phase 2 (deferred — do NOT build now):**
- Borrow/return workflow, "borrow sets" (this is where Kit/BOM returns), student + teacher roles, Entra ID SSO, email alerts (NodeMailer), penalties/overdue.

---

## 4. Feature status matrix

| Area | Status | Notes |
|---|---|---|
| Auth + middleware | ⚠️ dev-only | email-only, API routes not role-checked in middleware (per-route only) |
| Items master + wizard | ✅ works | wizard omits fixed-asset fields (D4 will surface them) |
| Item detail (5 tabs) | ✅ works | |
| Dispense (3 types) | ✅ works | cart-drawer + confirm page duplicate ~120 lines (C2) |
| Receive | ✅ works | |
| Adjust / status / return | ✅ works | |
| Maintenance | ✅ works | a few `!bg-white` bypass dark mode |
| Reports (8) + export | ✅ works | |
| Dashboard (8 widgets) | ✅ works | |
| Alerts (query) | ✅ works | email/cron deferred |
| QR gen/scan/print | ✅ works | |
| File upload | ✅ works | |
| AI semantic search | ✅ works | kept (D3) |
| CSV import (in seed) | ✅ works | sub-items don't reconcile parent qty (B3) |
| **Kit / BOM** | ❌ cut | D1 — remove model, flag, dispense branch, profile |
| **Borrow/return** | ⏭️ Phase 2 | |

---

## 5. Realignment work items

Prioritized. Each is independently grabbable.

### A. Execute locked decisions

**A1 — Cut Kit (D1).** Remove:
- `model KitComponent` + `Item.kitComponents`/`kitStockItems` relations — `prisma/schema.prisma:213-214, 351-365`
- `CategoryProfile.isComposite` flag — `schema.prisma:115`
- `isComposite` from `BEHAVIOR_FIELDS` — `api/settings/profiles/[id]/route.ts:7`
- KIT deduct branch — `api/dispense/route.ts:112-127`
- `isComposite` switch + badge in UI — `components/settings/profiles-tab.tsx:208, 276`
- seed `KIT` profile's `isComposite` (keep profile as plain CONSUMABLE or drop) — `prisma/seed.ts:24-30`
- migration to drop the table + column.

**A2 — Enforce flags server-side (D4).** Today decorative. Add to item create/update/quick-create/import:
- `assetTracking === false` → strip fixed-asset fields (`model`, `purchaseDate`, `purchasePrice`, `vendor*`, `warrantyMonths`, `maintenanceCycleMonths`) before write.
- `setTracking === false` → clamp `setSize = 1`.
- And surface `assetTracking`-gated fields in the add-item wizard (currently only the legacy edit dialog reads it — `items-master-tab.tsx:872`).
- Exact reject-vs-strip semantics: confirm before coding (see Q in §7).

**A3 — Document auth as dev-only (D2).** Add a section to this plan / README: email-only login, no prod auth, known limitation. (This §1 D2 + §3 already capture it.)

### B. Correctness fixes (normal review pass — surfaced by the scan)

- **B1 — Negative stock on COUNT dispense.** `api/dispense/route.ts:103-109` decrements `Item.availableQty` with no atomic guard (unlike the lot path's optimistic lock). Concurrent dispense → negative. Fix: atomic `updateMany where availableQty >= qty` + check `count`.
- **B2 — `PATCH /api/items/[id]` is a near no-op.** `api/items/[id]/route.ts:53-70` only persists `imageUrl`/`images`, ignores everything else. Either wire full edit or delete the route (editing goes through `/api/settings/items/[id]`).
- **B3 — Import doesn't reconcile parent qty.** `api/settings/import/route.ts:209-213` adds sub-items without updating `Item.totalQty`/`availableQty`. Reconcile after bulk insert.
- **B4 — Middleware doesn't role-check API routes.** Only pages. Write APIs rely on per-route `requireAdmin` (inconsistent: some use `getSessionUser` + manual check). Decide: enforce roles in middleware for `/api/settings/*` or standardize per-route.

### C. Dead code cleanup

- **C1 — Drop 9 unused validator exports:** every `*Input` type (`CategoryCreate/Update`, `ProfileCreate/Update`, `StockAdjust`, `StatusChange`, `SubItemBatchCreate`), `cartItemSchema`, `DispenseRequest`. All schemas themselves are used.
- **C2 — Dedupe cart logic.** `components/dispense/cart-drawer.tsx` ≡ `dispense/confirm/page.tsx` (~120 lines, `EditableQty` byte-identical). Extract a shared module.
- **C3 — Dead vars:** `allowedProfileIds` no-op (`add-item-modal/index.tsx:180-182`), `suggestedCode` dead in edit mode (`items-master-tab.tsx:632`), `className=""` x3 (`maintenance/page.tsx:126,134,142`), local dup `STATUS_CHIPS`/`STATUS_VARIANTS` across 3 components (extract 1 shared map).
- **C4 — Stale one-shot scripts:** `scripts/migrate-profiles.ts` ran against a now-dropped enum column — likely dead. Verify + remove.

### D. Deferred (Phase 2 / later — do not touch now)

Entra ID SSO, NodeMailer email alerts, borrow/return + sets, Kit/BOM (re-introduce here), single-source qty derivation (ADR-0002 future work).

### E. Follow-ups from the เบิก/รับ/คืน DoD (2026-07-02)

- **E1 — Dispense-history report: show real return condition.** The report's Status column
  shows only "Dispensed" / "Returned" (from `returnedAt`). It cannot tell ปกติ vs ชำรุด vs สูญหาย
  because `DispenseRecord` stores no return condition — the outcome lives in `StockAdjustment`
  (LOST / DAMAGED_PENDING_REPAIR) and per-piece `ItemStatusLog`. Fix needs **either** a new
  `DispenseRecord.returnCondition` field (+ backfill) **or** a join to those tables in the report
  query. Non-blocking for the DoD; agreed to log now so it isn't lost.

---

## 6. Locked architecture decisions (ADRs)

- `docs/adr/0001` — flat code `NLU-PREFIX-NNN[-SNN]`, copy on `SubItem.subCode`.
- `docs/adr/0002` — `Lot` split into immutable `receivedQty` + `remainingQty`; corrections via `StockAdjustment`.

Both current and authoritative.

---

## 7. Open question (decide before A2)

**Flag enforcement semantics (D4):** when a flag is off, should the server (a) **strip** the disallowed fields silently, or (b) **reject** the request with 422? Strip is friendlier (wizard partial data), reject is stricter. Recommend **strip** for Phase 1. Confirm to proceed.
