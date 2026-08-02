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
  -- The role is NEVER taken from raw_user_meta_data: that object is whatever
  -- the signup request sent, so honouring it would let anyone with the anon
  -- key register themselves as an admin. Every new profile starts as a seller;
  -- promotion is an admin-only UPDATE (see admin-users edge function, and
  -- scripts/new-client.sh for the first admin).
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'seller'
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

    -- Stock is RPC-only for sellers. The UPDATE policy has to stay open (the
    -- stock RPCs run as the caller and PostgREST exposes the table anyway), so
    -- without this a seller could PATCH /items {"quantity": 9999} straight
    -- past increment_stock/decrement_stock, leaving no item_history row.
    -- The RPCs announce themselves with a transaction-local flag; a direct
    -- table write has no such flag and silently keeps the old quantity.
    if new.quantity is distinct from old.quantity
       and coalesce(current_setting('app.stock_rpc', true), '') <> 'on' then
      new.quantity := old.quantity;
    end if;
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

-- The recorded seller is server-derived. user_id arrives as free text (the
-- app sends the seller's display name), so an open insert let one seller post
-- a sale attributed to a colleague - and guard_transaction_columns above then
-- froze the forgery against correction. The column still holds the name, so
-- existing rows and the reports that group by it are unaffected; it is just
-- no longer the client's word for it.
create or replace function public.set_transaction_seller()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare caller_name text;
begin
  select name into caller_name from public.profiles where id = auth.uid();
  -- No profile means no user JWT (service-role tooling): keep the payload.
  if caller_name is not null then
    new.user_id := caller_name;
  end if;
  return new;
end
$$;

drop trigger if exists trg_set_transaction_seller on public.transactions;
create trigger trg_set_transaction_seller
  before insert on public.transactions
  for each row execute function public.set_transaction_seller();

-- Audit rows sign themselves with the caller's profile name. With the open
-- insert policy a seller could manipulate stock and then insert an 'adjust'
-- row signed 'admin', so the only audit trail the app has corroborated the
-- theft. Sanctioned RPCs announce themselves with the stock flag and keep
-- their own attribution ('sistema' on recreated products). Offline replays
-- run under the session that queued them (see offlineStore), so signing by
-- session stays correct for rows that land hours late.
-- ponytail: previous_stock/new_stock/action stay client-asserted - re-deriving
-- them here from items.quantity would record numbers a late replay never saw.
-- A seller can still mis-state a count, but now only under their own name.
create or replace function public.sign_item_history()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare caller_name text;
begin
  if coalesce(current_setting('app.stock_rpc', true), '') = 'on' then
    return new;
  end if;
  select name into caller_name from public.profiles where id = auth.uid();
  if caller_name is not null then
    new.user_name := caller_name;
  end if;
  return new;
end
$$;

drop trigger if exists trg_sign_item_history on public.item_history;
create trigger trg_sign_item_history
  before insert on public.item_history
  for each row execute function public.sign_item_history();

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
  -- A sale line's shape is fixed once it is sold: returns go through
  -- return_transaction_item (which restocks and leaves a history row) and
  -- announce themselves with the same transaction-local flag the stock RPCs
  -- use. Without this a seller could PATCH quantity_returned = quantity and
  -- make their own sale disappear from every report, cash included, with no
  -- stock returned and nothing in the audit trail.
  if not public.is_admin()
     and coalesce(current_setting('app.stock_rpc', true), '') <> 'on'
     and (new.quantity         is distinct from old.quantity
       or new.quantity_returned is distinct from old.quantity_returned
       or new.discount_applied  is distinct from old.discount_applied
       or new.discount_value    is distinct from old.discount_value) then
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

  -- Tells guard_item_columns this quantity change came through the sanctioned
  -- path. Transaction-local, so it cannot leak into a later request.
  perform set_config('app.stock_rpc', 'on', true);

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

  perform set_config('app.stock_rpc', 'on', true);

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

  -- Sanctioned path for both the line update below and the restock further
  -- down; see guard_transaction_item_price and guard_item_columns.
  perform set_config('app.stock_rpc', 'on', true);

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
-- Dropped, not replaced: the body moved from SQL to plpgsql so it can refuse
-- non-admins outright, and OR REPLACE cannot be trusted across languages.
drop function if exists public.report_summary(timestamptz, timestamptz);
create function public.report_summary(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb
language plpgsql stable
set search_path to 'public'
as $$
declare result jsonb;
begin
  -- The Reportes tab hides itself from sellers, but the RPC stays callable
  -- from devtools with the anon key, and it aggregates company revenue, cost,
  -- profit, margin and every colleague's totals. The split has to live here.
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  with
-- Sales in range. SECURITY INVOKER, so RLS still applies on top of the admin
-- check above: the caller only aggregates rows they can already read.
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
) into result;

  return result;
end
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

-- Policies drop-then-create so re-running this file on an already-provisioned
-- instance converges instead of failing on the first duplicate.
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated using ((id = auth.uid()) or is_admin());
drop policy if exists profiles_update_own_name on public.profiles;
create policy profiles_update_own_name on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check ((id = auth.uid()) and ((role = 'admin') = is_admin()));

-- Open to sellers on purpose: the catalogue they ring up from needs name,
-- selling price, stock and images.
-- ponytail: buying_price_usd rides along - the app fetches items with
-- select(*) and admins and sellers share the one `authenticated` role, so no
-- grant or RLS clause can mask a single column per profile role. Closing it
-- needs the cost moved to an admin-only relation plus the matching client
-- change in offlineStore/app-context.
drop policy if exists items_select_authenticated on public.items;
create policy items_select_authenticated on public.items
  for select to authenticated using (true);
drop policy if exists items_insert_admin on public.items;
create policy items_insert_admin on public.items
  for insert to authenticated with check (is_admin());
drop policy if exists items_update_authenticated on public.items;
create policy items_update_authenticated on public.items
  for update to authenticated using (true) with check (true);
drop policy if exists items_delete_admin on public.items;
create policy items_delete_admin on public.items
  for delete to authenticated using (is_admin());

drop policy if exists item_history_select_authenticated on public.item_history;
create policy item_history_select_authenticated on public.item_history
  for select to authenticated using (true);
drop policy if exists item_history_insert_authenticated on public.item_history;
create policy item_history_insert_authenticated on public.item_history
  for insert to authenticated with check (true);

drop policy if exists settings_select_authenticated on public.settings;
create policy settings_select_authenticated on public.settings
  for select to authenticated using (true);
drop policy if exists settings_upsert_admin on public.settings;
create policy settings_upsert_admin on public.settings
  for insert to authenticated with check (is_admin());
drop policy if exists settings_update_admin on public.settings;
create policy settings_update_admin on public.settings
  for update to authenticated using (is_admin()) with check (is_admin());

-- Sellers read only their own sales. The history screen already filtered to
-- the signed-in seller; an open SELECT still let any seller total the shop's
-- (and each colleague's) takings from devtools. user_id holds the seller's
-- display name (legacy schema), stamped server-side by set_transaction_seller.
-- ponytail: name-keyed, so renaming a user hides their older sales from them
-- (admins still see everything); keying by uuid needs a backfill and a client
-- change.
drop policy if exists transactions_select_authenticated on public.transactions;
create policy transactions_select_authenticated on public.transactions
  for select to authenticated
  using (
    is_admin()
    or user_id = (select name from public.profiles where id = auth.uid())
  );
drop policy if exists transactions_insert_authenticated on public.transactions;
create policy transactions_insert_authenticated on public.transactions
  for insert to authenticated with check (true);
drop policy if exists transactions_update_authenticated on public.transactions;
create policy transactions_update_authenticated on public.transactions
  for update to authenticated using (true) with check (true);

-- Sale lines carry the cost snapshot; visibility rides on the parent sale's
-- policy above (the subquery runs as the caller, so its RLS applies).
drop policy if exists transaction_items_select_authenticated on public.transaction_items;
create policy transaction_items_select_authenticated on public.transaction_items
  for select to authenticated
  using (exists (
    select 1 from public.transactions t where t.id = transaction_id
  ));
drop policy if exists transaction_items_insert_authenticated on public.transaction_items;
create policy transaction_items_insert_authenticated on public.transaction_items
  for insert to authenticated with check (true);
drop policy if exists transaction_items_update_authenticated on public.transaction_items;
create policy transaction_items_update_authenticated on public.transaction_items
  for update to authenticated using (true) with check (true);

-- ── function privileges ─────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC on every new function, and these are
-- SECURITY DEFINER, so without this block the anon key shipped in the browser
-- bundle can move stock with no session at all - an ex-employee with a cached
-- item id could keep zeroing the catalogue.
revoke execute on function public.increment_stock(uuid, integer) from public, anon;
revoke execute on function public.decrement_stock(uuid, integer) from public, anon;
revoke execute on function public.return_transaction_item(uuid, uuid, integer) from public, anon;
grant execute on function public.increment_stock(uuid, integer) to authenticated;
grant execute on function public.decrement_stock(uuid, integer) to authenticated;
grant execute on function public.return_transaction_item(uuid, uuid, integer) to authenticated;
-- report_summary refuses non-admins itself; the revoke keeps the anon key
-- from reaching it at all.
revoke execute on function public.report_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.report_summary(timestamptz, timestamptz) to authenticated;

-- ── storage ─────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists product_images_auth_write on storage.objects;
create policy product_images_auth_write on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');
-- Uploads are immutable, uuid-named blobs: nothing in the app ever updates
-- or deletes them, so mutating the public photo library is admin-only. The
-- old open policies let any seller overwrite or wipe every product photo.
drop policy if exists product_images_auth_update on storage.objects;
create policy product_images_auth_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists product_images_auth_delete on storage.objects;
create policy product_images_auth_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ── seed ────────────────────────────────────────────────────────────────────
-- Starting exchange rates; the app refreshes them from its own sources.
insert into public.settings (key, value)
values ('rates', '{"EUR": 861.19, "USD": 748.79, "USDT": 843.59, "honest": "USDT"}')
on conflict (key) do nothing;
