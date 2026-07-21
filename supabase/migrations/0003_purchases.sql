-- ---------------------------------------------------------------------------
-- Purchases: where the finance module and the inventory meet.
--
-- Until now the app had no idea what merchandise cost to acquire. Stock went up
-- because somebody typed a bigger number into the item form - no supplier, no
-- date, no money leaving anywhere. Margins were still right (each sale line
-- snapshots its own cost), but "what did we spend on stock this month" was
-- unanswerable.
--
-- A purchase records all of it at once, atomically:
--   stock up  +  cost updated  +  item history  +  money out  +  supplier named
--
-- Design notes worth reading before changing anything here:
--
-- * There is no draft row. The basket is built in the browser and posted in one
--   RPC call, so a half-written purchase can never have moved stock. The client
--   mints the purchase id, which also makes an offline replay idempotent.
--
-- * A purchase is NOT an operating expense. It converts cash into inventory.
--   The cost reaches the P&L later, when the item sells, from the snapshot on
--   the sale line. Booking both would count the same money twice.
--
-- * Returning goods to a supplier usually produces credit, not cash. So a
--   supplier balance swings both ways, and later purchases consume the credit
--   through `credit_applied_usd`.
--
-- Depends on 0002_finance.sql (finance_payees, finance_accounts,
-- finance_categories, finance_entries) and on the atomic stock functions from
-- 0001_security_and_integrity.sql.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- Which suppliers carry which product
-- ---------------------------------------------------------------------------
-- Many-to-many on purpose: the same product from two suppliers at two prices is
-- the normal case, and comparing them is half the value of tracking suppliers
-- at all. `last_cost_usd` is a cache of the newest purchase for that pair, so
-- the comparison does not have to scan the whole purchase history.
create table if not exists public.item_suppliers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  supplier_id uuid not null references public.finance_payees (id) on delete cascade,
  supplier_sku text not null default '',
  last_cost_usd numeric,
  last_purchased_on date,
  notes text not null default '',
  created_at timestamp with time zone not null default now(),
  unique (item_id, supplier_id)
);

create index if not exists item_suppliers_supplier_idx
  on public.item_suppliers (supplier_id);

-- ---------------------------------------------------------------------------
-- Purchases
-- ---------------------------------------------------------------------------
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.finance_payees (id) on delete set null,
  account_id uuid references public.finance_accounts (id) on delete set null,
  category_id uuid references public.finance_categories (id) on delete set null,
  occurred_on date not null default current_date,
  due_on date,
  -- `pending` is bought-but-unpaid: it moves stock now and owes money later.
  payment_status text not null default 'paid'
    check (payment_status in ('paid', 'pending')),
  -- Merchandise total, before freight.
  goods_usd numeric not null default 0 check (goods_usd >= 0),
  -- Freight and handling. Prorated across the lines by value when
  -- `prorate_freight`, so the recorded unit cost is what the goods really
  -- landed at rather than the invoice figure.
  freight_usd numeric not null default 0 check (freight_usd >= 0),
  prorate_freight boolean not null default true,
  -- Supplier credit from earlier returns, consumed by this purchase. Reduces
  -- what is actually paid without touching what the goods cost.
  credit_applied_usd numeric not null default 0 check (credit_applied_usd >= 0),
  total_usd numeric not null default 0 check (total_usd >= 0),
  paid_in text not null default 'USD' check (paid_in in ('USD', 'BS')),
  amount_bs numeric,
  rate_used numeric check (rate_used is null or rate_used > 0),
  rate_key text check (rate_key is null or rate_key in ('USD', 'EUR', 'USDT')),
  invoice_number text not null default '',
  notes text not null default '',
  attachments text[] not null default '{}',
  -- The money side, written by post_purchase.
  entry_id uuid references public.finance_entries (id) on delete set null,
  status text not null default 'posted' check (status in ('posted', 'void')),
  created_by text not null default '',
  created_at timestamp with time zone not null default now()
);

create index if not exists purchases_occurred_idx
  on public.purchases (occurred_on desc);
create index if not exists purchases_supplier_idx
  on public.purchases (supplier_id);

create table if not exists public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  -- Null means the line is not stock: packaging, a tool, a service on the same
  -- invoice. It still costs money, it just never touches inventory.
  item_id uuid references public.items (id) on delete set null,
  -- Snapshot, so a deleted product does not erase what was bought.
  name text not null,
  quantity integer not null check (quantity > 0),
  -- What the goods cost before freight.
  unit_cost_usd numeric not null check (unit_cost_usd >= 0),
  -- What they cost after freight was spread over the invoice. This is the
  -- number written onto the item, because it is what the stock really cost.
  landed_unit_cost_usd numeric not null default 0 check (landed_unit_cost_usd >= 0),
  quantity_returned integer not null default 0 check (quantity_returned >= 0),
  constraint purchase_lines_returned_bound check (quantity_returned <= quantity)
);

create index if not exists purchase_lines_purchase_idx
  on public.purchase_lines (purchase_id);
create index if not exists purchase_lines_item_idx
  on public.purchase_lines (item_id);

-- ---------------------------------------------------------------------------
-- Returns to the supplier
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_returns (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  supplier_id uuid references public.finance_payees (id) on delete set null,
  occurred_on date not null default current_date,
  -- Credit is the common outcome here: the supplier owes you, and the next
  -- purchase consumes it. Cash refunds write a real income entry instead.
  settlement text not null default 'credit' check (settlement in ('credit', 'cash')),
  account_id uuid references public.finance_accounts (id) on delete set null,
  entry_id uuid references public.finance_entries (id) on delete set null,
  total_usd numeric not null default 0 check (total_usd >= 0),
  reason text not null default '',
  notes text not null default '',
  created_by text not null default '',
  created_at timestamp with time zone not null default now()
);

create index if not exists purchase_returns_purchase_idx
  on public.purchase_returns (purchase_id);

create table if not exists public.purchase_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.purchase_returns (id) on delete cascade,
  purchase_line_id uuid not null references public.purchase_lines (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  -- The cost this stock was booked at. Reversing at today's buying price would
  -- credit back a number nobody ever paid.
  unit_cost_usd numeric not null check (unit_cost_usd >= 0)
);

create index if not exists purchase_return_lines_return_idx
  on public.purchase_return_lines (return_id);

-- ---------------------------------------------------------------------------
-- Item history gains the movements that now exist
-- ---------------------------------------------------------------------------
-- Stock can now rise for two different reasons, and the history has to say
-- which: a purchase (money left the business) or an adjustment (breakage, theft,
-- a physical count, a sample given away - no money involved). Without the
-- distinction the two are indistinguishable after the fact, which is exactly
-- how merchandise spend goes missing from the books.
alter table public.item_history
  add column if not exists reason text;

do $$
declare
  con text;
begin
  select conname into con
  from pg_constraint
  where conrelid = 'public.item_history'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%action%'
  limit 1;

  if con is not null then
    execute format('alter table public.item_history drop constraint %I', con);
  end if;

  alter table public.item_history
    add constraint item_history_action_check check (
      action in (
        'create', 'update', 'delete', 'sale', 'return',
        'purchase', 'adjust', 'purchase_return'
      )
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Purchases rewrite what stock costs, which moves every margin figure in the
-- reports. Admin only, unlike plain expenses.
alter table public.item_suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.purchase_returns enable row level security;
alter table public.purchase_return_lines enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'item_suppliers',
    'purchases',
    'purchase_lines',
    'purchase_returns',
    'purchase_return_lines'
  ]
  loop
    execute format('drop policy if exists %1$s_select_authenticated on public.%1$s', t);
    execute format(
      'create policy %1$s_select_authenticated on public.%1$s
         for select to authenticated using (true)', t);

    execute format('drop policy if exists %1$s_write_admin on public.%1$s', t);
    execute format(
      'create policy %1$s_write_admin on public.%1$s
         for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Posting a purchase
-- ---------------------------------------------------------------------------
-- One transaction: stock in, costs updated, history written, money booked,
-- supplier links refreshed. Either all of it happened or none of it did.
--
-- Called with the id the browser generated, so replaying a queued offline
-- purchase cannot post it twice - the second call sees the row and returns.
create or replace function public.post_purchase(p_purchase jsonb, p_lines jsonb)
returns json
language plpgsql
security definer
set search_path = public
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
  v_line_id uuid;
  v_item_id uuid;
  v_qty integer;
  v_unit numeric;
  v_landed numeric;
  v_prev integer;
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
    v_qty := (v_line ->> 'quantity')::integer;
    v_unit := (v_line ->> 'unit_cost_usd')::numeric;

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
    )
    returning id into v_line_id;

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

  return json_build_object('purchase_id', v_id, 'entry_id', v_entry_id, 'replayed', false);
end;
$$;

revoke all on function public.post_purchase(jsonb, jsonb) from public;
grant execute on function public.post_purchase(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Returning goods to the supplier
-- ---------------------------------------------------------------------------
-- Bounded by what that purchase actually brought in, minus what already went
-- back, and by what is still on the shelf. Reverses at the cost the stock was
-- booked at, not at today's buying price.
create or replace function public.post_purchase_return(
  p_return jsonb,
  p_lines jsonb
)
returns json
language plpgsql
security definer
set search_path = public
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

revoke all on function public.post_purchase_return(jsonb, jsonb) from public;
grant execute on function public.post_purchase_return(jsonb, jsonb) to authenticated;

commit;
