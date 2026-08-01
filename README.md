# xinventory

Inventory and point-of-sale app for small retail businesses in Venezuela, where
prices are quoted in dollars but customers pay in bolivares at a rate that
changes daily. Works offline. Mobile-first. Sold to clients as isolated
instances, with optional paid modules.

## Features

- **Inventory** — product catalog with swipeable photo galleries, stock,
  per-item history, bulk Excel import
- **Sales** — cart, split payments, change calculation, returns
- **Offline first** — reads fall back to a local cache, writes queue in an
  outbox and replay when the connection returns
- **Roles** — admins manage users, prices and rates; sellers ring up sales
- **WhatsApp sharing** — sends the product photo + details ready to forward

Paid modules (see below):

- **Finanzas** — expenses, income, accounts, budgets, supplier purchases
- **Reportes** — five-panel dashboard, PDF/Excel export
- **Redes** — AI-generated social posting calendar

## Paid modules

Each client instance ships only the modules they paid for. Three flags decide
it **at build time**:

```
VITE_MODULE_FINANZAS=true
VITE_MODULE_REPORTES=true
VITE_MODULE_REDES=true
```

Anything other than `true` (including unset) excludes the module — its code is
removed from the JavaScript bundle entirely, not hidden. There is nothing to
unlock in the browser. The Redes server endpoint has its own server-side
switch, `MODULE_REDES`, and returns 404 without it.

Flag logic lives in `src/app/modules.ts`.

## How money works

**Every price is stored in USD.** Bolivar amounts are derived using a rate.
The app knows three rates:

| Rate | Source | Purpose |
|------|--------|---------|
| USDT | Binance P2P (via `/api/usdt-rate`) | The parallel rate businesses actually trade at |
| USD  | BCV official | Shown because customers ask for it |
| EUR  | BCV official | Same, for euros |

One rate is marked **honest** (normally USDT): all bookkeeping uses it. The
others are **reference lenses** — while one is selected the app blocks money
entry, because the amount would be recorded at the wrong value.

Sales snapshot their own cost and rate at write time, so editing a product or
the rate never rewrites past sales.

## Stack

- **Frontend** — React 18, TypeScript, Vite, Tailwind, Radix UI, embla carousel
- **Backend** — Supabase (Postgres, Auth, Storage, RLS) — no server of our own;
  access rules live in Postgres
- **Serverless** — Vercel functions: `usdt-rate` (Binance rate),
  `social-generate` (Redes AI batch, daily cron), `storage-cleanup` (weekly cron)
- **Edge function** — `admin-users` (Supabase): user create/update/delete,
  admin-gated

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key, module flags
npm run dev
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Local dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typechecks, then builds to `dist/` |

The anon key is safe in the browser; Row Level Security protects the data.

## Creating a new client instance

One script provisions everything: Supabase project + schema + admin user +
edge function + Vercel project + deploy.

```bash
./scripts/new-client.sh <client-name> [--finanzas] [--reportes] [--redes] \
    [--admin-email a@b.c] [--admin-name "Nombre"] [--region us-east-1]
```

Example — client "acme" who bought Finanzas and Redes:

```bash
./scripts/new-client.sh acme --finanzas --redes --admin-email admin@acme.com
```

**Tokens.** The script needs one Supabase token and one Vercel token. Put them
in `.env` (gitignored):

```
SUPABASE_NEW_CLIENT=sbp_...   # supabase.com/dashboard/account/tokens
VERCEL_NEW_CLIENT=...         # vercel.com/account/settings/tokens
```

Or pass `--supabase-token` / `--vercel-token`. Missing tokens are prompted.
Using tokens from different accounts is fine — that is how you spread clients
across Supabase accounts.

**What it does, in order:**

1. Creates the Supabase project (random DB password) and waits until healthy
2. Applies every migration in `supabase/migrations/`
3. Creates the first **admin user** (email confirmed, password generated
   unless given)
4. Deploys the `admin-users` edge function
5. Creates the Vercel project, sets all env vars, deploys to production

**What you get:** the live URL, and a `.env.<client-name>` file (chmod 600,
gitignored) with every credential of the instance — Supabase keys, direct
Postgres URL, cron secret, admin login, module flags. Guard that file.

Requires: `supabase`, `vercel`, `jq`, `openssl` CLIs.

## Database

Schema lives in `supabase/migrations/`, split by module:

| File | Contents |
|------|----------|
| `..._core.sql` | profiles, items, sales, settings, stock RPCs, guard triggers, RLS, product-images bucket |
| `..._finanzas.sql` | accounts, categories, payees, entries, purchases, purchase RPCs, RLS |
| `..._redes.sql` | social config/posts/promoted, social-posts bucket, RLS |

All three are pushed to every instance — tables of unsold modules sit empty
and admin-locked; the UI and server for them simply do not exist there.

Key invariants the schema enforces:

- **Stock never moves from the client.** Checkout calls `decrement_stock`,
  which subtracts atomically and fails on insufficient stock. Returns go
  through `return_transaction_item`.
- **Triggers guard columns RLS cannot.** Sellers can update items (stock) but
  the guard triggers silently keep prices, discounts and roles unchanged
  unless the caller is admin.
- **New auth users get a `profiles` row automatically** (trigger), with the
  role from their metadata.

Manual apply, if ever needed:

```bash
supabase db push --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
supabase functions deploy admin-users --project-ref <ref>
```

## Deploying

**Vercel (normal path).** One Vercel project per client, all from this repo.
Env vars per project: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, the three `VITE_MODULE_*` flags,
and `MODULE_REDES`. The script sets all of these.

**Docker (alternative frontend host).** The image bakes the module flags at
build time and serves the static app; `/api/*` is proxied to wherever the
serverless functions live:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<key> \
  --build-arg VITE_MODULE_FINANZAS=true \
  -t xinventory-acme .

docker run -p 8080:80 -e API_ORIGIN=https://acme.vercel.app xinventory-acme
```

Crons (`social-generate` daily, `storage-cleanup` weekly) run on Vercel via
`vercel.json`; a pure-Docker deployment needs a host cron calling those
endpoints with the `CRON_SECRET` bearer.

## Known gaps

- `refreshData()` refetches whole tables after several operations; first thing
  to hurt as catalogs grow.
- Transactions and item history are fetched without pagination; long lists are
  not virtualized.
- Finanzas has no receipt attachments UI and no PDF/Excel export yet.
- Purchases screen is online-only, without pagination.
