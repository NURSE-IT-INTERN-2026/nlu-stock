---
target: settings page
total_score: 20
p0_count: 1
p1_count: 2
timestamp: 2026-06-09T08-14-51Z
slug: src-app-dashboard-settings-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Loading states are bare "Loading..." text in 3/5 tabs; drag-reorder saves silently |
| 2 | Match System / Real World | 1 | Thai tab labels, English everything else — dialog titles, table headers, buttons, error messages — in a Thai-primary system |
| 3 | User Control and Freedom | 2 | `window.confirm()` for delete; no undo; dialogs have Cancel |
| 4 | Consistency and Standards | 2 | Mixed loading states; hard-coded `bg-green-600`/`text-yellow-600` escape the token system; native file input vs. styled components |
| 5 | Error Prevention | 3 | Code deduplication check is excellent; name-duplicate debounce proactive; required fields disable save |
| 6 | Recognition Rather Than Recall | 2 | Three icon-only buttons per row with no tooltips — edit, delete, toggle-active are guesswork |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts; no search/filter in Categories, Locations, Users tabs; good bulk QR select in Items |
| 8 | Aesthetic and Minimalist Design | 3 | Generally clean; token system well-defined; not overdecorated |
| 9 | Error Recovery | 2 | "Failed to save" toast gives no guidance; no in-form validation messages; no retry |
| 10 | Help and Documentation | 1 | No tooltips; no field hints; no description of category codes; Import tab has template download but no column docs |
| **Total** | | **20/40** | **Needs Significant Work** |

---

## Anti-Patterns Verdict

**LLM assessment**: Doesn't look heavily AI-generated at first glance — the token system is solid, Sarabun is a thoughtful Thai-first choice, and the orange brand is applied consistently. But the tell is the language split: Thai navigation labels sitting above English dialog titles, table headers, and button labels. That's the copy-paste component pattern: scaffolded UI that was never localized. Empty states ("No categories", "No users") and bare "Loading..." text are further AI-shortcut signatures.

**Deterministic scan**: 5 hits of `border-accent-on-rounded` in `settings/page.tsx` lines 19–35 (one per TabsTrigger). **False positives** — the `border-b-2` is explicitly paired with `rounded-none` on the trigger elements, making this a correct underline tab indicator pattern. No real anti-patterns detected by the automated scan.

---

## Overall Impression

The structural foundation is sound — tabs for the right reasons, a real design token system, sensible component choices. The critical failure is **discipline**: the product claims Thai-first but delivers English-first UI copy throughout every tab's content. Combine that with `window.confirm()` for destructive actions and three icon-only buttons that require memorization, and staff who aren't tech-savvy will struggle daily. One session of localization and a delete confirmation Dialog would close the largest gap immediately.

---

## What's Working

1. **Items tab complexity handled well** — Search, category filter, status chip filters, paginated table, expand-row detail, bulk select + QR print, and inline stock bar: a lot of surface handled without feeling cluttered.
2. **StockBar component** — Color-coded threshold indicator (destructive/warning/success) that makes low stock immediately visible. Clear, functional, on-brand.
3. **Drag-to-reorder categories** — The dnd-kit integration with keyboard sensor support shows real attention to power-user and a11y workflows in one feature.

---

## Priority Issues

### [P0] Language mixing: Thai nav, English everything else
**What**: Tab labels are Thai. Every dialog title, table column header, button label, toast message, and form label is English. The categories table headers say "Name / Type / Items / Actions"; the users table says "Email / Role / Status / Actions."
**Why it matters**: PRODUCT.md explicitly states "Thai language primary." The users are NLU nursing institute staff — not international developers. A staff member clicking "ผู้ใช้งาน" and landing in a table with "Email / Role / Status" column headers faces a language break every time they work.
**Fix**: Translate all UI copy inside each tab to Thai: table headers (ชื่อ / ประเภท / จำนวน / การดำเนินการ), button labels (เพิ่ม / แก้ไข / บันทึก / ยกเลิก), dialog titles (เพิ่มหมวดหมู่ / แก้ไขสถานที่), error/success toasts (บันทึกสำเร็จ / บันทึกไม่สำเร็จ).
**Suggested command**: `/impeccable clarify settings`

### [P1] `window.confirm()` for destructive actions
**What**: All delete flows in Categories, Locations, Users, and the "Deactivate user" path call `window.confirm()` — a native browser dialog that ignores all CSS, breaks the design system, and has no keyboard trap.
**Why it matters**: The browser dialog is jarring and untrusted in 2026. It also shows `Delete "${cat.name}"?` with no mention of consequences (e.g., "Category has 12 items attached"). For admin staff managing real institutional assets, destroying data with a misclick feels dangerous.
**Fix**: Replace every `window.confirm()` with an `AlertDialog` (already available in shadcn). Include the item name, a consequence line ("This will unlink 12 items from this category"), and a clearly destructive confirm button.
**Suggested command**: `/impeccable harden settings`

### [P1] Missing page-level header
**What**: The settings route renders `<div className="space-y-4">` → tabs. No page title, no breadcrumb, no description. The only heading a user sees is the tab-level `<h3>` inside each panel (which is also in English).
**Why it matters**: Without a page header, the Settings section has no orientation. Staff navigating here from the sidebar have no visual confirmation they're in the right place, and no context for what "Settings" covers in this system.
**Fix**: Add a page header above the TabsList: a Thai title ("ตั้งค่าระบบ"), a subtitle ("จัดการพัสดุ หมวดหมู่ สถานที่ และผู้ใช้งาน"), and an optional role-based note that only ADMIN can access this section.
**Suggested command**: `/impeccable layout settings`

### [P2] Icon-only action buttons with no accessible labels
**What**: Each table row has 2–3 ghost icon buttons (Pencil, Trash2, UserX/UserCheck) at `size="icon"`. No `aria-label`, no tooltip. The UserX and UserCheck icons for toggle-active look nearly identical at 14px.
**Why it matters**: Keyboard and screen reader users get nothing. Sighted users have to hover-and-guess. A staff member with bifocals distinguishing UserX from Trash2 at small size is a real failure scenario in an institutional system.
**Fix**: Add `aria-label` and a Tooltip to each action button (e.g., `<Tooltip content="แก้ไข">`). Give the delete button a `text-destructive` variant or a visible border on hover to differentiate it from the toggle-active button.
**Suggested command**: `/impeccable audit settings`

### [P2] Hollow empty states
**What**: No data → bare centered text: "No categories", "No locations", "No users". The Items tab uses a similar pattern.
**Why it matters**: Empty states are the most important moment in a settings panel — it's when a new admin is onboarding. "No categories" tells them nothing. They don't know if something failed to load, if they need to create one, or what a category even does here.
**Fix**: Replace bare text with a brief empty state: relevant icon, Thai label ("ยังไม่มีหมวดหมู่"), a one-line description of what this list is for, and a primary CTA button (same "Add" button, inline). Skeleton placeholder during initial load in categories/locations/users (matching the Items tab pattern).
**Suggested command**: `/impeccable onboard settings`

---

## Persona Red Flags

**Somchai (Admin, power user, 40s, computer-literate but Thai-only)**: Clicks "ผู้ใช้งาน" tab → table with "Email / Role / Status / Actions" headings. Wants to add a new instructor → clicks unlabeled icon button (Pencil? or the other one?) → dialog opens titled "Add User" with labels "Email / Name / Role". Everything is English. Will get the job done eventually but with unnecessary friction on every visit. The icon-only delete is one misclick from accidentally deactivating the wrong user with no recovery path.

**Pranee (STAFF, occasional admin task, first-timer to this settings page)**: Opens Settings for the first time. No page title — is this the right page? Clicks "นำเข้าข้อมูล" tab. Sees "1. Select Type & Download Template" — good. Downloads the template. Uploads CSV. Clicks "Import". Result card appears with `Badge className="bg-green-600"` — this token escape means in dark mode, this badge looks broken. Doesn't know how to read the error table ("Row / Error" columns). Will email IT.

---

## Minor Observations

- **`<Label>` elements missing `htmlFor`** throughout all dialogs — not linked to their `<Input>`. Screen readers won't announce the label when the input is focused.
- **Import tab uses native `<input type="file">`** with `file:` pseudo-class styling instead of a `FileUpload` component (which exists in `@/components/shared/file-upload`). The inconsistency is visible.
- **`bg-green-600` and `text-yellow-600`** in `import-tab.tsx` bypass the token system. In dark mode these will likely contrast-fail.
- **Locations tab**: No grouping by building when the list grows. A flat list of "อาคาร A / ชั้น 1 / ห้อง 101" entries becomes hard to scan at 20+ locations. Consider a grouped list by building.
- **Categories tab `h3` says "Categories"** (English) while the tab label says "หมวดหมู่" (Thai). Same mismatch in all tabs.
- **Drag handle in categories table**: The grip icon has no visible affordance that it's draggable on touch devices — just cursor change. On tablet (common in labs), this is discoverable only by accident.

---

## Questions to Consider

- The Items tab is the most-used setting by far. Should it get its own dedicated "Master Items" route instead of living under Settings tabs with equal visual weight as "Import"?
- What does the page look like when a STAFF user (not ADMIN) accesses Settings? Does it hide the Users tab? Is there a clear role-gate message or just empty screens?
- The category reorder fires individual API calls per item on drag end. At 50+ categories this sends 50 parallel requests. Is there a batch reorder endpoint, and should there be a "Saving order..." status?
