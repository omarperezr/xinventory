# xinventory

Inventory management app for small retail businesses in Venezuela's multi-currency
cash economy (VES/USD/EUR). Offline-first, with Supabase as the backend and
real-time exchange-rate integration.

## Features

- **Inventory management** — product catalog, stock tracking, per-item history,
  admin controls, and sales reports/exports
- **Offline-first sync** — reads/writes go through a local cache + outbox
  (IndexedDB), queuing changes made while offline and replaying them against
  Supabase once connectivity returns
- **Multi-currency pricing** — prices stored canonically in USD, displayed live
  in VES/USD/EUR using a serverless exchange-rate endpoint
- **Binance P2P exchange rate integration** — a Vercel serverless function
  (`api/usdt-rate.ts`) scrapes and averages Binance P2P VES/USDT sell-side rates,
  working around Binance's CORS/Cloudflare blocks on direct browser requests —
  used as the app's real-world VES reference rate
- **WhatsApp product sharing** — generates share-ready product captions for
  WhatsApp, the dominant sales channel for small retailers in the region
- **Excel import** — bulk-load inventory from spreadsheets
- **Auth + row-level security** — Supabase Auth with RLS-gated data access

## Stack

- **Frontend:** React, TypeScript, Vite, MUI, Radix UI
- **Backend:** Supabase (Postgres, Auth, Storage, Row Level Security)
- **Serverless:** Vercel Functions (TypeScript) for third-party API integration
- **Offline storage:** IndexedDB-backed local cache and sync outbox

## Running the code

```bash
npm i
cp .env.example .env.local   # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```
