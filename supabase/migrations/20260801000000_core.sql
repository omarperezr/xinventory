-- Core schema: auth profiles, inventory, sales, settings, storage.
-- Extracted from the original XInventory project so fresh instances start
-- complete. Module tables live in the sibling migrations (finanzas, redes).

create extension if not exists pg_trgm with schema public;

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'seller' check (role in ('admin','seller')),
  created_at timestamptz not null default now(),
  can_edit_price boolean not null default false
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'seller')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_auth_user_email_change()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update on auth.users
  for each row execute function public.handle_auth_user_email_change();

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    new.can_edit_price := old.can_edit_price;
    new.role           := old.role;  -- belt-and-braces; policy also enforces
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ── inventory ───────────────────────────────────────────────────────────────
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  barcode text not null,
  buying_price_usd numeric not null default 0,
  selling_price_usd numeric not null default 0,
  quantity integer not null default 0 check (quantity >= 0),
  unit text not null default 'units',
  includes_taxes boolean not null default false,
  discount numeric not null default 0,
  images text[] not null default '{}',
  type text not null default 'N/A',
  brand text not null default 'GENERICO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notes text default ''
);

create table if not exists public.item_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  action text not null check (action in
    ('create','update','delete','sale','return','purchase','adjust','purchase_return')),
  date timestamptz not null default now(),
  details text,
  user_name text,
  previous_stock integer,
  new_stock integer,
  reason text
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  date timestamptz not null default now(),
  subtotal_usd numeric not null,
  tax_usd numeric not null,
  total_usd numeric not null,
  payments jsonb not null default '[]',
  notes text,
  user_id text,
  images text[] not null default '{}',
  honest_rate numeric,
  honest_rate_key text
);

-- item_id deliberately has no FK: sale lines outlive deleted products, and
-- return_transaction_item() can rebuild the product from the line.
create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  item_id uuid not null,
  name text,
  price_usd numeric,
  quantity integer,
  quantity_returned integer not null default 0,
  discount_applied boolean not null default false,
  discount_value numeric not null default 0,
  buying_price_usd numeric not null default 0
);

-- ── guard triggers (server-enforced field permissions) ─────────────────────
create or replace function public.guard_item_columns()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    new.buying_price_usd  := old.buying_price_usd;
    new.selling_price_usd := old.selling_price_usd;
    new.discount          := old.discount;
  end if;
  -- Server-owned timestamp: phone clocks drift, so never trust the client's.
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists trg_guard_item_columns on public.items;
create trigger trg_guard_item_columns
  before update on public.items
  for each row execute function public.guard_item_columns();

create or replace function public.guard_transaction_columns()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    new.subtotal_usd := old.subtotal_usd;
    new.tax_usd      := old.tax_usd;
    new.total_usd    := old.total_usd;
    new.payments     := old.payments;
    new.date         := old.date;
    new.user_id      := old.user_id;
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_transaction_columns on public.transactions;
create trigger trg_guard_transaction_columns
  before update on public.transactions
  for each row execute function public.guard_transaction_columns();

create or replace function public.guard_transaction_item_price()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if new.price_usd is distinct from old.price_usd and not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if new.buying_price_usd is distinct from old.buying_price_usd
     and not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_txi_price on public.transaction_items;
create trigger trg_guard_txi_price
  before update on public.transaction_items
  for each row execute function public.guard_transaction_item_price();

-- ── stock RPCs ──────────────────────────────────────────────────────────────
create or replace function public.increment_stock(p_item_id uuid, p_qty integer)
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare new_qty integer;
begin
  if p_qty <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  update public.items
     set quantity = quantity + p_qty
   where id = p_item_id
  returning quantity into new_qty;

  if new_qty is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  return new_qty;
end
$$;

create or replace function public.decrement_stock(p_item_id uuid, p_qty integer)
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare new_qty integer;
begin
  if p_qty <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  update public.items
     set quantity = quantity - p_qty
   where id = p_item_id
     and quantity >= p_qty
  returning quantity into new_qty;

  if new_qty is null then
    raise exception 'INSUFFICIENT_STOCK';
  end if;
  return new_qty;
end
$$;

create or replace function public.return_transaction_item(p_transaction_id uuid, p_item_id uuid, p_qty integer)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  updated       int;
  line          record;
  item_exists   boolean;
  was_restored  boolean := false;
  new_qty       integer;
begin
  if p_qty <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  -- Bound the return to what was actually sold and not already returned.
  update public.transaction_items
     set quantity_returned = quantity_returned + p_qty
   where transaction_id = p_transaction_id
     and item_id = p_item_id
     and quantity_returned + p_qty <= quantity
  returning * into line;

  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'RETURN_EXCEEDS_SOLD';
  end if;

  select exists (select 1 from public.items where id = p_item_id)
    into item_exists;

  if not item_exists then
    -- Rebuild the product from the sale line. Only the fields the line
    -- captured can be recovered; the rest take obvious placeholders and the
    -- item is tagged RECUPERADO so an admin can find and complete it.
    --
    -- The barcode is derived from the id because the original was not stored
    -- on the line and the column is expected to be unique. ON CONFLICT keeps
    -- this safe if a row was recreated concurrently by another return.
    insert into public.items (
      id, name, barcode,
      buying_price_usd, selling_price_usd,
      quantity, unit, includes_taxes, discount,
      images, type, brand, notes
    )
    values (
      p_item_id,
      coalesce(line.name, 'PRODUCTO RECUPERADO'),
      'REC-' || upper(left(replace(p_item_id::text, '-', ''), 10)),
      coalesce(line.buying_price_usd, 0),
      coalesce(line.price_usd, 0),
      0,                      -- stock is added by increment_stock below
      'units',
      false,
      0,
      '{}',
      'RECUPERADO',
      'GENERICO',
      'Producto recreado automaticamente al procesar una devolucion. '
        || 'Revisa codigo de barras, unidad, marca y tipo.'
    )
    on conflict (id) do nothing;

    was_restored := true;

    insert into public.item_history (item_id, action, details, user_name, new_stock)
    values (
      p_item_id,
      'create',
      'Producto recreado al procesar una devolucion de una venta anterior',
      'sistema',
      0
    );
  end if;

  new_qty := public.increment_stock(p_item_id, p_qty);

  return jsonb_build_object(
    'restored', was_restored,
    'itemId',   p_item_id,
    'name',     coalesce(line.name, ''),
    'quantity', new_qty
  );
end
$$;

-- ── report aggregate (used by Reportes, harmless without it) ───────────────
create or replace function public.report_summary(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb
language sql stable
set search_path to 'public'
as $$
with
-- Sales in range. RLS still applies because this is SECURITY INVOKER: the
-- caller only aggregates rows they are already allowed to read.
tx as (
  select t.id, t.date, t.user_id, t.payments,
         coalesce(t.subtotal_usd, 0) as subtotal_usd,
         coalesce(t.tax_usd, 0)      as tax_usd,
         coalesce(t.total_usd, 0)    as total_usd
  from public.transactions t
  where (p_from is null or t.date >= p_from)
    and (p_to   is null or t.date <= p_to)
),
line as (
  select ti.transaction_id,
         ti.item_id,
         ti.name,
         (ti.quantity - coalesce(ti.quantity_returned, 0)) as net_qty,
         case when ti.discount_applied and coalesce(ti.discount_value, 0) > 0
              then ti.price_usd * (1 - ti.discount_value / 100.0)
              else ti.price_usd
         end as unit_price,
         case when coalesce(ti.buying_price_usd, 0) > 0
              then ti.buying_price_usd
              else coalesce(i.buying_price_usd, 0)
         end as unit_cost
  from public.transaction_items ti
  join tx on tx.id = ti.transaction_id
  left join public.items i on i.id = ti.item_id
),
sellable as (
  select * from line where net_qty > 0
),
tx_net as (
  select tx.id,
         tx.date,
         tx.user_id,
         tx.payments,
         coalesce(sum(s.unit_price * s.net_qty), 0) as net_subtotal,
         case when tx.subtotal_usd > 0
              then coalesce(sum(s.unit_price * s.net_qty), 0)
                   * (tx.tax_usd / tx.subtotal_usd)
              else 0
         end as net_tax
  from tx
  left join sellable s on s.transaction_id = tx.id
  group by tx.id, tx.date, tx.user_id, tx.payments, tx.subtotal_usd, tx.tax_usd
),
tx_total as (
  select id, date, user_id, payments,
         net_subtotal, net_tax, net_subtotal + net_tax as net_total
  from tx_net
),
totals as (
  select
    coalesce(sum(net_total), 0)                        as revenue,
    (select coalesce(sum(unit_cost * net_qty), 0) from sellable) as cost,
    count(*)                                           as transactions,
    case when count(*) > 0
         then coalesce(sum(net_total), 0) / count(*)
         else 0 end                                    as avg_ticket
  from tx_total
),
by_item as (
  select name,
         sum(net_qty)                  as quantity,
         sum(unit_price * net_qty)     as total,
         sum(unit_cost  * net_qty)     as cost
  from sellable
  group by name
  order by sum(unit_price * net_qty) desc
),
by_user as (
  select coalesce(user_id, '')  as "user",
         sum(net_total)         as total,
         count(*)               as count
  from tx_total
  group by coalesce(user_id, '')
  order by sum(net_total) desc
),
by_payment as (
  select p.method, sum(p.amount) as total
  from tx_total t
  cross join lateral jsonb_to_recordset(
    case when jsonb_typeof(t.payments) = 'array' then t.payments else '[]'::jsonb end
  ) as p(method text, amount numeric)
  where p.method is not null
  group by p.method
  order by sum(p.amount) desc
),
daily as (
  select to_char(date_trunc('day', date), 'YYYY-MM-DD') as day_key,
         to_char(date_trunc('day', date), 'DD/MM')      as day_label,
         sum(net_total)                                 as total
  from tx_total
  group by 1, 2
  order by 1
)
select jsonb_build_object(
  'totals', (
    select jsonb_build_object(
      'revenue',      round(revenue::numeric, 2),
      'cost',         round(cost::numeric, 2),
      'profit',       round((revenue - cost)::numeric, 2),
      'margin',       case when revenue > 0
                           then round((((revenue - cost) / revenue) * 100)::numeric, 2)
                           else 0 end,
      'transactions', transactions,
      'avgTicket',    round(avg_ticket::numeric, 2)
    ) from totals
  ),
  'itemSales', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', name,
      'quantity', quantity,
      'total', round(total::numeric, 2),
      'cost',  round(cost::numeric, 2)
    )) from by_item
  ), '[]'::jsonb),
  'userSales', coalesce((
    select jsonb_agg(jsonb_build_object(
      'user', "user",
      'total', round(total::numeric, 2),
      'count', count
    )) from by_user
  ), '[]'::jsonb),
  'paymentMethodTotals', coalesce((
    select jsonb_agg(jsonb_build_object(
      'method', method,
      'total', round(total::numeric, 2)
    )) from by_payment
  ), '[]'::jsonb),
  'daily', coalesce((
    select jsonb_agg(jsonb_build_object(
      'day', day_label,
      'total', round(total::numeric, 2)
    ) order by day_key) from daily
  ), '[]'::jsonb)
);
$$;

-- ── indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_items_name on public.items (name);
create index if not exists idx_items_barcode on public.items (barcode);
create index if not exists idx_items_type on public.items (type);
create index if not exists idx_items_brand on public.items (brand);
create index if not exists items_updated_at_idx on public.items (updated_at desc);
create index if not exists idx_item_history_item_id on public.item_history (item_id);
create index if not exists idx_item_history_date on public.item_history (date desc);
create index if not exists item_history_item_idx on public.item_history (item_id, date desc);
create index if not exists idx_transactions_date on public.transactions (date desc);
create index if not exists idx_transaction_items_tx_id on public.transaction_items (transaction_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.item_history enable row level security;
alter table public.settings enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated using ((id = auth.uid()) or is_admin());
create policy profiles_update_own_name on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check ((id = auth.uid()) and ((role = 'admin') = is_admin()));

create policy items_select_authenticated on public.items
  for select to authenticated using (true);
create policy items_insert_admin on public.items
  for insert to authenticated with check (is_admin());
create policy items_update_authenticated on public.items
  for update to authenticated using (true) with check (true);
create policy items_delete_admin on public.items
  for delete to authenticated using (is_admin());

create policy item_history_select_authenticated on public.item_history
  for select to authenticated using (true);
create policy item_history_insert_authenticated on public.item_history
  for insert to authenticated with check (true);

create policy settings_select_authenticated on public.settings
  for select to authenticated using (true);
create policy settings_upsert_admin on public.settings
  for insert to authenticated with check (is_admin());
create policy settings_update_admin on public.settings
  for update to authenticated using (is_admin()) with check (is_admin());

create policy transactions_select_authenticated on public.transactions
  for select to authenticated using (true);
create policy transactions_insert_authenticated on public.transactions
  for insert to authenticated with check (true);
create policy transactions_update_authenticated on public.transactions
  for update to authenticated using (true) with check (true);

create policy transaction_items_select_authenticated on public.transaction_items
  for select to authenticated using (true);
create policy transaction_items_insert_authenticated on public.transaction_items
  for insert to authenticated with check (true);
create policy transaction_items_update_authenticated on public.transaction_items
  for update to authenticated using (true) with check (true);

-- ── storage ─────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy product_images_auth_write on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');
create policy product_images_auth_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images') with check (bucket_id = 'product-images');
create policy product_images_auth_delete on storage.objects
  for delete to authenticated using (bucket_id = 'product-images');

-- ── seed ────────────────────────────────────────────────────────────────────
-- Starting exchange rates; the app refreshes them from its own sources.
insert into public.settings (key, value)
values ('rates', '{"EUR": 861.19, "USD": 748.79, "USDT": 843.59, "honest": "USDT"}')
on conflict (key) do nothing;
