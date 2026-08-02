-- Finanzas module: accounts, categories, payees, entries, purchases.
-- Inert for instances without the module: no UI ships, writes are admin-only.

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'cash' check (kind in ('cash','bank','digital','credit','other')),
  basis text not null default 'USD' check (basis in ('USD','BS')),
  opening_balance_usd numeric not null default 0,
  opening_balance_bs numeric not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  payment_methods text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists finance_accounts_name_key on public.finance_accounts (lower(name));

create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income','expense')),
  nature text not null default 'variable' check (nature in ('cogs','fixed','variable','tax','investment','owner','other')),
  monthly_budget_usd numeric check (monthly_budget_usd is null or monthly_budget_usd >= 0),
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists finance_categories_name_kind_key on public.finance_categories (name, kind);

create table if not exists public.finance_payees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'other' check (kind in ('employee','supplier','landlord','service','government','customer','other')),
  phone text not null default '',
  cedula_rif text not null default '',
  notes text not null default '',
  base_salary_usd numeric check (base_salary_usd is null or base_salary_usd >= 0),
  pay_cadence text check (pay_cadence is null or pay_cadence in ('weekly','biweekly','monthly')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists finance_payees_name_key on public.finance_payees (lower(name));

create table if not exists public.finance_recurring (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income','expense')),
  category_id uuid references public.finance_categories(id) on delete set null,
  account_id uuid references public.finance_accounts(id) on delete set null,
  payee_id uuid references public.finance_payees(id) on delete set null,
  amount_usd numeric not null check (amount_usd > 0),
  cadence text not null check (cadence in ('weekly','biweekly','monthly','quarterly','yearly')),
  anchor_date date not null default current_date,
  ends_on date,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.finance_allocations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  basis text not null default 'net_profit' check (basis in ('gross_sales','gross_profit','net_profit')),
  percent numeric not null check (percent > 0 and percent <= 100),
  account_id uuid references public.finance_accounts(id) on delete set null,
  target_usd numeric check (target_usd is null or target_usd >= 0),
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income','expense','transfer')),
  status text not null default 'paid' check (status in ('paid','pending','void')),
  occurred_on date not null default current_date,
  due_on date,
  -- restrict, not set null: a definition still named by a past movement may not
  -- be deleted out from under it. Nulling account_id would take that money out
  -- of its pot's balance for good, with nothing left to say where it went.
  -- Retiring a definition is what `archived`/`active` are for.
  category_id uuid references public.finance_categories(id) on delete restrict,
  account_id uuid references public.finance_accounts(id) on delete restrict,
  counter_account_id uuid references public.finance_accounts(id) on delete restrict,
  payee_id uuid references public.finance_payees(id) on delete restrict,
  amount_usd numeric not null check (amount_usd > 0),
  amount_bs numeric check (amount_bs is null or amount_bs >= 0),
  rate_used numeric check (rate_used is null or rate_used > 0),
  rate_key text check (rate_key is null or rate_key in ('USD','EUR','USDT')),
  paid_in text not null default 'USD' check (paid_in in ('USD','BS')),
  description text not null default '',
  notes text not null default '',
  tags text[] not null default '{}',
  attachments text[] not null default '{}',
  recurring_id uuid references public.finance_recurring(id) on delete set null,
  period_key text,
  allocation_id uuid references public.finance_allocations(id) on delete set null,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_entries_occurrence_key
  on public.finance_entries (recurring_id, period_key)
  where recurring_id is not null and period_key is not null;
create index if not exists finance_entries_occurred_idx on public.finance_entries (occurred_on desc);
create index if not exists finance_entries_pending_idx on public.finance_entries (due_on) where status = 'pending';
create index if not exists finance_entries_category_idx on public.finance_entries (category_id);
create index if not exists finance_entries_account_idx on public.finance_entries (account_id);

create table if not exists public.item_suppliers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  supplier_id uuid not null references public.finance_payees(id) on delete cascade,
  supplier_sku text not null default '',
  last_cost_usd numeric,
  last_purchased_on date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (item_id, supplier_id)
);
create index if not exists item_suppliers_supplier_idx on public.item_suppliers (supplier_id);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.finance_payees(id) on delete restrict,
  account_id uuid references public.finance_accounts(id) on delete restrict,
  category_id uuid references public.finance_categories(id) on delete restrict,
  occurred_on date not null default current_date,
  due_on date,
  payment_status text not null default 'paid' check (payment_status in ('paid','pending')),
  goods_usd numeric not null default 0 check (goods_usd >= 0),
  freight_usd numeric not null default 0 check (freight_usd >= 0),
  prorate_freight boolean not null default true,
  credit_applied_usd numeric not null default 0 check (credit_applied_usd >= 0),
  total_usd numeric not null default 0 check (total_usd >= 0),
  paid_in text not null default 'USD' check (paid_in in ('USD','BS')),
  amount_bs numeric,
  rate_used numeric check (rate_used is null or rate_used > 0),
  rate_key text check (rate_key is null or rate_key in ('USD','EUR','USDT')),
  invoice_number text not null default '',
  notes text not null default '',
  attachments text[] not null default '{}',
  entry_id uuid references public.finance_entries(id) on delete set null,
  status text not null default 'posted' check (status in ('posted','void')),
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists purchases_occurred_idx on public.purchases (occurred_on desc);
create index if not exists purchases_supplier_idx on public.purchases (supplier_id);

create table if not exists public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_cost_usd numeric not null check (unit_cost_usd >= 0),
  landed_unit_cost_usd numeric not null default 0 check (landed_unit_cost_usd >= 0),
  quantity_returned integer not null default 0 check (quantity_returned >= 0)
);
create index if not exists purchase_lines_purchase_idx on public.purchase_lines (purchase_id);
create index if not exists purchase_lines_item_idx on public.purchase_lines (item_id);

create table if not exists public.purchase_returns (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  supplier_id uuid references public.finance_payees(id) on delete restrict,
  occurred_on date not null default current_date,
  settlement text not null default 'credit' check (settlement in ('credit','cash')),
  account_id uuid references public.finance_accounts(id) on delete restrict,
  entry_id uuid references public.finance_entries(id) on delete set null,
  total_usd numeric not null default 0 check (total_usd >= 0),
  reason text not null default '',
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists purchase_returns_purchase_idx on public.purchase_returns (purchase_id);

create table if not exists public.purchase_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.purchase_returns(id) on delete cascade,
  purchase_line_id uuid not null references public.purchase_lines(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unit_cost_usd numeric not null check (unit_cost_usd >= 0)
);
create index if not exists purchase_return_lines_return_idx on public.purchase_return_lines (return_id);

-- ── RPCs ────────────────────────────────────────────────────────────────────
create or replace function public.finance_summary(p_from timestamptz, p_to timestamptz)
returns json
language sql stable security definer
set search_path to 'public'
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

-- Cumulative account totals, over EVERY row rather than a window. The browser
-- holds one page of the ledger and one page of the sales history, so summing
-- what it loaded understates every balance by whatever fell out of the window -
-- and can even report a pot in negative when its old inflows aged out before
-- its old outflows. Definer like finance_summary, and no wider: every
-- authenticated user may already select these rows (see the policies below).
-- The per-method takings come back unrouted; which pot a method lands in is the
-- admin's declaration, which lives on the client.
-- ponytail: full scan of the sales history on every dashboard load; materialize
-- a rollup if a shop's history ever outgrows the scan.
create or replace function public.finance_balances()
returns json
language sql stable security definer
set search_path to 'public'
as $$
with movement as (
  -- Income credits its account and an expense debits it. A transfer debits
  -- account_id (the source) to credit counter_account_id (the destination).
  select account_id as id, 1 as sign, amount_usd, paid_in, amount_bs
    from public.finance_entries
   where status = 'paid' and kind = 'income' and account_id is not null
  union all
  select account_id, -1, amount_usd, paid_in, amount_bs
    from public.finance_entries
   where status = 'paid' and kind in ('expense','transfer') and account_id is not null
  union all
  select counter_account_id, 1, amount_usd, paid_in, amount_bs
    from public.finance_entries
   where status = 'paid' and kind = 'transfer' and counter_account_id is not null
),
-- Bolivares are reported as they were stamped at payment time. A movement
-- booked in dollars stamps no rate, so its dollars come back as dollars and the
-- client values them at today's honest rate.
stamped as (
  select id, sign, amount_usd, amount_bs,
         (paid_in = 'BS' and coalesce(amount_bs, 0) <> 0) as in_bs
  from movement
),
by_account as (
  select id,
         coalesce(sum(amount_usd) filter (where sign = 1), 0)  as inflow_usd,
         coalesce(sum(amount_usd) filter (where sign = -1), 0) as outflow_usd,
         coalesce(sum(amount_bs) filter (where sign = 1 and in_bs), 0)  as inflow_bs,
         coalesce(sum(amount_bs) filter (where sign = -1 and in_bs), 0) as outflow_bs,
         coalesce(sum(amount_usd) filter (where sign = 1 and not in_bs), 0)  as inflow_usd_at_rate,
         coalesce(sum(amount_usd) filter (where sign = -1 and not in_bs), 0) as outflow_usd_at_rate
  from stamped
  group by id
),
-- Same net-of-returns arithmetic as report_summary and the history mapper.
line as (
  select ti.transaction_id,
         (ti.quantity - coalesce(ti.quantity_returned, 0)) as net_qty,
         case when ti.discount_applied and coalesce(ti.discount_value, 0) > 0
              then ti.price_usd * (1 - ti.discount_value / 100.0)
              else ti.price_usd
         end as unit_price
  from public.transaction_items ti
),
sellable as (
  select * from line where net_qty > 0
),
tx_net as (
  select t.id, t.payments, t.honest_rate,
         case when coalesce(t.subtotal_usd, 0) > 0
              then coalesce(sum(s.unit_price * s.net_qty), 0)
                   * (1 + coalesce(t.tax_usd, 0) / t.subtotal_usd)
              else coalesce(sum(s.unit_price * s.net_qty), 0)
         end as net_total
  from public.transactions t
  left join sellable s on s.transaction_id = t.id
  group by t.id, t.payments, t.honest_rate, t.subtotal_usd, t.tax_usd
),
pay as (
  select n.id, coalesce(p.method, '') as method, coalesce(p.amount, 0) as amount,
         n.net_total, n.honest_rate
  from tx_net n
  cross join lateral jsonb_to_recordset(
    case when jsonb_typeof(n.payments) = 'array' then n.payments else '[]'::jsonb end
  ) as p(method text, amount numeric)
),
-- What the drawer KEPT, not what the customer handed over: change goes straight
-- back out and a returned sale is refunded, so $20 against an $18 sale credits
-- $18 and a sale returned in full credits nothing.
kept as (
  select method, honest_rate,
         amount
           * least(sum(amount) over (partition by id), greatest(net_total, 0))
           / nullif(sum(amount) over (partition by id), 0) as kept_usd
  from pay
),
-- A bolivar pot holds the bolivares the counter actually took, at the rate the
-- sale stamped. Valuing last year's takings at today's rate would invent
-- bolivares nobody ever held and hide what holding them cost. Sales written
-- before the rate was stamped come back as dollars instead, for the client to
-- value at today's rate - the same split the account totals above use.
by_method as (
  select method,
         coalesce(sum(kept_usd), 0) as kept_usd,
         coalesce(sum(kept_usd * honest_rate) filter (where honest_rate > 0), 0)
           as kept_bs,
         coalesce(sum(kept_usd) filter (where honest_rate is null or honest_rate <= 0), 0)
           as kept_usd_at_rate
  from kept
  group by method
),
-- Which recurring occurrences have already been posted, over the WHOLE ledger.
-- The browser holds one page of it, so an obligation settled months ago falls
-- out of the window and the screen asks the shop to pay it again.
posted as (
  select distinct recurring_id, period_key
    from public.finance_entries
   where recurring_id is not null and period_key is not null and status <> 'void'
)
select json_build_object(
  'accounts', coalesce((
    select json_agg(json_build_object(
      'account_id', id,
      'inflow_usd', inflow_usd,
      'outflow_usd', outflow_usd,
      'inflow_bs', inflow_bs,
      'outflow_bs', outflow_bs,
      'inflow_usd_at_rate', inflow_usd_at_rate,
      'outflow_usd_at_rate', outflow_usd_at_rate
    )) from by_account
  ), '[]'::json),
  'methods', coalesce((
    select json_agg(json_build_object(
      'method', method,
      'kept_usd', kept_usd,
      'kept_bs', kept_bs,
      'kept_usd_at_rate', kept_usd_at_rate
    )) from by_method
  ), '[]'::json),
  'posted_periods', coalesce((
    select json_agg(json_build_object(
      'recurring_id', recurring_id,
      'period_key', period_key
    )) from posted
  ), '[]'::json)
);
$$;

-- Definer functions are executable by PUBLIC on creation, which includes the
-- anon key shipped in the browser bundle.
revoke execute on function public.finance_balances() from public, anon;
grant execute on function public.finance_balances() to authenticated;

create or replace function public.post_purchase(p_purchase jsonb, p_lines jsonb)
returns json
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_id uuid := (p_purchase ->> 'id')::uuid;
  v_user text := coalesce(p_purchase ->> 'created_by', '');
  v_goods numeric := 0;
  v_freight numeric := coalesce((p_purchase ->> 'freight_usd')::numeric, 0);
  v_credit numeric := coalesce((p_purchase ->> 'credit_applied_usd')::numeric, 0);
  v_prorate boolean := coalesce((p_purchase ->> 'prorate_freight')::boolean, true);
  v_total numeric := 0;
  v_entry_id uuid;
  v_line jsonb;
  v_new_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_unit numeric;
  v_landed numeric;
  v_prev integer;
  v_created integer := 0;
  v_status text := coalesce(p_purchase ->> 'payment_status', 'paid');
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  -- Idempotent replay: already posted, nothing more to do.
  if exists (select 1 from public.purchases where id = v_id) then
    select entry_id into v_entry_id from public.purchases where id = v_id;
    return json_build_object('purchase_id', v_id, 'entry_id', v_entry_id, 'replayed', true);
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'EMPTY_PURCHASE';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_goods := v_goods
      + (v_line ->> 'quantity')::integer * (v_line ->> 'unit_cost_usd')::numeric;
  end loop;

  if v_goods <= 0 then
    raise exception 'INVALID_INPUT';
  end if;

  v_total := greatest(v_goods + v_freight - v_credit, 0);

  insert into public.purchases (
    id, supplier_id, account_id, category_id, occurred_on, due_on,
    payment_status, goods_usd, freight_usd, prorate_freight,
    credit_applied_usd, total_usd, paid_in, amount_bs, rate_used, rate_key,
    invoice_number, notes, attachments, created_by
  ) values (
    v_id,
    nullif(p_purchase ->> 'supplier_id', '')::uuid,
    nullif(p_purchase ->> 'account_id', '')::uuid,
    nullif(p_purchase ->> 'category_id', '')::uuid,
    coalesce((p_purchase ->> 'occurred_on')::date, current_date),
    nullif(p_purchase ->> 'due_on', '')::date,
    v_status,
    v_goods,
    v_freight,
    v_prorate,
    v_credit,
    v_total,
    coalesce(p_purchase ->> 'paid_in', 'USD'),
    nullif(p_purchase ->> 'amount_bs', '')::numeric,
    nullif(p_purchase ->> 'rate_used', '')::numeric,
    nullif(p_purchase ->> 'rate_key', ''),
    coalesce(p_purchase ->> 'invoice_number', ''),
    coalesce(p_purchase ->> 'notes', ''),
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(
         coalesce(p_purchase -> 'attachments', '[]'::jsonb)) as value),
      '{}'::text[]),
    v_user
  );

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_item_id := nullif(v_line ->> 'item_id', '')::uuid;
    v_new_item := v_line -> 'new_item';
    v_qty := (v_line ->> 'quantity')::integer;
    v_unit := (v_line ->> 'unit_cost_usd')::numeric;

    -- A product that did not exist before this delivery. Created at zero stock
    -- so the purchase below is what puts the units on the shelf - the movement
    -- then reads the same as any other arrival instead of appearing out of thin
    -- air in the item's history.
    if v_item_id is null and v_new_item is not null and v_new_item <> 'null'::jsonb then
      v_item_id := coalesce(nullif(v_new_item ->> 'id', '')::uuid, gen_random_uuid());

      insert into public.items (
        id, name, barcode, buying_price_usd, selling_price_usd, quantity,
        unit, includes_taxes, discount, images, type, brand, notes
      ) values (
        v_item_id,
        coalesce(v_new_item ->> 'name', ''),
        coalesce(v_new_item ->> 'barcode', ''),
        v_unit,
        coalesce((v_new_item ->> 'selling_price_usd')::numeric, 0),
        0,
        coalesce(nullif(v_new_item ->> 'unit', ''), 'units'),
        coalesce((v_new_item ->> 'includes_taxes')::boolean, false),
        coalesce((v_new_item ->> 'discount')::numeric, 0),
        '{}'::text[],
        coalesce(nullif(v_new_item ->> 'type', ''), 'UNASSIGNED'),
        coalesce(nullif(v_new_item ->> 'brand', ''), 'GENERIC'),
        coalesce(v_new_item ->> 'notes', '')
      );

      insert into public.item_history (
        item_id, date, action, details, user_name, new_stock, reason
      ) values (
        v_item_id,
        -- Both rows are written in the same transaction, so now() is identical
        -- for each. Nudged back a second so the timeline reads in the order the
        -- events actually happened: created, then stocked.
        now() - interval '1 second',
        'create',
        format('Producto creado desde una compra (factura %s)',
               coalesce(nullif(p_purchase ->> 'invoice_number', ''), 's/n')),
        v_user,
        0,
        'compra'
      );

      v_created := v_created + 1;
    end if;

    -- Freight lands on the goods in proportion to what each line is worth, so
    -- a cheap line does not absorb the same shipping as an expensive one.
    v_landed := case
      when v_prorate and v_freight > 0 and v_goods > 0
        then v_unit + (v_freight * (v_qty * v_unit) / v_goods) / v_qty
      else v_unit
    end;

    insert into public.purchase_lines (
      purchase_id, item_id, name, quantity, unit_cost_usd, landed_unit_cost_usd
    ) values (
      v_id, v_item_id, coalesce(v_line ->> 'name', ''), v_qty, v_unit, v_landed
    );

    -- A line without an item is a cost, not stock.
    if v_item_id is not null then
      select quantity into v_prev from public.items where id = v_item_id for update;

      if v_prev is null then
        raise exception 'ITEM_NOT_FOUND';
      end if;

      update public.items
        set quantity = quantity + v_qty,
            buying_price_usd = v_landed,
            updated_at = now()
      where id = v_item_id;

      insert into public.item_history (
        item_id, action, details, user_name, previous_stock, new_stock, reason
      ) values (
        v_item_id,
        'purchase',
        format('Compra: +%s a %s c/u (factura %s)',
               v_qty,
               round(v_landed, 2),
               coalesce(nullif(p_purchase ->> 'invoice_number', ''), 's/n')),
        v_user,
        v_prev,
        v_prev + v_qty,
        'compra'
      );

      -- Remember this supplier sells this product, and at what.
      if nullif(p_purchase ->> 'supplier_id', '') is not null then
        insert into public.item_suppliers (
          item_id, supplier_id, last_cost_usd, last_purchased_on
        ) values (
          v_item_id,
          (p_purchase ->> 'supplier_id')::uuid,
          v_unit,
          coalesce((p_purchase ->> 'occurred_on')::date, current_date)
        )
        on conflict (item_id, supplier_id) do update
          set last_cost_usd = excluded.last_cost_usd,
              last_purchased_on = excluded.last_purchased_on;
      end if;
    end if;
  end loop;

  -- The money side. Zero-total purchases (fully covered by supplier credit)
  -- move stock without any cash moving, so they get no entry.
  if v_total > 0 then
    insert into public.finance_entries (
      kind, status, occurred_on, due_on, category_id, account_id, payee_id,
      amount_usd, amount_bs, rate_used, rate_key, paid_in, description,
      notes, created_by
    ) values (
      'expense',
      case when v_status = 'pending' then 'pending' else 'paid' end,
      coalesce((p_purchase ->> 'occurred_on')::date, current_date),
      nullif(p_purchase ->> 'due_on', '')::date,
      nullif(p_purchase ->> 'category_id', '')::uuid,
      nullif(p_purchase ->> 'account_id', '')::uuid,
      nullif(p_purchase ->> 'supplier_id', '')::uuid,
      v_total,
      nullif(p_purchase ->> 'amount_bs', '')::numeric,
      nullif(p_purchase ->> 'rate_used', '')::numeric,
      nullif(p_purchase ->> 'rate_key', ''),
      coalesce(p_purchase ->> 'paid_in', 'USD'),
      format('Compra %s', coalesce(nullif(p_purchase ->> 'invoice_number', ''), 's/n')),
      coalesce(p_purchase ->> 'notes', ''),
      v_user
    )
    returning id into v_entry_id;

    update public.purchases set entry_id = v_entry_id where id = v_id;
  end if;

  return json_build_object(
    'purchase_id', v_id,
    'entry_id', v_entry_id,
    'created_items', v_created,
    'replayed', false
  );
end;
$$;

create or replace function public.post_purchase_return(p_return jsonb, p_lines jsonb)
returns json
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_id uuid := (p_return ->> 'id')::uuid;
  v_purchase_id uuid := (p_return ->> 'purchase_id')::uuid;
  v_user text := coalesce(p_return ->> 'created_by', '');
  v_settlement text := coalesce(p_return ->> 'settlement', 'credit');
  v_total numeric := 0;
  v_entry_id uuid;
  v_line jsonb;
  v_purchase_line public.purchase_lines%rowtype;
  v_qty integer;
  v_prev integer;
  v_supplier uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_id is null or v_purchase_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  if exists (select 1 from public.purchase_returns where id = v_id) then
    select entry_id into v_entry_id from public.purchase_returns where id = v_id;
    return json_build_object('return_id', v_id, 'entry_id', v_entry_id, 'replayed', true);
  end if;

  select supplier_id into v_supplier from public.purchases where id = v_purchase_id;

  insert into public.purchase_returns (
    id, purchase_id, supplier_id, occurred_on, settlement, account_id,
    total_usd, reason, notes, created_by
  ) values (
    v_id,
    v_purchase_id,
    v_supplier,
    coalesce((p_return ->> 'occurred_on')::date, current_date),
    v_settlement,
    nullif(p_return ->> 'account_id', '')::uuid,
    0,
    coalesce(p_return ->> 'reason', ''),
    coalesce(p_return ->> 'notes', ''),
    v_user
  );

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line ->> 'quantity')::integer;

    select * into v_purchase_line
    from public.purchase_lines
    where id = (v_line ->> 'purchase_line_id')::uuid
      and purchase_id = v_purchase_id
    for update;

    if v_purchase_line.id is null then
      raise exception 'LINE_NOT_FOUND';
    end if;

    if v_qty <= 0
       or v_purchase_line.quantity_returned + v_qty > v_purchase_line.quantity then
      raise exception 'RETURN_EXCEEDS_PURCHASED';
    end if;

    update public.purchase_lines
      set quantity_returned = quantity_returned + v_qty
    where id = v_purchase_line.id;

    insert into public.purchase_return_lines (
      return_id, purchase_line_id, quantity, unit_cost_usd
    ) values (
      v_id, v_purchase_line.id, v_qty, v_purchase_line.landed_unit_cost_usd
    );

    v_total := v_total + v_qty * v_purchase_line.landed_unit_cost_usd;

    -- Stock goes back out. Only for lines that were stock in the first place,
    -- and never below zero: you cannot return what has already been sold.
    if v_purchase_line.item_id is not null then
      select quantity into v_prev
      from public.items
      where id = v_purchase_line.item_id
      for update;

      if v_prev is null then
        raise exception 'ITEM_NOT_FOUND';
      end if;

      if v_prev < v_qty then
        raise exception 'INSUFFICIENT_STOCK';
      end if;

      update public.items
        set quantity = quantity - v_qty,
            updated_at = now()
      where id = v_purchase_line.item_id;

      insert into public.item_history (
        item_id, action, details, user_name, previous_stock, new_stock, reason
      ) values (
        v_purchase_line.item_id,
        'purchase_return',
        format('Devolución a proveedor: -%s', v_qty),
        v_user,
        v_prev,
        v_prev - v_qty,
        coalesce(nullif(p_return ->> 'reason', ''), 'devolucion')
      );
    end if;
  end loop;

  if v_total <= 0 then
    raise exception 'EMPTY_RETURN';
  end if;

  update public.purchase_returns set total_usd = v_total where id = v_id;

  -- A cash refund is money coming back in. Credit is not: it stays with the
  -- supplier until a later purchase consumes it, and is derived from the
  -- returns themselves rather than booked as income the business never received.
  if v_settlement = 'cash' then
    insert into public.finance_entries (
      kind, status, occurred_on, account_id, payee_id, amount_usd,
      paid_in, description, notes, created_by
    ) values (
      'income',
      'paid',
      coalesce((p_return ->> 'occurred_on')::date, current_date),
      nullif(p_return ->> 'account_id', '')::uuid,
      v_supplier,
      v_total,
      'USD',
      'Reembolso de proveedor',
      coalesce(p_return ->> 'notes', ''),
      v_user
    )
    returning id into v_entry_id;

    update public.purchase_returns set entry_id = v_entry_id where id = v_id;
  end if;

  return json_build_object('return_id', v_id, 'entry_id', v_entry_id, 'replayed', false);
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.finance_accounts enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_payees enable row level security;
alter table public.finance_recurring enable row level security;
alter table public.finance_allocations enable row level security;
alter table public.finance_entries enable row level security;
alter table public.item_suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.purchase_returns enable row level security;
alter table public.purchase_return_lines enable row level security;

create policy finance_accounts_select_authenticated on public.finance_accounts
  for select to authenticated using (true);
create policy finance_accounts_insert_admin on public.finance_accounts
  for insert to authenticated with check (is_admin());
create policy finance_accounts_update_admin on public.finance_accounts
  for update to authenticated using (is_admin()) with check (is_admin());
create policy finance_accounts_delete_admin on public.finance_accounts
  for delete to authenticated using (is_admin());

create policy finance_categories_select_authenticated on public.finance_categories
  for select to authenticated using (true);
create policy finance_categories_insert_admin on public.finance_categories
  for insert to authenticated with check (is_admin());
create policy finance_categories_update_admin on public.finance_categories
  for update to authenticated using (is_admin()) with check (is_admin());
create policy finance_categories_delete_admin on public.finance_categories
  for delete to authenticated using (is_admin());

create policy finance_payees_select_authenticated on public.finance_payees
  for select to authenticated using (true);
create policy finance_payees_insert_admin on public.finance_payees
  for insert to authenticated with check (is_admin());
create policy finance_payees_update_admin on public.finance_payees
  for update to authenticated using (is_admin()) with check (is_admin());
create policy finance_payees_delete_admin on public.finance_payees
  for delete to authenticated using (is_admin());

create policy finance_recurring_select_authenticated on public.finance_recurring
  for select to authenticated using (true);
create policy finance_recurring_insert_admin on public.finance_recurring
  for insert to authenticated with check (is_admin());
create policy finance_recurring_update_admin on public.finance_recurring
  for update to authenticated using (is_admin()) with check (is_admin());
create policy finance_recurring_delete_admin on public.finance_recurring
  for delete to authenticated using (is_admin());

create policy finance_allocations_select_authenticated on public.finance_allocations
  for select to authenticated using (true);
create policy finance_allocations_insert_admin on public.finance_allocations
  for insert to authenticated with check (is_admin());
create policy finance_allocations_update_admin on public.finance_allocations
  for update to authenticated using (is_admin()) with check (is_admin());
create policy finance_allocations_delete_admin on public.finance_allocations
  for delete to authenticated using (is_admin());

-- Sellers record what they spend in the field; only admins edit or delete.
create policy finance_entries_select_authenticated on public.finance_entries
  for select to authenticated using (true);
create policy finance_entries_insert_authenticated on public.finance_entries
  for insert to authenticated with check (true);
create policy finance_entries_update_admin on public.finance_entries
  for update to authenticated using (is_admin()) with check (is_admin());
create policy finance_entries_delete_admin on public.finance_entries
  for delete to authenticated using (is_admin());

create policy item_suppliers_select_authenticated on public.item_suppliers
  for select to authenticated using (true);
create policy item_suppliers_write_admin on public.item_suppliers
  for all to authenticated using (is_admin()) with check (is_admin());

create policy purchases_select_authenticated on public.purchases
  for select to authenticated using (true);
create policy purchases_write_admin on public.purchases
  for all to authenticated using (is_admin()) with check (is_admin());

create policy purchase_lines_select_authenticated on public.purchase_lines
  for select to authenticated using (true);
create policy purchase_lines_write_admin on public.purchase_lines
  for all to authenticated using (is_admin()) with check (is_admin());

create policy purchase_returns_select_authenticated on public.purchase_returns
  for select to authenticated using (true);
create policy purchase_returns_write_admin on public.purchase_returns
  for all to authenticated using (is_admin()) with check (is_admin());

create policy purchase_return_lines_select_authenticated on public.purchase_return_lines
  for select to authenticated using (true);
create policy purchase_return_lines_write_admin on public.purchase_return_lines
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── seed: standard category catalog ─────────────────────────────────────────
insert into public.finance_categories (name, kind, nature) values
  ('AGUA','expense','fixed'),
  ('ALQUILER','expense','fixed'),
  ('BONOS Y COMISIONES','expense','variable'),
  ('COMISIONES BANCARIAS','expense','variable'),
  ('COMPRA DE MERCANCIA','expense','cogs'),
  ('ELECTRICIDAD','expense','fixed'),
  ('FLETE Y ENVIOS','expense','variable'),
  ('GASOLINA','expense','variable'),
  ('IMPUESTOS','expense','tax'),
  ('INTERNET Y TELEFONO','expense','fixed'),
  ('INVERSIONES','expense','investment'),
  ('LIMPIEZA Y INSUMOS','expense','variable'),
  ('MANTENIMIENTO LOCAL','expense','variable'),
  ('MANTENIMIENTO VEHICULOS','expense','variable'),
  ('OTROS GASTOS','expense','variable'),
  ('OTROS INGRESOS','income','other'),
  ('PUBLICIDAD','expense','variable'),
  ('RENDIMIENTOS DE INVERSION','income','other'),
  ('RETIRO DEL DUENO','expense','owner'),
  ('SEGURIDAD Y VIGILANCIA','expense','fixed'),
  ('SERVICIOS','income','other'),
  ('SUELDOS','expense','fixed'),
  ('VENTAS','income','other')
on conflict (name, kind) do nothing;

-- ---------------------------------------------------------------------------
-- Converging fixups for instances provisioned before the rules above changed.
-- The column definitions carry the current rule; these statements bring an
-- already-created schema to the same place, so re-running this file converges
-- instead of leaving deployed shops on the old behaviour.
-- ---------------------------------------------------------------------------

-- The references above were `on delete set null`, so deleting an account took
-- every movement it ever held out of that pot's balance and left no trace of
-- where the money went. Postgres names these constraints predictably.
do $$
declare
  fk record;
begin
  for fk in
    select * from (values
      ('finance_entries', 'category_id',        'finance_categories'),
      ('finance_entries', 'account_id',         'finance_accounts'),
      ('finance_entries', 'counter_account_id', 'finance_accounts'),
      ('finance_entries', 'payee_id',           'finance_payees'),
      ('purchases',       'supplier_id',        'finance_payees'),
      ('purchases',       'account_id',         'finance_accounts'),
      ('purchases',       'category_id',        'finance_categories'),
      ('purchase_returns','supplier_id',        'finance_payees'),
      ('purchase_returns','account_id',         'finance_accounts')
    ) as t(tbl, col, ref)
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      fk.tbl, fk.tbl || '_' || fk.col || '_fkey'
    );
    execute format(
      'alter table public.%I add constraint %I foreign key (%I)
         references public.%I(id) on delete restrict',
      fk.tbl, fk.tbl || '_' || fk.col || '_fkey', fk.col, fk.ref
    );
  end loop;
end $$;

-- A bolivar account saved before the setup dialog stamped its opening balance
-- in dollars carries opening_balance_bs with opening_balance_usd still 0. The
-- books then read $0 while the pot is worth something, and the whole opening
-- balance surfaces as devaluación - a gain that never happened. Valued at the
-- honest rate the shop is on now, which is the only rate anyone recorded; a
-- pot opened years ago at a different rate has to be corrected by hand.
update public.finance_accounts a
   set opening_balance_usd = a.opening_balance_bs / r.rate
  from (
    -- The rate the shop declared honest, whichever one that is; USDT then USD
    -- only as a fallback for rows written before the setting existed.
    select coalesce(
             nullif((value ->> coalesce(value ->> 'honest', 'USDT'))::numeric, 0),
             nullif((value ->> 'USDT')::numeric, 0),
             nullif((value ->> 'USD')::numeric, 0)
           ) as rate
      from public.settings where key = 'rates'
  ) r
 where a.basis = 'BS'
   and a.opening_balance_bs > 0
   and a.opening_balance_usd = 0
   -- No usable rate recorded means no honest conversion exists; leaving the
   -- row alone keeps the problem visible instead of inventing a figure.
   and r.rate is not null;
