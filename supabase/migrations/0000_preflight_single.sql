-- PRE-FLIGHT, single result set. Read-only.
-- The Supabase SQL editor only displays the LAST statement's result, so every
-- check below is unioned into one table. Run it whole and paste the output.
--
-- Read the `status` column: FIX rows must be resolved before applying
-- 0001_security_and_integrity.sql.

with
-- ── A. tables, RLS state, policy counts ──────────────────────────────────
a as (
  select
    'A. tables'                                     as section,
    t.tablename                                     as subject,
    'rls=' || t.rowsecurity ||
      ', policies=' || (
        select count(*) from pg_policies p
        where p.schemaname = 'public' and p.tablename = t.tablename
      )                                             as detail,
    case
      when t.rowsecurity and (
        select count(*) from pg_policies p
        where p.schemaname = 'public' and p.tablename = t.tablename) = 0
      then 'FIX: RLS on with no policies — table is unreachable'
      else 'ok'
    end                                             as status
  from pg_tables t
  where t.schemaname = 'public'
    and t.tablename in ('profiles','items','item_history',
                        'transactions','transaction_items','settings')
),

-- ── B. pre-existing policies (these survive 0001 unless named identically)
b as (
  select
    'B. existing policy' as section,
    tablename || '.' || policyname as subject,
    cmd::text as detail,
    case
      when policyname in (
        'profiles_select','profiles_update_own','items_select','items_insert',
        'items_update','items_delete','item_history_select','item_history_insert',
        'transactions_select','transactions_insert','transactions_update',
        'transactions_delete','transaction_items_select','transaction_items_insert',
        'transaction_items_update','settings_select','settings_write')
      then 'ok: 0001 replaces this'
      else 'REVIEW: survives 0001 and stacks (policies are OR-ed)'
    end as status
  from pg_policies
  where schemaname = 'public'
),

-- ── C. columns 0001 depends on ───────────────────────────────────────────
expected(tbl, col) as (
  values
    ('profiles','id'),('profiles','role'),('profiles','can_edit_price'),('profiles','email'),
    ('items','id'),('items','quantity'),('items','updated_at'),
    ('transactions','id'),('transactions','subtotal_usd'),('transactions','tax_usd'),
    ('transactions','total_usd'),('transactions','payments'),('transactions','date'),
    ('transactions','user_id'),
    ('transaction_items','transaction_id'),('transaction_items','item_id'),
    ('transaction_items','price_usd'),('transaction_items','quantity'),
    ('transaction_items','quantity_returned'),
    ('settings','key'),('settings','value')
),
c as (
  select
    'C. column' as section,
    e.tbl || '.' || e.col as subject,
    coalesce(ic.data_type, '—') as detail,
    case when ic.column_name is null
         then 'FIX: MISSING — 0001 will abort here'
         else 'ok' end as status
  from expected e
  left join information_schema.columns ic
    on ic.table_schema = 'public'
   and ic.table_name   = e.tbl
   and ic.column_name  = e.col
),

-- ── D. rows that would violate the new constraints ───────────────────────
d as (
  select 'D. data check' as section,
         'items.quantity < 0' as subject,
         count(*)::text as detail,
         case when count(*) > 0
              then 'FIX: blocks items_quantity_nonneg'
              else 'ok' end as status
  from public.items where quantity < 0
  union all
  select 'D. data check',
         'transaction_items.quantity_returned out of bounds',
         count(*)::text,
         case when count(*) > 0
              then 'FIX: blocks txi_returned_within_bounds'
              else 'ok' end
  from public.transaction_items
  where quantity_returned < 0 or quantity_returned > quantity
  union all
  select 'D. data check',
         'duplicate settings.key',
         count(*)::text,
         case when count(*) > 0
              then 'FIX: blocks settings_key_uidx'
              else 'ok' end
  from (
    select key from public.settings group by key having count(*) > 1
  ) dup
),

-- ── E. admin presence ────────────────────────────────────────────────────
e as (
  select
    'E. roles' as section,
    coalesce(role::text, '(null)') as subject,
    count(*)::text as detail,
    case when coalesce(role::text,'') = 'admin' and count(*) > 0
         then 'ok' else '' end as status
  from public.profiles group by role
  union all
  select 'E. roles', 'ADMIN PRESENT?', '',
    case when exists (select 1 from public.profiles where role = 'admin')
         then 'ok'
         else 'FIX: no admin — nobody can edit prices/rates after 0001' end
),

-- ── F. storage bucket ────────────────────────────────────────────────────
f as (
  select 'F. storage' as section,
         'bucket product-images' as subject,
         'public=' || coalesce(public::text,'?') ||
           ', size_limit=' || coalesce(file_size_limit::text,'none') as detail,
         case when file_size_limit is null
              then 'REVIEW: no upload size limit set'
              else 'ok' end as status
  from storage.buckets where id = 'product-images'
)

select * from a
union all select * from b
union all select * from c
union all select * from d
union all select * from e
union all select * from f
order by section, subject;
