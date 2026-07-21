-- ---------------------------------------------------------------------------
-- Finance module: everything that moves money and is not a sale.
--
-- The app already knows what came in from the counter (`transactions`) and what
-- the goods cost (`transaction_items.buying_price_usd`). It knows nothing about
-- the rest of the business: fuel, salaries, rent, taxes, bank fees, money set
-- aside for investment. These tables record that, so the books can finally
-- answer "did the business actually make money this month".
--
-- Three rules carried over from the rest of the schema:
--
--   1. Every amount is stored in USD. `amount_usd` is the canonical figure.
--   2. A bolivar payment also stores the bolivares paid AND the rate used
--      (`amount_bs`, `rate_used`, `rate_key`). Without the rate, changing the
--      honest rate later would silently restate what a past expense cost.
--   3. Merchandise purchases are NOT an operating expense. They are inventory
--      bought with cash. The P&L takes its cost of goods from the snapshot on
--      each sale line; recording the purchase as an expense too would count the
--      same money twice. That is what `nature = 'cogs'` means below: cash out
--      now, expense later, when the item is actually sold.
--
-- Run 0000_preflight_single.sql first. This migration is additive and can be
-- undone with 0002_rollback.sql.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- Where money physically sits
-- ---------------------------------------------------------------------------
-- `basis` is the currency the account actually holds, which is not a display
-- preference: bolivares sitting in a bank account lose dollar worth every day
-- the rate moves, and the accounts panel reports that loss. A USD account has
-- no such exposure.
create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'cash'
    check (kind in ('cash', 'bank', 'digital', 'credit', 'other')),
  basis text not null default 'USD' check (basis in ('USD', 'BS')),
  opening_balance_usd numeric not null default 0,
  -- Only meaningful for BS accounts: the bolivares held at the opening date,
  -- so the devaluation figure has a starting point.
  opening_balance_bs numeric not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  -- Which sale payment methods land in this pot ("Efectivo", "Zelle", "Pago
  -- móvil"). Declared, never guessed: without it the module knows what was
  -- sold but not where the money went, and cash on hand would be a fiction.
  -- Methods nobody claims are reported as unassigned rather than hidden.
  payment_methods text[] not null default '{}',
  notes text not null default '',
  created_at timestamp with time zone not null default now()
);

create unique index if not exists finance_accounts_name_key
  on public.finance_accounts (lower(name));

-- ---------------------------------------------------------------------------
-- What the money was for
-- ---------------------------------------------------------------------------
-- `nature` is what makes the P&L structural rather than a flat list:
--   cogs       merchandise bought for resale - cash out, never an expense
--   fixed      owed whether or not anything sells (rent, salaries, internet)
--   variable   scales with activity (fuel, freight, bank commissions)
--   tax        withheld or owed to the state
--   investment profit deliberately set aside, not consumed
--   owner      money the owner took out - not a business cost
-- Break-even uses `fixed`. Investment and owner sit below the net-profit line.
create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  nature text not null default 'variable'
    check (nature in ('cogs', 'fixed', 'variable', 'tax', 'investment', 'owner', 'other')),
  -- Null means "no budget set". Zero would mean "must not spend anything",
  -- which is a different statement.
  monthly_budget_usd numeric check (monthly_budget_usd is null or monthly_budget_usd >= 0),
  color text,
  archived boolean not null default false,
  created_at timestamp with time zone not null default now(),
  unique (name, kind)
);

-- ---------------------------------------------------------------------------
-- Who the money went to (or came from)
-- ---------------------------------------------------------------------------
create table if not exists public.finance_payees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'other'
    check (kind in ('employee', 'supplier', 'landlord', 'service', 'government', 'customer', 'other')),
  phone text not null default '',
  -- Needed the moment anything touches a formal invoice or SENIAT.
  cedula_rif text not null default '',
  notes text not null default '',
  -- Employees only: what the payroll run should propose.
  base_salary_usd numeric check (base_salary_usd is null or base_salary_usd >= 0),
  pay_cadence text check (pay_cadence is null or pay_cadence in ('weekly', 'biweekly', 'monthly')),
  active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create unique index if not exists finance_payees_name_key
  on public.finance_payees (lower(name));

-- ---------------------------------------------------------------------------
-- Standing obligations that repeat
-- ---------------------------------------------------------------------------
-- Occurrences are NOT generated by a scheduler. The client walks the cadence
-- from `anchor_date`, sees which dates are due and not yet recorded, and offers
-- them for one-click posting. `finance_entries.period_key` plus a unique index
-- is what makes that safe to run from three devices at once.
create table if not exists public.finance_recurring (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  category_id uuid references public.finance_categories (id) on delete set null,
  account_id uuid references public.finance_accounts (id) on delete set null,
  payee_id uuid references public.finance_payees (id) on delete set null,
  amount_usd numeric not null check (amount_usd > 0),
  cadence text not null
    check (cadence in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  anchor_date date not null default current_date,
  -- Stops proposing occurrences after this date. Null means indefinitely.
  ends_on date,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamp with time zone not null default now()
);

-- ---------------------------------------------------------------------------
-- Profit deliberately set aside
-- ---------------------------------------------------------------------------
-- "Keep 20% of the profit for stock, 10% for the emergency fund." The rule
-- states what SHOULD be set aside; the transfers tagged with the allocation say
-- what actually was. The gap between the two is the whole point.
create table if not exists public.finance_allocations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  basis text not null default 'net_profit'
    check (basis in ('gross_sales', 'gross_profit', 'net_profit')),
  percent numeric not null check (percent > 0 and percent <= 100),
  -- Where the money is parked once it is actually moved.
  account_id uuid references public.finance_accounts (id) on delete set null,
  target_usd numeric check (target_usd is null or target_usd >= 0),
  active boolean not null default true,
  notes text not null default '',
  created_at timestamp with time zone not null default now()
);

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------
create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense', 'transfer')),
  -- `pending` is an obligation that exists but has not been settled: an unpaid
  -- bill (payable) or money owed to the business (receivable). It never touches
  -- an account balance until it is marked paid.
  status text not null default 'paid' check (status in ('paid', 'pending', 'void')),
  occurred_on date not null default current_date,
  due_on date,
  category_id uuid references public.finance_categories (id) on delete set null,
  account_id uuid references public.finance_accounts (id) on delete set null,
  counter_account_id uuid references public.finance_accounts (id) on delete set null,
  payee_id uuid references public.finance_payees (id) on delete set null,
  amount_usd numeric not null check (amount_usd > 0),
  -- The bolivares that actually changed hands, and the rate that valued them.
  -- Kept together: either all three are present or none are.
  amount_bs numeric check (amount_bs is null or amount_bs >= 0),
  rate_used numeric check (rate_used is null or rate_used > 0),
  rate_key text check (rate_key is null or rate_key in ('USD', 'EUR', 'USDT')),
  paid_in text not null default 'USD' check (paid_in in ('USD', 'BS')),
  description text not null default '',
  notes text not null default '',
  -- Free dimension for slicing without new columns: a plate number for fuel, a
  -- job name for a repair, "navidad" for a seasonal push.
  tags text[] not null default '{}',
  attachments text[] not null default '{}',
  recurring_id uuid references public.finance_recurring (id) on delete set null,
  -- Which occurrence of the recurrence this is (the due date, ISO). Paired with
  -- recurring_id it makes posting idempotent across devices.
  period_key text,
  allocation_id uuid references public.finance_allocations (id) on delete set null,
  created_by text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  -- A transfer moves money between two accounts and has no category: it is not
  -- income and not an expense, and counting it as either would inflate both.
  constraint finance_entries_shape check (
    case
      when kind = 'transfer'
        then counter_account_id is not null
             and account_id is not null
             and counter_account_id <> account_id
             and category_id is null
      else counter_account_id is null
    end
  ),
  -- A bolivar payment without its rate cannot be re-valued honestly later.
  constraint finance_entries_bs_provenance check (
    paid_in = 'USD' or (amount_bs is not null and rate_used is not null)
  )
);

-- Two devices posting the same salary run must collapse into one row.
create unique index if not exists finance_entries_occurrence_key
  on public.finance_entries (recurring_id, period_key)
  where recurring_id is not null and period_key is not null;

-- The ledger is always read as "this period, newest first".
create index if not exists finance_entries_occurred_idx
  on public.finance_entries (occurred_on desc);
-- The obligations inbox reads only what is still owed.
create index if not exists finance_entries_pending_idx
  on public.finance_entries (due_on)
  where status = 'pending';
create index if not exists finance_entries_category_idx
  on public.finance_entries (category_id);
create index if not exists finance_entries_account_idx
  on public.finance_entries (account_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Sellers may read the ledger and record what they spend in the field (fuel,
-- a delivery, a repair) - that is the whole point of capturing an expense at
-- the moment it happens. Only admins may edit or delete anything, and only
-- admins may touch the definitions (accounts, categories, payees, rules), since
-- those reshape every report.
alter table public.finance_accounts enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_payees enable row level security;
alter table public.finance_recurring enable row level security;
alter table public.finance_allocations enable row level security;
alter table public.finance_entries enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'finance_accounts',
    'finance_categories',
    'finance_payees',
    'finance_recurring',
    'finance_allocations'
  ]
  loop
    execute format(
      'drop policy if exists %1$s_select_authenticated on public.%1$s', t);
    execute format(
      'create policy %1$s_select_authenticated on public.%1$s
         for select to authenticated using (true)', t);

    execute format('drop policy if exists %1$s_insert_admin on public.%1$s', t);
    execute format(
      'create policy %1$s_insert_admin on public.%1$s
         for insert to authenticated with check (public.is_admin())', t);

    execute format('drop policy if exists %1$s_update_admin on public.%1$s', t);
    execute format(
      'create policy %1$s_update_admin on public.%1$s
         for update to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);

    execute format('drop policy if exists %1$s_delete_admin on public.%1$s', t);
    execute format(
      'create policy %1$s_delete_admin on public.%1$s
         for delete to authenticated using (public.is_admin())', t);
  end loop;
end;
$$;

drop policy if exists finance_entries_select_authenticated on public.finance_entries;
create policy finance_entries_select_authenticated on public.finance_entries
  for select to authenticated using (true);

drop policy if exists finance_entries_insert_authenticated on public.finance_entries;
create policy finance_entries_insert_authenticated on public.finance_entries
  for insert to authenticated with check (true);

drop policy if exists finance_entries_update_admin on public.finance_entries;
create policy finance_entries_update_admin on public.finance_entries
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists finance_entries_delete_admin on public.finance_entries;
create policy finance_entries_delete_admin on public.finance_entries
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Completeness check
-- ---------------------------------------------------------------------------
-- The dashboard computes every figure in the browser from the ledger window it
-- holds. This answers how many rows really exist in the range, so the screen
-- can say out loud that it is looking at a partial window instead of quietly
-- under-reporting - same contract as report_summary.
create or replace function public.finance_summary(p_from timestamptz, p_to timestamptz)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'entries', count(*),
    'income_usd', coalesce(sum(amount_usd) filter (where kind = 'income' and status = 'paid'), 0),
    'expense_usd', coalesce(sum(amount_usd) filter (where kind = 'expense' and status = 'paid'), 0),
    'pending_usd', coalesce(sum(amount_usd) filter (where status = 'pending'), 0)
  )
  from public.finance_entries
  where occurred_on >= p_from::date and occurred_on <= p_to::date;
$$;

revoke all on function public.finance_summary(timestamptz, timestamptz) from public;
grant execute on function public.finance_summary(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
-- A shop that opens this screen for the first time should see something usable,
-- not an empty form asking it to invent an accounting structure. These are the
-- categories a small Venezuelan retailer actually has. All of them are
-- editable, and none are required.
insert into public.finance_accounts (name, kind, basis, sort_order)
values
  ('Caja (efectivo $)', 'cash', 'USD', 1),
  ('Caja (efectivo Bs)', 'cash', 'BS', 2),
  ('Banco (Bs)', 'bank', 'BS', 3),
  ('Zelle', 'digital', 'USD', 4),
  ('Binance / USDT', 'digital', 'USD', 5)
on conflict do nothing;

insert into public.finance_categories (name, kind, nature) values
  ('VENTAS', 'income', 'other'),
  ('SERVICIOS', 'income', 'other'),
  ('RENDIMIENTOS DE INVERSION', 'income', 'other'),
  ('OTROS INGRESOS', 'income', 'other'),
  ('COMPRA DE MERCANCIA', 'expense', 'cogs'),
  ('FLETE Y ENVIOS', 'expense', 'variable'),
  ('SUELDOS', 'expense', 'fixed'),
  ('BONOS Y COMISIONES', 'expense', 'variable'),
  ('ALQUILER', 'expense', 'fixed'),
  ('ELECTRICIDAD', 'expense', 'fixed'),
  ('AGUA', 'expense', 'fixed'),
  ('INTERNET Y TELEFONO', 'expense', 'fixed'),
  ('GASOLINA', 'expense', 'variable'),
  ('MANTENIMIENTO VEHICULOS', 'expense', 'variable'),
  ('MANTENIMIENTO LOCAL', 'expense', 'variable'),
  ('COMISIONES BANCARIAS', 'expense', 'variable'),
  ('PUBLICIDAD', 'expense', 'variable'),
  ('IMPUESTOS', 'expense', 'tax'),
  ('SEGURIDAD Y VIGILANCIA', 'expense', 'fixed'),
  ('LIMPIEZA Y INSUMOS', 'expense', 'variable'),
  ('INVERSIONES', 'expense', 'investment'),
  ('RETIRO DEL DUENO', 'expense', 'owner'),
  ('OTROS GASTOS', 'expense', 'variable')
on conflict (name, kind) do nothing;

commit;
