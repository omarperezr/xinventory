-- Restores post_purchase to the 0003 version, which cannot create products.
-- Re-run 0003_purchases.sql after this, or apply that file's function block on
-- its own - the tables from 0003 are untouched by 0004 and must stay.
--
-- Products already created through a purchase are left alone: they exist, they
-- have stock and history, and deleting them would erase real inventory.

begin;

drop function if exists public.post_purchase(jsonb, jsonb);

commit;
