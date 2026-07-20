-- xinventory — integrity + column-level authorization.
--
-- REVISED after pre-flight against the live database.
--
-- This migration deliberately contains NO CREATE/DROP POLICY statements. The
-- existing RLS policy set was reviewed and is correct:
--   items             SELECT true / INSERT is_admin() / UPDATE true / DELETE is_admin()
--   item_history      SELECT true / INSERT true            (already append-only)
--   transactions      SELECT true / INSERT true / UPDATE true
--   transaction_items SELECT true / INSERT true / UPDATE true
--   settings          SELECT true / INSERT is_admin() / UPDATE is_admin()
--   profiles          SELECT own-or-admin / UPDATE own, with role pinned by
--                     with_check ((role = 'admin') = is_admin())
--
-- The remaining gaps are all COLUMN-level: the broad `UPDATE true` policies
-- let any authenticated user rewrite money columns. RLS cannot express
-- per-column rules, so triggers enforce them below.
--
-- Everything here is additive and independently revertible via 0001_rollback.sql.

-- ── 0. Preconditions ──────────────────────────────────────────────────────
-- is_admin() already exists and the live policies depend on it, so it is NOT
-- redefined here — replacing it could silently change how those policies
-- behave. Fail loudly if it is missing instead.
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() is missing — existing RLS policies depend on it. Aborting.';
  end if;
end $$;

-- ── 1. items: pin price columns for non-admins ────────────────────────────
-- `items_update_authenticated` must stay open because sellers legitimately
-- update `quantity` when a sale decrements stock. Prices are another matter.
create or replace function public.guard_item_columns()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- Stock can never go negative, whatever the client sends.
alter table public.items drop constraint if exists items_quantity_nonneg;
alter table public.items add constraint items_quantity_nonneg
  check (quantity >= 0);

-- ── 2. profiles: pin can_edit_price ───────────────────────────────────────
-- The existing policy already pins `role`. It does NOT pin `can_edit_price`,
-- so a seller could grant themselves the right to edit prices at checkout.
--
-- `email` is deliberately NOT pinned: profiles.email is a denormalized copy
-- synced from auth.users by a separate trigger when a user confirms an email
-- change, and that sync runs without an admin session.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.can_edit_price := old.can_edit_price;
    new.role           := old.role;  -- belt-and-braces; policy also enforces
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ── 3. transactions: pin money columns ────────────────────────────────────
-- `transactions_update_authenticated` is open so sellers can attach receipt
-- images (addImageToTransaction). Totals and payments must not be rewritable.
create or replace function public.guard_transaction_columns()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- Records which rate the books used, so changing the honest rate later cannot
-- retroactively restate historical sales.
alter table public.transactions
  add column if not exists honest_rate numeric,
  add column if not exists honest_rate_key text;

-- ── 4. transaction_items: pin price, bound returns ────────────────────────
-- UPDATE stays open so sellers can register returns (quantity_returned).
create or replace function public.guard_transaction_item_price()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- Cost basis snapshotted at sale time. Without this, reports read the CURRENT
-- buying price — which is 0 for deleted products, showing a false 100% margin.
alter table public.transaction_items
  add column if not exists buying_price_usd numeric not null default 0;

-- Returns can never exceed what was sold, nor go negative.
alter table public.transaction_items
  drop constraint if exists txi_returned_within_bounds;
alter table public.transaction_items
  add constraint txi_returned_within_bounds
  check (quantity_returned >= 0 and quantity_returned <= quantity);

-- ── 5. settings ───────────────────────────────────────────────────────────
-- Required for `upsert({ key: 'rates' })` to resolve a conflict target.
create unique index if not exists settings_key_uidx on public.settings (key);

-- ── 6. Atomic stock movement ──────────────────────────────────────────────
-- Replaces the client-side read-modify-write in App.tsx, which loses updates
-- when two sellers check out the same product concurrently.
create or replace function public.decrement_stock(p_item_id uuid, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = public
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

revoke all on function public.decrement_stock(uuid, integer) from public;
grant execute on function public.decrement_stock(uuid, integer) to authenticated;

create or replace function public.increment_stock(p_item_id uuid, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = public
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

revoke all on function public.increment_stock(uuid, integer) from public;
grant execute on function public.increment_stock(uuid, integer) to authenticated;

-- Atomic return: bound-check, bump quantity_returned, and restock in one go.
create or replace function public.return_transaction_item(
  p_transaction_id uuid,
  p_item_id uuid,
  p_qty integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare updated int;
begin
  if p_qty <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  update public.transaction_items
     set quantity_returned = quantity_returned + p_qty
   where transaction_id = p_transaction_id
     and item_id = p_item_id
     and quantity_returned + p_qty <= quantity;

  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'RETURN_EXCEEDS_SOLD';
  end if;

  perform public.increment_stock(p_item_id, p_qty);
end
$$;

revoke all on function public.return_transaction_item(uuid, uuid, integer) from public;
grant execute on function public.return_transaction_item(uuid, uuid, integer) to authenticated;

-- ── 7. Indexes for the app's actual query patterns ────────────────────────
create index if not exists items_updated_at_idx  on public.items (updated_at desc);
create index if not exists items_barcode_idx     on public.items (barcode);
create index if not exists item_history_item_idx on public.item_history (item_id, date desc);
create index if not exists transactions_date_idx on public.transactions (date desc);
create index if not exists txi_transaction_idx   on public.transaction_items (transaction_id);

-- ── NOT DONE HERE ─────────────────────────────────────────────────────────
-- Storage bucket limits are dashboard settings, not SQL:
--   Storage > product-images > Settings
--     file size limit:      2 MB
--     allowed MIME types:   image/webp, image/jpeg, image/png
