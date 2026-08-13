---
version: 1
slug: "src-app-app-tsx"
primary_target: "src/app/App.tsx"
related_targets: []
---

# Surface: app shell + all views (whole-app redesign 2026-08)

Mode: Operate. Audience: mixed-age Venezuelan shop staff (elderly = usability floor), phone-first at the counter, unreliable connectivity.

Direction: category standard played straight (user standing exit after three re-rolls; steer "simple, elegant, minimal, made for inventory"). Craft bar: Square/Shopify POS × Linear/Things.

Chosen system: white cards on cool paper (#f3f5f4), near-black ink, one money-green accent (#0f7b4d), amber = pending/not-real money, red = destructive/out-of-stock. Atkinson Hyperlegible Next (self-hosted). Base 17px, controls ≥48px. Dual currency at equal weight everywhere current prices show (PriceTag: $ · Bs); es-VE number format. Dialogs are bottom sheets on phones. Bottom nav ≤5 labeled tabs: Vender / Cobrar / Historial / Inventario(admin) / Más. Offline state = full-width strip above tab bar.

Memorable moment: adding to cart pops the floating green "Cobrar" strip with dual-currency total.

Rules that must survive future work: PriceTag only for CURRENT prices (it converts at today's honest rate) — historical/snapshotted rows print their stored figures; reference-lens guards stay; no icon-only primary actions.

Unresolved: per-client shop name/logo still hardcoded "Inventario"; dark theme tokens exist but nothing toggles them.
