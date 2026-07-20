-- ROLLBACK for 0001_security_and_integrity.sql (revised).
--
-- The revised 0001 touches NO policies and does NOT enable/disable RLS, so
-- this rollback cannot lock you out or open you up — it only removes the
-- triggers and constraints that 0001 added.
--
-- Added COLUMNS are intentionally left in place: they are additive, harmless,
-- and dropping buying_price_usd would destroy captured cost-basis data.
-- Indexes are left too — they only affect performance.

-- ── Column-authorization triggers ─────────────────────────────────────────
drop trigger if exists trg_guard_item_columns       on public.items;
drop trigger if exists trg_guard_profile_privileges on public.profiles;
drop trigger if exists trg_guard_transaction_columns on public.transactions;
drop trigger if exists trg_guard_txi_price          on public.transaction_items;

drop function if exists public.guard_item_columns();
drop function if exists public.guard_profile_privileges();
drop function if exists public.guard_transaction_columns();
drop function if exists public.guard_transaction_item_price();

-- NOTE: public.is_admin() is NOT dropped. It pre-dates this migration and the
-- live RLS policies depend on it — dropping it would break them.

-- ── Constraints that could block a write ──────────────────────────────────
alter table public.items
  drop constraint if exists items_quantity_nonneg;
alter table public.transaction_items
  drop constraint if exists txi_returned_within_bounds;

-- ── settings unique index ─────────────────────────────────────────────────
-- Only drop this if it caused a conflict; the app's rates upsert needs it.
-- drop index if exists public.settings_key_uidx;

-- ── RPCs (safe to keep — nothing calls them until the client is wired) ────
-- drop function if exists public.return_transaction_item(uuid, uuid, integer);
-- drop function if exists public.decrement_stock(uuid, integer);
-- drop function if exists public.increment_stock(uuid, integer);
