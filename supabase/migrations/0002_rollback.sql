-- Undoes 0002_finance.sql. Drops the ledger and everything that defines it, so
-- take a backup first: this deletes recorded expenses, not just structure.
-- Order matters - entries reference every other finance table.

begin;

drop function if exists public.finance_summary(timestamptz, timestamptz);

drop table if exists public.finance_entries;
drop table if exists public.finance_allocations;
drop table if exists public.finance_recurring;
drop table if exists public.finance_payees;
drop table if exists public.finance_categories;
drop table if exists public.finance_accounts;

commit;
