# xinventory

Inventory and point-of-sale app for small retail businesses in Venezuela, where
prices are quoted in dollars but customers pay in bolivares at a rate that
changes daily. Works offline, because mobile data in a shop is not reliable.

## How money works

This is the part of the app to understand before changing anything else.

**Every price is stored in USD.** That is the real price of a product, and it
does not change just because an exchange rate moved.

Bolivar amounts are derived from that USD price using a rate. The app knows
three rates:

| Rate | Where it comes from | What it is for |
|------|---------------------|----------------|
| USDT | Binance P2P, through our own serverless endpoint | The parallel rate most businesses actually trade at |
| USD  | BCV (official), through Alcambio | The government rate, shown because customers ask for it |
| EUR  | BCV (official), through Alcambio | Same, for euros |

One of these is marked the **honest rate**: the rate that says what a bolivar is
really worth. An admin picks it in the rates panel, and it is normally the
Binance USDT rate. All bookkeeping uses it. When a customer pays in bolivares,
the amount is divided by the honest rate to get the dollars the business
actually received.

The other rates are **reference lenses**. They restate prices at a rate we do
not treat as real, so you can show a customer the BCV figure. While a reference
lens is selected, the app will not let anyone enter or edit money, because the
amount would be recorded at the wrong value. A banner explains this on screen.

Two consequences worth remembering:

- Buying something quoted at the BCV rate genuinely is a cheaper purchase in
  real terms, and the books reflect that. It is not a bug.
- Showing a price and entering a price are different operations. They use
  different code paths on purpose (`convertPrice` for display, `bsToUsd` and
  `usdToBs` for entry) and must never be wired to the same input field. When
  they were, simply focusing and leaving a price field silently rewrote the
  stored price.

## Features

- **Inventory** - product catalog, stock, per-item history, bulk Excel import
- **Sales** - cart, split payments across methods, change calculation, returns
- **Reports** - revenue, cost, margin, per-seller and per-product breakdowns,
  exportable to PDF and Excel
- **Offline first** - reads fall back to a local cache, writes queue in an
  outbox and replay when the connection returns
- **Roles** - admins manage users, prices and rates; sellers ring up sales
- **WhatsApp sharing** - builds a ready-to-send product message, since that is
  where these shops sell

## Stack

- **Frontend** - React 18, TypeScript, Vite, Tailwind, Radix UI, MUI
- **Backend** - Supabase (Postgres, Auth, Storage, Row Level Security)
- **Serverless** - one Vercel function that fetches the Binance P2P rate,
  because Binance blocks direct browser requests
- **Offline storage** - IndexedDB cache plus a sync outbox

## Architecture notes

**There is no backend of our own.** The browser talks to Supabase directly, so
every access rule lives in Postgres. Row Level Security decides which rows a
user can touch, and triggers decide which *columns* they can change. Policies
cannot express per-column rules, and several tables allow broad updates so that
sellers can adjust stock and register returns.

**Stock never moves from the client.** Checkout calls `decrement_stock`, a
Postgres function that subtracts and fails when there is not enough. Doing that
arithmetic in the browser meant two sellers ringing up the same product could
overwrite each other. Returns work the same way through
`return_transaction_item`, which records the return and restocks in a single
transaction.

**Offline writes queue intentions, not results.** A queued stock change stores a
delta such as "minus two", never "set quantity to eight". An absolute value
captured while offline would wipe out any sale another device made in the
meantime.

**Sales snapshot their own cost and rate.** Each line stores the buying price at
the time of sale, and each transaction stores which honest rate was used.
Without that, editing a product's cost would silently rewrite the margin on
every past sale.

## Running it

```bash
npm install
cp .env.example .env.local   # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Other commands:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # typechecks first, then builds
```

The anon key is safe to ship in the browser bundle. It is not a secret; Row
Level Security is what protects the data.

## Database

Schema and policies live in `supabase/migrations/`.

- `0000_preflight_single.sql` - read-only audit. Run it before a migration to
  check column names, existing policies, and rows that would violate new
  constraints.
- `0001_security_and_integrity.sql` - column-level guards, constraints, the
  atomic stock functions, and indexes.
- `0001_rollback.sql` - removes what `0001` added, if something goes wrong.

Apply them through the Supabase SQL editor or `supabase db push`, and take a
backup first. Database dumps are gitignored and must never be committed.

## Known gaps

An honest list of what is not done yet:

- `refreshData()` still refetches the whole `items` and `item_history` tables
  after several operations. This is the first thing that will hurt as the
  catalog grows.
- Transactions and item history are fetched without pagination.
- Long lists are not virtualized.
- Most icon-only buttons still lack accessible labels, and a few clickable rows
  cannot be reached by keyboard.
- `xlsx@0.18.5` has known vulnerabilities with no fix published on npm. It needs
  to move to the SheetJS CDN build or be replaced.
