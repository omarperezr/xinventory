# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Small Venezuelan retail shops, sold as isolated per-client instances. Staff is
mixed-age — elderly owners and young employees alike use **every** part of the
app (selling, stock, finance, reports, social). No duty split by age. Many
users have low digital literacy; the elderly users are the usability floor:
if they cannot navigate a screen unaided, the screen is wrong.

Two roles exist technically (admin / seller, enforced by RLS), but both age
groups appear in both roles.

## Product Purpose

Inventory + point-of-sale for a shop: track products and stock, register
sales, see history, manage shop finances, read reports, plan social posts.
Success = a sale or stock change captured correctly in seconds, even offline,
by any staff member without training.

## Operating Context

- Primary device: personal Android phones (~360px wide, mid/low-end) at the
  shop counter — plus a shared tablet or PC for admin work and reports.
  Phone-first design; desktop is the secondary adaptation.
- Connectivity is unreliable: offline-first PWA, writes queue in an outbox
  and sync later. Users must always be able to tell "saved" from "pending".
- Venezuelan bi-currency reality: prices stored in USD, bolívares derived via
  an exchange rate (normally USDT). Staff quote both currencies constantly.
- UI language: Spanish (Venezuela).

## Capabilities and Constraints

- Stack: React 18, TypeScript, Vite, Tailwind 4, shadcn/Radix primitives,
  lucide icons, Supabase (Postgres + RLS) as the only backend.
- Modules gated at build time per client: Finanzas, Reportes, Redes. A client
  instance may lack any of them; the shell must look complete either way.
- Money invariants (from CLAUDE.md, non-negotiable): USD is source of truth;
  one honest rate; sales/finance rows snapshot cost and rate at write time;
  stock moves only via server RPCs with queued deltas; client is untrusted.
- Known gaps: no pagination/virtualization; full-table refetches.

## Brand Commitments

Standing visual preference (chosen 2026-08-13 after three direction rolls):
**the refined category standard, played straight** — simple, elegant,
minimalistic, made for inventory management. No themed metaphor worlds.
Craft bar: Square/Shopify POS × Linear/Things finish level. Light ground,
restrained palette, one accent, oversized legible money.

## Evidence on Hand

- Real running app with full feature set (src/app/...), Spanish copy.
- No marketing site, testimonials, or brand assets in repo. Do not fabricate.

## Product Principles

1. **The slowest user sets the pace.** Every flow must be completable by an
   elderly, low-digital-literacy user without help. Young users are fast on
   anything; old users are the constraint that matters.
2. **Phone at the counter is the real scene.** One-hand use, big targets,
   glanceable numbers, minimal typing.
3. **Never lie about money or sync.** Both currencies visible where money
   appears; saved vs pending always distinguishable.
4. **One obvious next step per screen.** Depth over density: fewer choices
   per screen beats fewer taps total.
5. **A module absent must not feel broken.** Build-time gating means the
   navigation adapts, never showing dead doors.

## Accessibility & Inclusion

Elderly users are a primary audience, not an edge case: large type and touch
targets, high contrast, plain-Spanish labels (no jargon, no icon-only
actions), forgiving forms, low reliance on memory or hidden gestures. Treat
WCAG AA as the floor.
