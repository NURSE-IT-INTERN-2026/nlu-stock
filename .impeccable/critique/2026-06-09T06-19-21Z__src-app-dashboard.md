---
target: src/app/(dashboard)
total_score: 22
p0_count: 1
p1_count: 2
timestamp: 2026-06-09T06-19-21Z
slug: src-app-dashboard
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Skeletons, cart badge, alert bell — good. Item detail loads without transition; sudden pop. |
| 2 | Match System / Real World | 2/4 | Thai-first institute, English UI: settings tabs, item detail tabs, filter labels, page titles, breadcrumbs. |
| 3 | User Control and Freedom | 3/4 | Back nav and cart removal present. No undo on destructive delete. |
| 4 | Consistency and Standards | 2/4 | English/Thai fragmentation. Delete button size inconsistent across surfaces. hover:shadow-xl on metric cards only. Dispense cards fixed h-142, receive cards variable. |
| 5 | Error Prevention | 3/4 | Name dupe check, code suggestion, minThreshold indicators. Receive submit has no pre-validation feedback. |
| 6 | Recognition Rather Than Recall | 2/4 | Collapsed sidebar icon-only, no tooltips. Filters on dispense don't persist. Breadcrumb renders raw URL slugs not Thai labels. |
| 7 | Flexibility and Efficiency | 2/4 | QR scanner good. No keyboard shortcuts. No saved filters. Bulk actions not discoverable. |
| 8 | Aesthetic and Minimalist Design | 2/4 | Dashboard: 3 tiny metric cards in 1/5 grid — sparse. Item detail: double header + 8 animated sections — stacked. Density gap between pages is wide. |
| 9 | Error Recovery | 2/4 | Toast errors generic. No retry affordance. No cause explanation. |
| 10 | Help and Documentation | 1/4 | Zero tooltips on icon sidebar. No INSTRUCTOR guidance. Minimal empty states. |
| **Total** | | **22/40** | **Functional foundation, significant UX debt** |

## Anti-Patterns Verdict

**LLM assessment**: Not AI slop in the banner-and-hero sense. No gradient text, no cream bg, no eyebrow kickers. Orange brand correct and restrained. Reads as a well-intentioned shadcn/ui scaffold that hasn't had a craft pass. Dashboard greeting + metric cards is the most common "first-build dashboard" layout. Pages feel built independently.

**Deterministic scan**: detect.mjs returned [] — no automated slop patterns found.

## Overall Impression

The system works and has solid bones: real OKLCH tokens, proper component structure, meaningful domain logic. Problem is craft debt, not architecture. Density is wildly inconsistent page-to-page. English/Thai fragmentation is the sharpest friction for daily Thai users. Fix the language first, then the density rhythm.

## What's Working

1. Token system: OKLCH throughout, orange primary anchored correctly, dark mode base variables defined.
2. Receive page layout: 2-column search/cart layout is clean and task-oriented.
3. ITEM CODE card: Orange border code builder card is the most designed moment in the product. Has personality without being decorative.

## Priority Issues

**[P0] Language fragmentation**
Settings tabs, item detail tabs, filter labels, page titles, breadcrumbs all English in a Thai-first product.
Fix: Thai labels throughout. "รายการพัสดุ / หมวดหมู่ / สถานที่ / ผู้ใช้งาน / นำเข้าข้อมูล", "ข้อมูลทั่วไป / รหัสย่อย / ประวัติ / การซ่อมบำรุง", filter placeholders, page title map in layout.tsx.
Suggested command: /impeccable clarify

**[P1] Dashboard vs item detail density mismatch**
Dashboard: greeting + 3 tiny metric cards in 1/5 grid = sparse. Item detail: double header (layout header + page's own h-16 border-b) + tab bar + 8 animated sections = stacked.
Fix: Metric cards in horizontal row. Remove item detail page-level header (redundant with layout). Remove min-h-screen wrapper.
Suggested command: /impeccable layout

**[P1] Status badges dark mode failure**
STATUS_PILLS in items/page.tsx: hardcoded bg-emerald-100 text-emerald-800, bg-blue-100 text-blue-800 etc. — light tints fail in dark mode.
Fix: Map to semantic tokens: bg-success/15 text-success, bg-destructive/15 text-destructive, bg-warning/15 text-warning-foreground.
Suggested command: /impeccable audit

**[P2] Dispense fixed-height h-[142px] cards clip Thai names**
Long Thai names overflow at 2-line clip. No tooltip. Staff can't read item name without opening detail.
Fix: Remove h-[142px], use min-h or auto-height. Or reduce image to h-20 w-20.
Suggested command: /impeccable layout

**[P2] hover:shadow-xl on metric cards is oversized**
shadow-xl is a modal-scale shadow on a 3-field micro-card. Reads as "first Tailwind hover effect."
Fix: hover:shadow-md or hover:ring-1 hover:ring-border.
Suggested command: /impeccable polish

## Persona Red Flags

**วิภาวดี (STAFF, daily dispense + receive)**
- English labels in Thai workflow. Thai item names clip in fixed-height dispense cards.
- Dispense has slide-over cart; receive has inline cart. Same task, different paradigm.

**สมชาย (ADMIN, settings + items)**
- Settings tabs English, table content Thai — cognitive split.
- Units management not discoverable (hidden inside add dialog, no Settings tab for it).

## Minor Observations

- DashboardGreeting h1 contains text-sm subtitle inline — semantically wrong.
- Header bg-white hover:bg-gray-50 on cart/theme buttons — hardcoded white, fails dark mode.
- Custom pixel sizes text-[15px] text-[17px] text-[13px] mix with scale classes inconsistently.
- Breadcrumb "Confirm" segment has no standalone meaning.
- CardEditableQty in dispense/page.tsx has bare button without type="button".

## Questions to Consider

- "Receive has inline cart; dispense has slide-over. Same workflow, different paradigm. Should they unify?"
- "If 80% of INSTRUCTOR visits are browse + request — what does the UI look like optimized for them?"
- "Every page title is English in layout.tsx. Is there a reason those weren't Thai from the start?"
