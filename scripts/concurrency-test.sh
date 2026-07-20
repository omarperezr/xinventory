#!/usr/bin/env bash
#
# Proves that decrement_stock cannot oversell under real concurrency.
#
# It creates a throwaway item with a known stock level, then fires N
# simultaneous "sell one unit" calls from N separate database sessions and
# counts how many succeeded. With the old client-side read-modify-write, more
# calls succeeded than there was stock. With the atomic function, successes
# must exactly equal the starting stock.
#
# The test item is created and deleted by this script. Real inventory is never
# touched.
#
# Usage:
#   ./scripts/concurrency-test.sh "postgresql://postgres.REF:PASS@HOST:5432/postgres"
#   ./scripts/concurrency-test.sh "$DB_URL" 10 25    # stock=10, attempts=25

set -uo pipefail

DB_URL="${1:-}"
STOCK="${2:-10}"
ATTEMPTS="${3:-25}"

if [[ -z "$DB_URL" ]]; then
  echo "usage: $0 <postgres-connection-uri> [stock] [attempts]" >&2
  exit 1
fi

# Prefer a v17 client if one is installed; the pooler runs Postgres 17.
PSQL=psql
[[ -x /usr/lib/postgresql/17/bin/psql ]] && PSQL=/usr/lib/postgresql/17/bin/psql

BARCODE="ZZZ-CONCURRENCY-$$"
TMPDIR_RUN="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_RUN"' EXIT

cleanup_item() {
  "$PSQL" "$DB_URL" -q -c \
    "delete from public.items where barcode = '$BARCODE';" >/dev/null 2>&1
}

echo "Creating test item with stock=$STOCK ..."
ITEM_ID=$("$PSQL" "$DB_URL" -tAq -c "
  insert into public.items (
    id, name, barcode, buying_price_usd, selling_price_usd,
    quantity, unit, includes_taxes, discount, images, type, brand, notes
  ) values (
    gen_random_uuid(), 'ZZZ TEST CONCURRENCY', '$BARCODE', 1, 2,
    $STOCK, 'units', false, 0, '{}', 'TEST', 'TEST', 'temporary, safe to delete'
  ) returning id;
")

if [[ -z "$ITEM_ID" ]]; then
  echo "FAILED: could not create the test item. Check the connection string." >&2
  exit 1
fi
trap 'cleanup_item; rm -rf "$TMPDIR_RUN"' EXIT
echo "  item id: $ITEM_ID"

echo "Firing $ATTEMPTS simultaneous single-unit sales ..."
for i in $(seq 1 "$ATTEMPTS"); do
  (
    if "$PSQL" "$DB_URL" -tAq -c \
        "select public.decrement_stock('$ITEM_ID'::uuid, 1);" >/dev/null 2>&1; then
      echo ok > "$TMPDIR_RUN/$i"
    else
      echo fail > "$TMPDIR_RUN/$i"
    fi
  ) &
done
wait

OK=$(grep -lx ok "$TMPDIR_RUN"/* 2>/dev/null | wc -l | tr -d ' ')
FAIL=$(grep -lx fail "$TMPDIR_RUN"/* 2>/dev/null | wc -l | tr -d ' ')
FINAL=$("$PSQL" "$DB_URL" -tAq -c \
  "select quantity from public.items where id = '$ITEM_ID'::uuid;")

echo
echo "  starting stock : $STOCK"
echo "  attempts       : $ATTEMPTS"
echo "  succeeded      : $OK"
echo "  refused        : $FAIL"
echo "  final stock    : $FINAL"
echo

STATUS=0
if [[ "$OK" -ne "$STOCK" ]]; then
  echo "FAIL: $OK sales succeeded against $STOCK units of stock."
  echo "      Overselling is still possible."
  STATUS=1
elif [[ "$FINAL" -ne 0 ]]; then
  echo "FAIL: final stock is $FINAL, expected 0."
  STATUS=1
else
  echo "PASS: exactly $STOCK of $ATTEMPTS sales succeeded and stock landed on 0."
  echo "      Concurrent sellers cannot oversell."
fi

echo "Cleaning up test item ..."
exit $STATUS
