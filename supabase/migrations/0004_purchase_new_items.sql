-- ---------------------------------------------------------------------------
-- Creating a product from a purchase.
--
-- A shop rarely knows a product exists before a supplier delivers it. Until now
-- the only way to buy something new was to leave the purchase, create the
-- product by hand, come back and start the basket again - and if the purchase
-- was then abandoned, the catalogue was left with a phantom product at zero
-- stock.
--
-- So the product is created by the same call that posts the purchase: a line
-- can carry a `new_item` payload instead of an `item_id`. Either the whole
-- purchase happens - product, stock, cost, history, money - or none of it does.
-- Replaying a queued offline purchase still returns early on the purchase id,
-- so the product cannot be created twice either.
--
-- Replaces post_purchase from 0003_purchases.sql. Nothing else changes.
-- ---------------------------------------------------------------------------

begin;

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

revoke all on function public.post_purchase(jsonb, jsonb) from public;
grant execute on function public.post_purchase(jsonb, jsonb) to authenticated;

commit;
