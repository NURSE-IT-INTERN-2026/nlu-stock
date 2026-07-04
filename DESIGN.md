---
name: NLU Stock
description: Thai-first inventory & asset management for a nursing institute — Signal Orange on cool clinic neutrals.
colors:
  # Primary — Signal Orange (committed surfaces: primary actions, focus ring, active nav, chart-1)
  signal-orange: "oklch(58% 0.19 40)"
  signal-orange-deep: "oklch(55% 0.18 40)"
  signal-orange-soft: "oklch(72% 0.16 40)"
  signal-orange-foreground: "oklch(100% 0 0)"
  # Semantic status (the real vocabulary — "status always visible")
  teal-success: "oklch(60% 0.13 185)"
  amber-warning: "oklch(72% 0.16 75)"
  danger-red: "oklch(55% 0.20 25)"
  info-blue: "oklch(58% 0.12 240)"
  # Neutrals — cool clinic gray (hue 264, near-zero chroma; explicitly NOT cream/beige)
  page-bg: "oklch(97% 0.003 264)"
  ink: "oklch(20% 0.003 264)"
  card-white: "#ffffff"
  sidebar-bg: "oklch(98% 0.003 264)"
  secondary-gray: "oklch(94% 0.003 264)"
  muted-ink: "oklch(43% 0.006 264)"
  accent-warm: "oklch(94% 0.04 40)"
  hairline: "oklch(90% 0.003 264)"
  # Dark mode — soft lightness ladder (page 22% → sidebar 25% → card 28%)
  dark-page: "oklch(22% 0.005 264)"
  dark-card: "oklch(28% 0.005 264)"
  dark-ink: "oklch(92% 0.003 264)"
typography:
  display:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.375
  body:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Sarabun, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0.025em"
rounded:
  control: "0.85rem"
  control-small: "0.68rem"
  nav: "1.19rem"
  card: "1.53rem"
  pill: "2.21rem"
spacing:
  control-h: "2rem"
  control-px: "0.625rem"
  gap-tight: "0.375rem"
  card-pad: "1rem"
  section: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.signal-orange-foreground}"
    rounded: "{rounded.control}"
    height: "{spacing.control-h}"
    padding: "{spacing.control-px}"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.signal-orange-deep}"
  button-primary-active:
    typography: "{typography.body}"
  button-outline:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "{spacing.control-h}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "{spacing.control-h}"
  button-destructive:
    backgroundColor: "oklch(55% 0.20 25 / 0.10)"
    textColor: "{colors.danger-red}"
    rounded: "{rounded.control}"
    height: "{spacing.control-h}"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "{spacing.control-h}"
    padding: "{spacing.control-px}"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  badge:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.signal-orange-foreground}"
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
---

# Design System: NLU Stock

## 1. Overview

**Creative North Star: "The Supply Station"**

NLU Stock is the supply counter at a Thai nursing institute — the place a staff member walks to between rounds, glances at, and acts on. The interface should feel like that counter: everything in its place, status legible at arm's length, no decoration between the user and the task. Clarity is the design; trust is the byproduct.

This is a **Restrained** product surface with one **Committed** accent. Cool clinic neutrals (a near-white at hue 264, chroma ~0.003) carry 90%+ of every screen; **Signal Orange** (`oklch(58% 0.19 40)`) appears only where the user must act or the system must signal — primary buttons, focus rings, the active nav item, the leading chart series. Status is its own vocabulary: teal for success, amber for warning, red for danger, blue for info. The combination reads institutional and approachable, not corporate and not casual.

Density is deliberate and earned. Controls sit at **h-8 (32px)**, body copy at **text-sm (0.875rem)**, labels at **text-xs**. This is the density a tool needs when its users scan tables of items, dispense queues, and stock counts all day — tight enough to show real data, generous enough to stay calm. It rejects both poles named in PRODUCT.md: it is **not consumer e-commerce** (no retail flourish, no saturated decoration) and **not heavy ERP** (no dense corporate chrome, no nested panels). Thai is the primary language; the single typeface — **Sarabun** — is chosen because it renders Thai beautifully across its full weight range (100–800).

**Key Characteristics:**
- **Status-first**: stock levels, pending requests, item state surfaced immediately through four semantic hues, never through color alone (icons + text reinforce every state).
- **Compact, not cramped**: h-8 controls, text-sm body, tight type scale (~1.15 ratio), comfortable rhythm via `gap-4` cards and `gap-6` sections.
- **One committed accent**: Signal Orange is rare. Its rarity on a near-white field is what makes it read as "act here."
- **Soft-lifted depth**: surfaces are flat at rest; the faintest shadow (`shadow-black/[0.04]`) and a hover lift mark only interactive cards. Pure white cards on a cool-gray page do the structural work.
- **Thai-first typography**: Sarabun for sans, heading, and mono alike — one family, tuned by weight, carrying both Thai and Latin cleanly.

## 2. Colors: The Supply Station Palette

A near-neutral cool field with one orange signal and a four-hue status vocabulary. Neutrals are cool gray (hue 264), not warm — this is the explicit refusal of generic SaaS cream/beige.

### Primary
- **Signal Orange** (`oklch(58% 0.19 40)`): primary actions (default buttons), focus rings, the active sidebar item, the leading chart series, and brand accents. In dark mode it lifts to `oklch(72% 0.16 40)` for contrast. Its ramp (orange-50 → orange-900, same hue 40) supplies tints for icon tiles (`bg-orange-100/500`) and deep variants for hover (`signal-orange-deep` `oklch(55% 0.18 40)`).
- **White** (`oklch(100% 0 0)`): the foreground on every orange fill.

### Semantic / Status
- **Teal — Success** (`oklch(60% 0.13 185)`): "in stock," "normal," positive state. Used as icon/tint accent and `chart-2`.
- **Amber — Warning** (`oklch(72% 0.16 75)`): "low stock," "below reorder point." Foreground on amber is dark (`oklch(25% 0.05 75)`).
- **Red — Danger** (`oklch(55% 0.20 25)`): "expired," "on loan / not returned," destructive actions. Note: destructive *buttons* are **tinted** (`danger/10` background, red text), never solid red — restraint over alarm. Maps to `chart-4`.
- **Blue — Info** (`oklch(58% 0.12 240)`): "expiring within 30 days," informational state. Maps to `chart-3`.

### Neutral
- **Page Background** (`oklch(97% 0.003 264)`): the cool clinic near-white every screen sits on.
- **Card / Popover** (`#ffffff`): pure white surfaces — the primary depth cue (white on cool-gray).
- **Ink** (`oklch(20% 0.003 264)`): body and heading text; near-black with the same faint cool bias.
- **Sidebar** (`oklch(98% 0.003 264)`): a half-step lighter than the page, marking the nav as its own layer.
- **Muted Ink** (`oklch(43% 0.006 264)`): secondary text and placeholders. **Verify contrast** — this is the common failure point; it is tuned to clear ≥4.5:1 on white, do not lighten it "for elegance."
- **Secondary / Muted Gray** (`oklch(94% 0.003 264)`): ghost/secondary button fills, hover backgrounds.
- **Accent Warm** (`oklch(94% 0.04 40)`): a barely-there orange tint for sidebar hover and accent states.
- **Hairline** (`oklch(90% 0.003 264)`): borders, input strokes, dividers.

### Named Rules
**The Signal Rule.** Signal Orange occupies ≤10% of any screen. It marks primary actions, current selection, and focus — nothing decorative. If orange appears on more than one element per cluster without earning it, the signal is broken.

**The Status-Not-Decoration Rule.** Teal/amber/red/blue encode state. They are never used as brand flourish, never applied to inactive states at full saturation, and never the *only* indicator — every status pairs its hue with an icon and Thai text label (per PRODUCT.md accessibility).

**The Tinted-Destructive Rule.** Destructive and warning actions use a low-opacity tint of their hue (`/10`–`/20` background) with full-saturation text — never a solid red/amber button. Restraint prevents alarm fatigue on a screen full of pending alerts.

## 3. Typography

**Display / Body / Label Font:** Sarabun (with `system-ui, sans-serif` fallback)
**Mono Font:** Sarabun (`--font-mono` is deliberately Sarabun, not a monospace)

**Character:** One family, tuned by weight — Sarabun's wide weight range (100–800) does the work a font pairing would normally do. Heavy extrabold numerals anchor data; medium weights carry titles; regular carries prose. It renders Thai as the first-class citizen it is here.

### Hierarchy
- **Display** (800, 1.5rem, line-height 1, tracking -0.025em): metric values and key counts — the numbers that define a glance. `leading-none` so the number is the object.
- **Headline** (700, ~1.125–1.25rem, tracking tight): page and section headings (page greeting, logo lockup). Bold, never display-weight.
- **Title** (500, 1rem / `text-base`, line-height 1.375): card titles and panel headers. Uses `font-heading` (Sarabun).
- **Body** (400, 0.875rem / `text-sm`, line-height 1.5): the workhorse. Inputs default to `text-base` on mobile, `md:text-sm` on desktop. Cap prose at 65–75ch.
- **Label** (500, 0.75rem / `text-xs`, tracking 0.025em): metric titles, table headers, eyebrow-style metadata. `tracking-wide` for a quiet, structured feel — this is **not** the all-caps tracked kicker ban (labels stay sentence-case Thai).

### Named Rules
**The One-Family Rule.** No display font, no serif pairing, no monospace. Sarabun at the right weight answers every role. Adding a second family reintroduces the brand-display reflex this product rejects.

**The Fixed-Scale Rule.** Type sizes are fixed rem, never `clamp()`. Users work at consistent DPI on desktops and tablets; a fluid heading that shrinks in a sidebar reads as broken, not responsive.

## 4. Elevation

Soft-lifted. The system is **flat by default** and leans on **tonal layering** for structure: a cool-gray page (`97%`), a half-step-lighter sidebar (`98%`), and pure-white cards/popovers. Depth is conveyed by this lightness ladder, not by shadow.

Shadows appear only as a response to state, and even then barely. The faintest possible lift marks an interactive surface; everything else holds still.

### Shadow Vocabulary
- **Card Rest** (`box-shadow: 0 10px 15px -3px rgba(0,0,0,0.04)` — i.e. `shadow-lg shadow-black/[0.04]`): a barely-there contact shadow under cards. Reads as "this is a surface," not "this is floating."
- **Interactive Hover** (`shadow-md` + `translateY(-2px)`): clickable cards (metric tiles, linked summaries) lift ~2px and gain a touch more shadow on hover; `active:scale-[0.98]` confirms the press.
- **Popovers / Dialogs / Sheets**: elevated above content via the stacking context, not heavy drop shadows.

### Named Rules
**The Flat-At-Rest Rule.** Surfaces hold no shadow when idle. Shadow is a state event (hover, elevation, focus), never ambient decoration. If a resting card casts a visible shadow, it is too heavy.

**The Ladder-Not-Shadow Rule.** Structural depth (page → sidebar → card → popover) is shown by stepping lightness, not by stacking shadows. Dark mode makes this explicit: page `22%` → sidebar `25%` → card/popover `28%`.

## 5. Components

Every interactive component ships the full state set — default, hover, focus-visible, active, disabled, loading, error — via Base UI primitives + `class-variance-authority`. Consistent vocabulary across screens is a hard requirement.

### Buttons
- **Shape:** rounded-lg (~13.6px, `var(--radius)`); small/xs sizes cap at 10–12px via `rounded-[min(var(--radius-md),Npx)]`. Border-transparent, `bg-clip-padding`.
- **Primary:** Signal Orange fill, white text, `text-sm font-medium`, `h-8`, `px-2.5`. Icon-default `size-4`. Hover darkens to `signal-orange-deep`. `active:translate-y-px` (subtle press, except for haspopup buttons).
- **Hover / Focus:** `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` — the shared 3px focus ring at 50% Signal Orange. This ring is the single focus treatment across the whole app.
- **Outline:** white bg, hairline border, hover → muted gray fill. **Ghost:** transparent, hover → muted fill. **Secondary:** secondary-gray fill. **Destructive:** tinted red (`danger/10` bg, red text) — **The Tinted-Destructive Rule**. **Link:** orange text, underline on hover.
- **Sizes:** default `h-8`, `xs h-6`, `sm h-7`, `lg h-9`, plus `icon` / `icon-xs` / `icon-sm` / `icon-lg` square variants.

### Badges / Status Pills
- **Style:** `rounded-4xl` pill (~35px, fully round at `h-5`), `text-xs font-medium`, `px-2`. Variant fills mirror button semantics: default (orange), secondary (gray), destructive (tinted red), outline (border), ghost, link. Status pills pair a hue with a Lucide icon.

### Cards / Containers
- **Corner:** `rounded-2xl` (~24px), `overflow-hidden`. Images flush to card edges (`rounded-t-2xl`).
- **Background:** pure white (`bg-card`) on the cool-gray page.
- **Shadow:** card-rest only (`shadow-black/[0.04]`); interactive cards add hover-lift.
- **Border:** none at rest (footer is the one divider: `border-t bg-muted/50`). Nested cards are forbidden.
- **Padding:** `py-4 px-4`; `size="sm"` tightens to `py-3 px-3`. Metric tiles override to `py-0 gap-0` for a denser data feel.
- **Title:** `font-heading text-base font-medium leading-snug`; description `text-sm text-muted-foreground`.

### Inputs / Fields
- **Style:** `h-8`, `rounded-lg`, `border-input` hairline, `bg-transparent`, `px-2.5`, `text-base md:text-sm`. `min-w-0` to allow truncation in flex rows.
- **Focus:** same shared ring as buttons (`focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`).
- **Error / Disabled:** `aria-invalid` swaps to `border-destructive` + `ring-destructive/20`; disabled → `bg-input/50 opacity-50`. Placeholder uses `muted-foreground` (kept at contrast, not lightened).
- **Note:** Base UI, not Radix — selects need explicit `children` on `SelectValue` or they show the raw id (see project memory).

### Navigation (Sidebar — signature)
- **Style:** fixed left rail, `border-r bg-card`, `w-64` expanded / `w-16` collapsed (`hidden lg:flex`; mobile uses a bottom tab bar). Items `rounded-xl`, `text-sm`, Lucide icon in an `h-8 w-8 rounded-lg` tile.
- **Active:** the system's **one committed orange surface** — `bg-orange-500 text-white font-semibold`, icon tile `bg-white/20`. This is where Signal Orange is allowed to fill.
- **Default / Hover:** sidebar-foreground text, icon tile tinted `bg-orange-100 dark:bg-orange-900/30` with `text-orange-500` icon; hover → `bg-sidebar-accent`. Trailing `ChevronRight` at `text-muted-foreground/40`.
- **Role-gated:** ADMIN-only items (settings) filtered by role.

### Dashboard Metric Card (signature)
- **Style:** a Card with `py-0 gap-0` — title (`text-xs font-medium text-muted-foreground tracking-wide`), value (`text-2xl font-extrabold leading-none tracking-tight`), and an `h-7 w-7 rounded-lg` icon tile in a tinted status hue (`bg-warning/10`, `bg-danger/10`, etc.).
- **Behavior:** always functional — clickable to filter/navigate (`href` or `onClick`), with `hover:-translate-y-0.5 active:scale-[0.98] hover:shadow-md` and `focus-within:ring-2 ring-ring ring-offset-2`. Active filter state shows `ring-2 ring-primary`. Zero values soften to muted ink and read "ปกติ" (normal).

## 6. Do's and Don'ts

### Do:
- **Do** keep Signal Orange to ≤10% of any screen — primary actions, focus rings, active nav, leading chart series, and functional accents only (The Signal Rule).
- **Do** encode every state with one of the four semantic hues **and** reinforce it with a Lucide icon + Thai text label. Color is never the only indicator (PRODUCT.md accessibility).
- **Do** render destructive and warning actions as tinted fills (`/10`–`/20`) with full-saturation text, never solid red/amber (The Tinted-Destructive Rule).
- **Do** use the shared 3px focus ring (`focus-visible:ring-3 ring-ring/50`) on every interactive element — buttons, inputs, cards, links.
- **Do** build structure with the lightness ladder (page `97%` → sidebar `98%` → white card → white popover; dark: `22% → 25% → 28%`), not stacked shadows.
- **Do** ship every interactive component with default, hover, focus-visible, active, disabled, and error states.
- **Do** keep the type scale fixed rem (no `clamp()`), one Sarabun family across all roles.
- **Do** keep controls compact (`h-8`, `text-sm`) and use real spacing rhythm (`gap-3` grids, `gap-4` cards, `gap-6` sections).
- **Do** validate early — surface code duplicates, name conflicts, and low-stock states *before* save, not after (PRODUCT.md: error prevention over recovery).

### Don't:
- **Don't** use warm cream/sand/beige backgrounds. The neutral field is **cool** (hue 264) — PRODUCT.md's anti-reference *"Generic SaaS cream/beige (anonymous)"* is refused here by construction.
- **Don't** make the interface feel like **consumer e-commerce** (retail flourish, saturated decoration) or **heavy ERP** (dense corporate chrome, nested panels). Both are PRODUCT.md anti-references.
- **Don't** add `border-left`/`border-right` greater than 1px as a colored stripe — ever. Use full borders, tinted backgrounds, or leading icons instead.
- **Don't** use gradient text (`background-clip: text` + gradient), decorative glassmorphism, or the hero-metric vanity template (big number + small label + supporting stats + gradient, purely decorative). Metric tiles here are **functional filters**, not stat-flexing.
- **Don't** repeat identical icon-heading-text cards in endless grids, and don't put a tiny uppercase tracked eyebrow (or `01/02/03` numbered markers) above every section — that is AI scaffolding, not this system's cadence.
- **Don't** add a second typeface, a display font, or a monospace. One Sarabun family, tuned by weight (The One-Family Rule).
- **Don't** cast visible shadows on resting surfaces, or use solid full-saturation accents on inactive states (The Flat-At-Rest Rule).
- **Don't** let long headings overflow their container at narrow breakpoints — test Thai headline copy at every width; reduce the size or rewrite the copy.
