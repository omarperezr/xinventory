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
- **Reports** - a five-panel dashboard covering past, present and future (see
  below), exportable to PDF and Excel
- **Finanzas** - the money that is not a sale: expenses, other income, salaries,
  accounts, recurring bills, budgets, supplier purchases and returns (see below)
- **Offline first** - reads fall back to a local cache, writes queue in an
  outbox and replay when the connection returns
- **Roles** - admins manage users, prices and rates; sellers ring up sales
- **WhatsApp sharing** - builds a ready-to-send product message, since that is
  where these shops sell

## Reports

One date-range filter scopes five panels, each answering a different question:

| Panel | Question it answers |
|-------|---------------------|
| Resumen | How is the business doing versus the previous equivalent period, and what needs attention today |
| Ventas | When demand happens (weekday, hour), who closes it, how customers pay |
| Productos | Which items carry the business — ABC/Pareto, margins, price realization, returns |
| Inventario | What is on the shelf, what it costs to keep, what is about to run out or never moves |
| Proyección | Where sales are heading and what to buy to cover the next 15/30/60 days |

Three things are worth knowing before changing this area.

**All of it is computed in the browser.** `services/report-analytics.ts` is pure:
it takes the loaded sales history plus the live catalogue and returns view
models, all in USD. The panels convert to the display currency at render time.
Crossing sales with the catalogue is what makes the forward-looking reports
possible — velocity comes from the history, remaining stock from `items`.

**The database is asked one question only:** how many sales really exist in the
selected range (`report_summary`). When that count exceeds what the browser
holds, the screen says so and offers to load more, instead of quietly
under-reporting. Every figure still comes from the local pipeline, so the two
can be compared.

**Payment mix is attributed, not summed.** A cash payment is recorded as the
note handed over, so raw amounts routinely exceed the sale total — summing them
turns a $50 sale into $62 of "cash income". Each transaction's total is split
across its methods in proportion to what was tendered, and sales that recorded
no payment at all are reported separately rather than folded in.

Chart colours live in `components/reports/report-ui.tsx` and are validated for
colour-vision deficiency against a white surface. Three slots fall below 3:1
contrast, which is why every chart also ships a legend, a tooltip and a table
or direct labels — colour is never the only way to read a value.

## Finanzas

The counter knows what came in. This module covers everything else: fuel,
salaries, rent, taxes, bank fees, money set aside for investment, and the
purchases that turn cash into stock.

**Buying stock is not an expense.** It converts cash into inventory. The cost
reaches the profit statement later, when the item sells, from the snapshot each
sale line already carries. So a purchase appears in the cash flow immediately
and in the profit statement never — what appears there is cost of goods sold.
Recording both would charge the business twice for the same money and make any
month with a big restock look like a catastrophe.

That distinction is what a category's `nature` encodes:

| nature | Where it lands |
|--------|----------------|
| `cogs` | Cash flow only — stock bought for resale |
| `fixed` | Profit statement, and the denominator of break-even |
| `variable` | Profit statement |
| `tax` | Profit statement |
| `investment` | Below the net profit line — profit set aside, not consumed |
| `owner` | Below the net profit line — money taken out, not a cost |

Names are the shop's to change; the buckets are the app's. Nothing in the code
looks up an account, category or payee by name, so all of them can be renamed,
archived or deleted. What ships seeded is a starting point, inserted only when
the tables are empty.

Seven panels, one date filter, all computed in the browser like the reports:

| Panel | Question it answers |
|-------|---------------------|
| Resumen | Did the business make money, and can it keep paying for itself |
| Movimientos | Everything that moved, filterable by category, account or tag |
| Obligaciones | What is owed, what is owed to us, what repeats |
| Presupuesto | Where the money went against where it was supposed to go |
| Cuentas | How much exists, in which pot, and what bolivares cost to hold |
| Compras | Merchandise that arrived, from whom, at what landed cost |
| Proveedores | Standing with each supplier, and who sells the same thing cheaper |

Four things are worth knowing before changing this area.

**Bolivar movements carry their own rate.** A payment in bolivares stores the
bolivares, the rate and which rate it was, stamped once at write time by
`finance-context.tsx`. No screen can skip it. Without that, changing the honest
rate would restate what every past expense cost.

**Bolivar accounts report their own devaluation.** A pot that holds bolivares is
booked at what each bolivar was worth on arrival; today those bolivares buy
fewer dollars. The gap is a real cost of holding bolivares, and it is invisible
in a ledger that only tracks dollars.

**Sales money is routed by declared method, never guessed.** An account lists
the payment methods that land in it ("Efectivo", "Zelle"). Takings whose method
no account claims are reported as unassigned instead of being silently dropped —
otherwise "cash on hand" would be a fiction.

**Recurring bills are proposed, never posted automatically.** There is no
scheduler. The client walks each rule's cadence, compares it against what is
already recorded and offers what is missing. `finance_entries(recurring_id,
period_key)` is unique, so two devices confirming the same salary produce one
row.

Purchases are the only way stock rises with money attached. Editing the quantity
on the item form is now an *ajuste de inventario* and demands a reason (breakage,
theft, a physical count, a sample). Both doors stay open, but the history can
finally tell them apart, and the Excel import counts as an adjustment too.

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
- `0002_finance.sql` - the ledger: accounts, categories, payees, recurring
  rules, allocations, entries, plus `finance_summary`. Seeds a default set of
  accounts and categories only when those tables are empty.
- `0003_purchases.sql` - suppliers per item, purchases, purchase returns, the
  `post_purchase` / `post_purchase_return` functions, and the extra
  `item_history` actions those movements need.
- `0002_rollback.sql`, `0003_rollback.sql` - undo either one. They delete
  recorded money, not just structure, so back up first.

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
- Finanzas has no receipt attachments yet. The columns exist on entries and
  purchases; only the upload UI and a storage bucket are missing.
- Finanzas has no PDF or Excel export. The reports module already has both and
  the analytics output is shaped the same way, so it is mostly wiring.
- Purchases are read online only, without pagination. The ledger itself is
  cached and paginated; the purchase screen is admin-facing and was left simple.
