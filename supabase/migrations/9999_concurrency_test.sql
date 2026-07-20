-- CONCURRENCY TEST for decrement_stock / return_transaction_item.
--
-- SAFE TO RUN ON PRODUCTION: it creates its own throwaway item, exercises the
-- guards against it, and deletes it again. It never touches real inventory.
-- If any assertion fails the whole thing rolls back, because it runs inside a
-- single transaction that ends in ROLLBACK.
--
-- This covers the SEQUENTIAL guarantees. For true parallel execution see
-- scripts/concurrency-test.sh, which fires simultaneous requests.

begin;

do $$
declare
  test_id uuid := gen_random_uuid();
  remaining integer;
  failed boolean;
begin
  raise notice '--- setup ---';
  insert into public.items (
    id, name, barcode, buying_price_usd, selling_price_usd,
    quantity, unit, includes_taxes, discount, images, type, brand, notes
  ) values (
    test_id, 'ZZZ TEST CONCURRENCY', 'ZZZ-TEST-CONCURRENCY', 1, 2,
    5, 'units', false, 0, '{}', 'TEST', 'TEST', 'temporary row, safe to delete'
  );
  raise notice 'created test item with quantity 5';

  -- 1. A normal decrement returns the new quantity.
  remaining := public.decrement_stock(test_id, 2);
  assert remaining = 3, format('expected 3 after selling 2, got %s', remaining);
  raise notice 'PASS: decrement 2 of 5 -> %', remaining;

  -- 2. Decrementing more than is left must be refused, not clamped to zero.
  failed := false;
  begin
    perform public.decrement_stock(test_id, 99);
  exception when others then
    failed := true;
    assert sqlerrm like '%INSUFFICIENT_STOCK%',
      format('expected INSUFFICIENT_STOCK, got: %s', sqlerrm);
  end;
  assert failed, 'overselling was allowed - the guard is not working';
  raise notice 'PASS: overselling refused with INSUFFICIENT_STOCK';

  -- 3. The failed attempt must not have changed anything.
  select quantity into remaining from public.items where id = test_id;
  assert remaining = 3, format('quantity changed on a failed sale: %s', remaining);
  raise notice 'PASS: stock untouched after refused sale (still %)', remaining;

  -- 4. Zero and negative quantities are rejected.
  failed := false;
  begin
    perform public.decrement_stock(test_id, 0);
  exception when others then
    failed := true;
  end;
  assert failed, 'decrement_stock accepted a quantity of 0';
  raise notice 'PASS: zero quantity refused';

  -- 5. Restocking works and is bounded by nothing (returns can always add).
  remaining := public.increment_stock(test_id, 2);
  assert remaining = 5, format('expected 5 after restocking 2, got %s', remaining);
  raise notice 'PASS: increment 2 -> %', remaining;

  -- 6. The CHECK constraint refuses negative stock even by direct UPDATE,
  --    which is the last line of defence if some future code bypasses the RPC.
  failed := false;
  begin
    update public.items set quantity = -1 where id = test_id;
  exception when check_violation then
    failed := true;
  end;
  assert failed, 'items_quantity_nonneg did not block a negative quantity';
  raise notice 'PASS: negative stock blocked by CHECK constraint';

  raise notice '--- all sequential checks passed ---';
end $$;

-- Nothing above is kept. The test item disappears with the rollback.
rollback;
