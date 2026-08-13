---
name: xinventory
description: A counter tool the slowest user operates unaided — POS clarity, dual-currency money, one green accent.
colors:
  money-green: "#0f7b4d"
  money-green-deep: "#0c6a42"
  money-green-soft: "#e3f3ea"
  money-green-soft-ink: "#0a5c39"
  counter-ink: "#182420"
  cool-paper: "#f3f5f4"
  card-white: "#ffffff"
  quiet-ink: "#55625c"
  hairline: "#e3e8e6"
  hairline-strong: "#cfd6d3"
  pending-amber: "#8a5a06"
  pending-amber-soft: "#fdf2e0"
  pending-amber-strong: "#f5b73f"
  alert-red: "#bf2e2e"
  alert-red-soft: "#fceceb"
  alert-red-soft-ink: "#9c2323"
  selection-green: "#b9e2cd"
  selection-ink: "#0a3e27"
typography:
  root:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
  headline:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.45
  label-compact:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
  subtitle:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  display:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
  meta:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.45
  money-display:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
    fontVariation: "lining-nums tabular-nums"
rounded:
  sm: "6px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  pill: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.money-green}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "0 1.25rem"
  button-primary-hover:
    backgroundColor: "{colors.money-green-deep}"
  button-outline:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.counter-ink}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "0 1.25rem"
  button-soft:
    backgroundColor: "{colors.money-green-soft}"
    textColor: "{colors.money-green-soft-ink}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "0 1.25rem"
  button-destructive:
    backgroundColor: "{colors.alert-red}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "0 1.25rem"
  input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.counter-ink}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "0.25rem 0.875rem"
  chip-stock-ok:
    backgroundColor: "{colors.money-green-soft}"
    textColor: "{colors.money-green-soft-ink}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
  chip-stock-low:
    backgroundColor: "{colors.pending-amber-soft}"
    textColor: "{colors.pending-amber}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
  chip-stock-out:
    backgroundColor: "{colors.alert-red-soft}"
    textColor: "{colors.alert-red-soft-ink}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.counter-ink}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
---

# Design System: xinventory

## Overview

**Creative North Star: "The Counter Tool"**

A point-of-sale for Venezuelan shops that the slowest user at the counter operates unaided. The world is one calm light room: a cool paper ground, white cards, near-black green-tinted ink, and exactly one hue that means anything — a deep money green for confirmed actions and confirmed money. Two auxiliary signals exist and are never decorative: amber means "pending / not yet real" (offline outbox, reference-lens figures), red means destructive or out-of-stock. Everything else is grayscale-on-paper. The system deliberately refuses the dense admin-dashboard default: one obvious action per screen, oversized controls, money printed large in both currencies at equal weight.

Legibility is the material. The entire UI is set in Atkinson Hyperlegible Next (self-hosted; a CDN font is a font that vanishes at the counter), the base size is 17px so the whole rem grid runs ~6% larger than typical, and every comparable number is tabular. Density comes last: 48px is the *default* control height, not the large one.

**Key Characteristics:**
- One accent (money green); amber and red are state signals, never styling.
- Cool paper canvas behind white, hairline-bordered, soft-shadowed cards.
- 17px base type; hyperlegible face; tabular numerals for all money and quantities.
- Phone-first shell: five labeled bottom tabs on mobile, nav pills on desktop.
- Saved is always visually distinguishable from pending (green vs. amber).

## Colors

A one-accent light palette: green is the only voice, amber and red speak only about state.

### Primary
- **Money Green** (#0f7b4d): the single accent. Primary buttons, focus rings, caret color, active nav states, confirmed money. Hover deepens to **Money Green Deep** (#0c6a42).
- **Money Green Soft** (#e3f3ea) with **Soft Ink** (#0a5c39): active nav pills, "stock OK" chips, soft buttons, success notes — green presence without green weight.

### Neutral
- **Counter Ink** (#182420): all primary text; a near-black with a green cast so ink and accent share a family.
- **Cool Paper** (#f3f5f4): the page behind the cards (`--canvas`). Cards are pure white (#ffffff) on it.
- **Quiet Ink** (#55625c): secondary/muted text.
- **Hairline** (#e3e8e6) / **Hairline Strong** (#cfd6d3): borders and input strokes; strong doubles as the disabled/scrollbar/grabber gray.
- **Selection Green** (#b9e2cd) with **Selection Ink** (#0a3e27): the `::selection` browser surface — text selection stays in the green family.

### State (not decoration)
- **Pending Amber** (#8a5a06, soft #fdf2e0, strong #f5b73f): offline/outbox items, reference-lens Bs figures, low-stock chips. Amber money is money that is not yet real.
- **Alert Red** (#bf2e2e, soft #fceceb, soft ink #9c2323): destructive buttons, out-of-stock, overpaid rows, unsynced-error badges.

### Named Rules
**The One Voice Rule.** Green is the only accent. If a new element wants a hue, it must be expressing money-green confirmation, amber pendingness, or red danger — otherwise it is gray ink on paper. (The five `--chart-*` hues exist solely inside report charts and never leak into UI chrome.)

**The Amber-Means-Pending Rule.** Amber is never a warm decorative tone. It appears only on money or records that are not yet settled: queued offline writes, reference-lens conversions, low stock.

## Typography

**UI Font:** Atkinson Hyperlegible Next Variable (fallbacks: Atkinson Hyperlegible, system-ui, sans-serif) — weights 400–800 from one variable file, self-hosted.
**Display Font (social canvas only):** Anton + Montserrat, used exclusively by the Redes Sociales post-composer canvas; they are not UI faces.

**Character:** Engineered legibility over style — a face designed by the Braille Institute for maximum character distinction, sized generously (17px root) so elderly staff read it unaided.

### Hierarchy
- **Headline / h1** (700, 1.5rem, lh 1.3, ls -0.01em): screen titles.
- **Title / h2** (700, 1.25rem, lh 1.35, ls -0.01em): section and dialog titles.
- **Subtitle / h3** (600, 1.125rem, lh 1.4): card group headings.
- **Body** (400, 1rem = 17px, lh 1.45): default text and inputs.
- **Label / Button** (600, 1rem, lh 1.45): all labels and buttons are semibold at body size — never small caps, never tiny. A **compact label** step (600, 0.9375rem) exists for form labels and dense nav text.
- **Display** (700, 1.75rem): login brand, change-due figures, PriceTag `xl`.
- **Money Display** (700, up to 1.75rem via PriceTag `xl`): totals and prices; always tabular.
- **Meta** (500, 0.6875rem = ~11px, via `.text-meta`): the legibility floor — chips, timestamps, tab labels. Nothing readable ships below it.

### Named Rules
**The Tabular Money Rule.** Every element showing money or comparable quantities carries `data-money` (or lives in a table) and renders `lining-nums tabular-nums`. Numbers a user compares sit in a column somewhere.

**The Both-Currencies Rule.** Prices print as `$ X · Bs Y` at equal weight — that is how prices are spoken at the counter. Neither currency is the footnote.

## Layout

Phone-first (~360px Android at the counter), scaling to a shared tablet/PC. Content sits in a `max-w-7xl` centered container with 1rem side padding (2rem at `md`). Header is 4rem tall (4.5rem at `md`) with the day-rate chip always visible. Below `md`, navigation is a fixed five-tab bottom bar (Vender / Cobrar / Historial / Inventario / Más) with `env(safe-area-inset-bottom)` padding; action strips (the Cobrar total) dock just above it. At `md`+ the bottom bar disappears and nav pills move into the header. Spacing rhythm is the Tailwind rem scale on a 17px root — cards pad 1.5rem, list rows ~0.875–1rem; note that every rem value renders ~6% larger than on a 16px root.

**The 44px Floor Rule.** No interactive target under 44px. Default controls are 48px (`h-12`); 40px (`h-10`/`sm`) exists only for dense desktop toolbars, never for primary mobile actions.

## Elevation & Depth

Soft real shadows, tinted with the ink rather than pure black, over a tonal paper/card split. Depth is quiet: the canvas-vs-white contrast does most of the work; shadows confirm it.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px rgb(24 36 32 / 0.05), 0 4px 12px rgb(24 36 32 / 0.05)`): resting cards and white panels.
- **Raised** (`box-shadow: 0 2px 4px rgb(24 36 32 / 0.06), 0 10px 24px rgb(24 36 32 / 0.09)`): sheets, dialogs, the docked Cobrar strip — anything floating over content.

**The Ink-Shadow Rule.** Shadows are always the ink color at low alpha, never neutral black; there are exactly two levels. No hard offset shadows, no glows.

## Shapes

A single-radius family derived from `--radius: 0.75rem`: 6px (sm) for tiny chips/badges, 10px (md) for small controls, 12px (lg) for buttons/inputs/cards, 16px (xl) for large buttons and mobile sheets (bottom sheets round only the top, `rounded-t-2xl`). Status chips are full pills. Borders are 1px hairlines everywhere; no border means no edge — cards always carry both border and shadow.

## Components

### Buttons
- **Shape:** gently rounded (12px; 10px at `sm`, 16px at `lg`), semibold text, always with a visible label.
- **Primary:** money green fill, white text, 48px tall, `px-5`; hover deepens to #0c6a42; press scales to 0.98.
- **Focus:** 3px ring in green at 40% opacity (`focus-visible:ring-[3px]`).
- **Variants:** `destructive` (red fill), `outline` (white, strong hairline), `secondary` (paper-gray fill), `soft` (green-soft fill), `ghost`, `link`. Sizes: default 48px, `sm` 40px (desktop-dense only), `lg` 56px, `icon` 48×48.

### Chips
- **StockChip:** full pill, semibold, tabular; words not codes — "Agotado" (red-soft), "Quedan N u" (amber-soft) below 10, "N u" (green-soft) otherwise.
- **Nav/segment pills:** soft-green fill when active, transparent/gray otherwise; segmented controls sit in a `bg-secondary` track with 4px inset, each segment ≥44px.

### Cards / Containers
- **Corner:** 12px. **Background:** white on cool paper. **Border:** 1px hairline, always. **Shadow:** Card level. **Padding:** 1.5rem (1rem on dense mobile lists). Inset sub-panels (totals rows, empty states) flip to the canvas color inside the white card.

### Inputs / Fields
- **Style:** white fill, 1px strong-hairline stroke, 12px radius, 48px tall, body-size text.
- **Focus:** border turns green + 3px green ring at 30%; caret is green.
- **Error:** red border + red ring at 20% (`aria-invalid`).

### Dialogs / Sheets
One component, two shapes: below `sm` every dialog is a bottom sheet (full-width, `rounded-t-2xl`, grabber bar, max 92dvh, slides up, safe-area padding); at `sm`+ it is a centered `max-w-lg` card at 16px radius. Overlay is black/50. Close button is a 40px target labeled "Cerrar".

### Navigation
- **Mobile:** fixed bottom bar, five equal tabs, icon + always-visible Spanish label, 12px-rounded active area in soft green; cart badge is a red pill counter. The "Más" sheet holds everything that doesn't deserve a permanent tab, as 44px+ white rows with soft-green icon tiles.
- **Desktop:** header nav pills, semibold small text, soft-green active state.

### PriceTag (signature)
The app's one way to print a current price: `$ X · Bs Y` inline at equal weight, separated by a gray middot, tabular, in four sizes (sm → xl/1.75rem bold). The Bs side always converts at today's honest rate; while a reference lens (BCV/EUR/USDT view) is active it shows that lens's figure in pending amber with a "ref." suffix.

**The Snapshot Rule.** PriceTag is only for *current* prices. Historical and snapshotted rows (sales, finance entries) must print their stored figures via `formatMoneyValue` — never re-convert past money at today's rate.

**The Honest Rate Rule.** While a reference lens is selected, money entry is blocked and lens figures are visibly amber + "ref."; only honest-rate money looks settled.

## Do's and Don'ts

### Do:
- **Do** print every current price with `PriceTag`, and every stored/historical figure with `formatMoneyValue` from its snapshot — the Snapshot Rule is a money-correctness rule, not a style preference.
- **Do** mark every money/quantity element with `data-money` for tabular numerals.
- **Do** keep default controls at 48px and every target ≥44px; `sm` sizes are desktop-dense only.
- **Do** display numbers in es-VE format (`1.234,56`) while accepting dot-decimal keyboard entry.
- **Do** give every primary action a visible text label (Spanish); icons accompany, never replace.
- **Do** use amber exclusively for pending/unsynced/reference states and red exclusively for destructive/out-of-stock.

### Don't:
- **Don't** introduce a second accent hue; the chart palette stays inside charts.
- **Don't** ship icon-only primary actions or sub-44px targets anywhere staff transacts.
- **Don't** re-convert historical money at today's rate, restyle a past row's figures, or show lens-rate money without the amber "ref." treatment.
- **Don't** use Anton/Montserrat outside the social-composer canvas; the UI face is Atkinson Hyperlegible Next only.
- **Don't** rely on the `.dark` token block: it exists but is never toggled — the shipped product is light-only, and new surfaces are designed against the light tokens.
- **Don't** drop below the 17px root or use hard offset shadows, glows, or borderless floating cards.
