-- Undoes 0003_purchases.sql. Take a backup first: this deletes the purchase
-- history, not just structure. Stock already moved by those purchases stays as
-- it is - reversing it would be wrong, since the goods really did arrive.
--
-- The finance_entries rows the purchases created are left alone on purpose:
-- the money did leave the business. Delete them separately if that is what you
-- actually want.

begin;

drop function if exists public.post_purchase_return(jsonb, jsonb);
drop function if exists public.post_purchase(jsonb, jsonb);

drop table if exists public.purchase_return_lines;
drop table if exists public.purchase_returns;
drop table if exists public.purchase_lines;
drop table if exists public.purchases;
drop table if exists public.item_suppliers;

-- Restore the original action set. Any 'purchase'/'adjust'/'purchase_return'
-- rows would violate it, so they are relabelled as plain updates first.
update public.item_history
  set action = 'update'
where action in ('purchase', 'adjust', 'purchase_return');

alter table public.item_history drop constraint if exists item_history_action_check;
alter table public.item_history
  add constraint item_history_action_check check (
    action in ('create', 'update', 'delete', 'sale', 'return')
  );

alter table public.item_history drop column if exists reason;

commit;
