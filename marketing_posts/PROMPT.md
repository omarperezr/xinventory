# Prompt: generar posts de marketing (estilo aprobado v3 — 2026-07-22)

Copy-paste everything below the line into a new Claude Code session from the xinventory repo.

---

Using the credentials in `.env.local` (`POSTGRESQL_DIRECT`), read the `items` table and build Instagram/Facebook posts to sell the products I name below (or every item with `quantity > 0` if I name none). Download each item's images from the URLs in `items.images`.

## Output structure

- Everything goes in `marketing_posts/` at the project root.
- One directory per post: `product-name-slug_YYYY-MM-DD_HH-MM` (the time is the scheduled posting time).
- Schedule: **one post per day at 7:00 PM starting tomorrow** unless I say otherwise. Order strategically: hero product first, high-stock items early in the run.
- Each dir contains `imagen_01.jpg` (cover), `imagen_02+.jpg` (carousel slides when the item has several good photos), and `descripcion.txt` (the caption).
- Maintain `CRONOGRAMA.md`: a table of date / time / product / image count, sorted by date.

## Product naming

- Marketing copy uses MY spellings even when the DB differs. Known corrections: the ICH helmets are **ORDANOX** and **WESTSAY** (DB says ODANOX/WETSAY). If a DB name looks off, ask me instead of propagating it.

## Image design — approved v3 layout (follow exactly)

- Canvas **1080×1350 (4:5)** — works on both IG and FB.
- **THE PRODUCT IS THE PROTAGONIST**: fully visible (never cut off by canvas or crop), centered, as large as possible. Text may overlap it *a little*, never cover it.
- Product photos in this DB are small (~506×900). **Always super-resolve 4× first** with Real-ESRGAN compact — SRVGGNetCompact implemented in plain torch (no basicsr), weights `realesr-general-x4v3.pth` from the Real-ESRGAN GitHub releases. Naive LANCZOS upscaling looks pixelated and was rejected.
- **Open and look at every photo**; hand-tune a per-photo crop box to trim dead background. Don't over-zoom (nothing cut) and don't zoom out (product small/distant) — both were rejected.
- Background: the same photo cover-cropped, gaussian blur ~36, darkened ~50%; the sharp product sits on top with **feathered edges** — no visible frame.
- Typography: exactly 2 families — **Anton** (display lines, rendered then sheared ~0.22 for the oblique lean) + **Montserrat** Bold/SemiBold (everything else). Max 3 sizes per image, generous letter-spacing (tight tracking rejected), display type kept modest (oversized letters rejected twice).
- Layout, all centered symmetrically:
  1. **Ruta Marla logo top-center** (~340px wide): use `marketing_posts/assets/marla_logo.png`. If it must be rebuilt from the 150px source JPG: one SR pass, then flood from the border treating only the navy outline as walls (isolates outline + enclosed letter fill, discards the baked drop shadow), flatten colors to cream `(245,243,236)` / navy `(24,30,43)`. Naive cream-keying leaves shadow ghosts — rejected.
  2. **Title stack**: category in Montserrat Bold ~44px wide-tracked (e.g. "CASCO ABATIBLE") → brand/model huge in Anton oblique ≤96px (e.g. "ICH", "EDGE", "CG 150") → variant subtitle ~30px tracked, grey with key words in accent blue `rgb(85,169,255)` (e.g. "EDICIÓN **ORDANOX**").
  3. Product large in the middle band.
  4. **3–4 callout boxes** at the corners (TL, TR, BL, BR): 2px white outlined rectangles, translucent dark fill, Montserrat Bold ~23px uppercase, 1–2 lines.
     **Connector lines are intentional**: each line leaves the box vertically, bends once, and ends in a ring+dot **on the exact feature the label mentions** (DOBLE VISOR → the visor, ARMADURA → the shoulder protector, CONEXIÓN DIRECTA → the wiring, CON CAPUCHA → the hood…). Never a decorative line that just points down. To place targets: render drafts, overlay a 100px coordinate grid, read each feature's canvas position, hardcode per-post targets. Generic labels with no visible feature may use a short plain line.
  5. Bottom-center: one-line **statement** in Anton oblique ~58px ending in a period (e.g. "DOMINA EL ASFALTO.") — a slogan, never the product name; under it `ESCRÍBENOS POR DM` centered in accent blue with a **drawn triangle** ▸ (fonts lack the glyph — never rely on it).
  - Gradient scrims top and bottom for legibility.
- Carousel slides: same background treatment, logo top-center (~280px), product big and centered, statement + CTA centered at the bottom. No callouts on slides.
- **Verify renders visually** (open the generated files) and iterate before calling it done.

## Copy rules — Spanish (Venezuela)

- **No prices anywhere** — "precio por DM" approach.
- Generic CTA only; no handles, phone numbers, or addresses.
- **Honest claims only**: nothing that can't be defended from the DB `notes` or what's visible in the photo ("doble visor" ok; "certificada" only if a DOT sticker is visible; state real limitations plainly, e.g. "no incluye marcador de gasolina"). If DB notes contradict themselves, flag it to me instead of guessing.
- `descripcion.txt` structure (research current caption best practices online first and cite sources):
  1. Hook in the first 10–12 words (before Instagram's "ver más" fold).
  2. Short benefit bullets (▪️) — benefits, not just features.
  3. Real scarcity only ("🚨 Última unidad" only when quantity is actually 1).
  4. ONE specific CTA — e.g. `Comenta "CASCO"`, `Comenta tu TALLA`, `Comenta el COLOR` (specific CTAs outperform vague ones by ~40%).
  5. 3–5 targeted hashtags (#MotosVenezuela #Motero + product-specific), never generic ones like #love.
  - 150–220 words. Emojis in captions are fine; no emoji on images (PIL fonts can't render them).

## Process

- Research design/copy best practices online before creating anything; don't answer from memory.
- Show me one finished cover for approval **before** generating the whole batch.
