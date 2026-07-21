// Offline-aware cache and outbox for the `items`/`item_history`/`settings`
// tables. Unlike a REST backend, there is no server to proxy requests
// through here - queued operations are replayed by calling the Supabase
// SDK directly once connectivity returns.
import { supabase } from "../services/supabase";
import type { ItemHistoryRecord, UnitType } from "../context/app-context";
import { idbGet, idbSet } from "./localdb";

const ITEMS_KEY = "items";
const HISTORY_KEY = "item_history";
const OUTBOX_KEY = "outbox";
const FINANCE_ENTRIES_KEY = "finance_entries";
const FINANCE_CATALOG_KEY = "finance_catalog";

export interface ItemRow {
  id: string;
  name: string;
  barcode: string;
  buying_price_usd: number;
  selling_price_usd: number;
  quantity: number;
  unit: UnitType;
  includes_taxes: boolean;
  discount: number;
  images: string[];
  type: string;
  brand: string;
  notes: string;
  updated_at?: string;
  created_at?: string;
}

// --- Finance -----------------------------------------------------------
// Row shapes for the ledger. Amounts are USD; a bolivar payment carries the
// bolivares AND the rate that valued them, so history cannot be restated by a
// later rate change.

export interface FinanceAccountRow {
  id: string;
  name: string;
  kind: "cash" | "bank" | "digital" | "credit" | "other";
  basis: "USD" | "BS";
  opening_balance_usd: number;
  opening_balance_bs: number;
  active: boolean;
  sort_order: number;
  payment_methods: string[];
  notes: string;
}

export interface FinanceCategoryRow {
  id: string;
  name: string;
  kind: "income" | "expense";
  nature: "cogs" | "fixed" | "variable" | "tax" | "investment" | "owner" | "other";
  monthly_budget_usd: number | null;
  color: string | null;
  archived: boolean;
}

export interface FinancePayeeRow {
  id: string;
  name: string;
  kind:
    | "employee"
    | "supplier"
    | "landlord"
    | "service"
    | "government"
    | "customer"
    | "other";
  phone: string;
  cedula_rif: string;
  notes: string;
  base_salary_usd: number | null;
  pay_cadence: "weekly" | "biweekly" | "monthly" | null;
  active: boolean;
}

export interface FinanceRecurringRow {
  id: string;
  name: string;
  kind: "income" | "expense";
  category_id: string | null;
  account_id: string | null;
  payee_id: string | null;
  amount_usd: number;
  cadence: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  anchor_date: string;
  ends_on: string | null;
  active: boolean;
  notes: string;
}

export interface FinanceAllocationRow {
  id: string;
  name: string;
  basis: "gross_sales" | "gross_profit" | "net_profit";
  percent: number;
  account_id: string | null;
  target_usd: number | null;
  active: boolean;
  notes: string;
}

export interface FinanceEntryRow {
  id: string;
  kind: "income" | "expense" | "transfer";
  status: "paid" | "pending" | "void";
  occurred_on: string;
  due_on: string | null;
  category_id: string | null;
  account_id: string | null;
  counter_account_id: string | null;
  payee_id: string | null;
  amount_usd: number;
  amount_bs: number | null;
  rate_used: number | null;
  rate_key: "USD" | "EUR" | "USDT" | null;
  paid_in: "USD" | "BS";
  description: string;
  notes: string;
  tags: string[];
  attachments: string[];
  recurring_id: string | null;
  period_key: string | null;
  allocation_id: string | null;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

// --- Purchases ---------------------------------------------------------

export interface PurchaseRow {
  id: string;
  supplier_id: string | null;
  account_id: string | null;
  category_id: string | null;
  occurred_on: string;
  due_on: string | null;
  payment_status: "paid" | "pending";
  goods_usd: number;
  freight_usd: number;
  prorate_freight: boolean;
  credit_applied_usd: number;
  total_usd: number;
  paid_in: "USD" | "BS";
  amount_bs: number | null;
  rate_used: number | null;
  rate_key: "USD" | "EUR" | "USDT" | null;
  invoice_number: string;
  notes: string;
  attachments: string[];
  entry_id: string | null;
  status: "posted" | "void";
  created_by: string;
  created_at?: string;
}

export interface PurchaseLineRow {
  id: string;
  purchase_id: string;
  item_id: string | null;
  name: string;
  quantity: number;
  unit_cost_usd: number;
  landed_unit_cost_usd: number;
  quantity_returned: number;
}

export interface PurchaseReturnRow {
  id: string;
  purchase_id: string;
  supplier_id: string | null;
  occurred_on: string;
  settlement: "credit" | "cash";
  account_id: string | null;
  entry_id: string | null;
  total_usd: number;
  reason: string;
  notes: string;
  created_by: string;
  created_at?: string;
}

export interface ItemSupplierRow {
  id: string;
  item_id: string;
  supplier_id: string;
  supplier_sku: string;
  last_cost_usd: number | null;
  last_purchased_on: string | null;
  notes: string;
}

/** What `post_purchase` accepts. Mirrors the RPC's jsonb argument. */
export interface PurchasePayload {
  id: string;
  supplier_id: string | null;
  account_id: string | null;
  category_id: string | null;
  occurred_on: string;
  due_on: string | null;
  payment_status: "paid" | "pending";
  freight_usd: number;
  prorate_freight: boolean;
  credit_applied_usd: number;
  paid_in: "USD" | "BS";
  amount_bs: number | null;
  rate_used: number | null;
  rate_key: "USD" | "EUR" | "USDT" | null;
  invoice_number: string;
  notes: string;
  attachments: string[];
  created_by: string;
}

export interface PurchaseLinePayload {
  item_id: string | null;
  name: string;
  quantity: number;
  unit_cost_usd: number;
}

export interface PurchaseReturnPayload {
  id: string;
  purchase_id: string;
  occurred_on: string;
  settlement: "credit" | "cash";
  account_id: string | null;
  reason: string;
  notes: string;
  created_by: string;
}

export interface PurchaseReturnLinePayload {
  purchase_line_id: string;
  quantity: number;
}

/** The definitions the ledger points at. Small, slow-changing, cached whole. */
export interface FinanceCatalog {
  accounts: FinanceAccountRow[];
  categories: FinanceCategoryRow[];
  payees: FinancePayeeRow[];
  recurring: FinanceRecurringRow[];
  allocations: FinanceAllocationRow[];
}

export interface HistoryRow {
  id?: string;
  item_id: string;
  date?: string;
  // The set of actions is defined once, on the record the UI consumes.
  action: ItemHistoryRecord["action"];
  details: string;
  user_name: string;
  previous_stock?: number;
  new_stock?: number;
  /** Why an adjustment or a supplier return happened. */
  reason?: string;
}

type OutboxOp =
  | { kind: "item.create"; row: ItemRow; historyRow: HistoryRow }
  | { kind: "item.update"; id: string; row: Partial<ItemRow>; historyRow?: HistoryRow }
  | { kind: "item.delete"; id: string }
  | { kind: "item.bulkDelete"; ids: string[]; historyRows: HistoryRow[] }
  | { kind: "rates.update"; value: RatesValue }
  // Stock moves are queued as DELTAS, not absolute quantities. An absolute
  // snapshot captured while offline would overwrite whatever the server has
  // by the time it replays, silently discarding other sellers' sales.
  | {
      kind: "stock.delta";
      itemId: string;
      delta: number;
      historyRow?: HistoryRow;
    }
  | {
      kind: "txi.return";
      transactionId: string;
      itemId: string;
      qty: number;
    }
  // Recording an expense is exactly the operation most likely to happen away
  // from a signal - at a pump, in a supplier's warehouse - so ledger writes
  // queue like stock writes do. The id is minted on the device, so a replay
  // cannot duplicate the row.
  | { kind: "finance.entry.create"; row: FinanceEntryRow }
  | { kind: "finance.entry.update"; id: string; row: Partial<FinanceEntryRow> }
  | { kind: "finance.entry.delete"; id: string }
  // A purchase is one RPC carrying its whole basket, so queueing it keeps the
  // all-or-nothing guarantee: stock, costs, history and money still land
  // together whenever the replay happens. The id travels with the payload, and
  // the server returns early if it already posted.
  | { kind: "purchase.post"; purchase: PurchasePayload; lines: PurchaseLinePayload[] }
  | {
      kind: "purchase.return";
      payload: PurchaseReturnPayload;
      lines: PurchaseReturnLinePayload[];
    };

// `honest` records which rate the business treats as the real bolivar worth.
export interface RatesValue {
  USD: number;
  EUR: number;
  USDT: number;
  honest: "USD" | "EUR" | "USDT";
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

// True for errors that mean "couldn't reach the server" (so the op should
// stay queued and be retried), as opposed to errors the server actively
// returned (a real rejection - e.g. constraint violation - which should be
// dropped rather than retried forever).
function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  // A `code` means the server answered and rejected the operation.
  return !("code" in error) || !(error as { code?: unknown }).code;
}

async function getOutbox(): Promise<OutboxOp[]> {
  return (await idbGet<OutboxOp[]>(OUTBOX_KEY)) || [];
}

async function setOutbox(ops: OutboxOp[]): Promise<void> {
  await idbSet(OUTBOX_KEY, ops);
}

async function enqueue(op: OutboxOp): Promise<void> {
  const ops = await getOutbox();
  ops.push(op);
  await setOutbox(ops);
}

export async function getOutboxCount(): Promise<number> {
  return (await getOutbox()).length;
}

// Network-first fetch of the item list, falling back to the IndexedDB cache
// when offline or the request fails. A successful fetch refreshes the cache so
// the next offline session starts with current data.
//
// This deliberately does NOT load item_history. That table grows without limit
// and only two screens need it: the table shows a single "last movement" date
// (which items.updated_at already provides) and the history dialog needs one
// item at a time, loaded on demand by fetchItemHistory below.
export async function fetchInventory(): Promise<{
  itemRows: ItemRow[];
  offline: boolean;
}> {
  if (isOnline()) {
    try {
      const { data: itemRows, error } = await supabase
        .from("items")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      await idbSet(ITEMS_KEY, itemRows || []);
      return { itemRows: itemRows || [], offline: false };
    } catch {
      // fall through to cache
    }
  }
  const itemRows = (await idbGet<ItemRow[]>(ITEMS_KEY)) || [];
  return { itemRows, offline: true };
}

// Loads the movement history for a single item, newest first. Falls back to
// whatever the local cache holds, which offline means the entries this device
// created and has not synced yet.
export async function fetchItemHistory(itemId: string): Promise<HistoryRow[]> {
  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from("item_history")
        .select("*")
        .eq("item_id", itemId)
        .order("date", { ascending: false })
        .limit(200);
      if (error) throw error;
      if (data) return data as HistoryRow[];
    } catch {
      // fall through to cache
    }
  }
  const cached = (await idbGet<HistoryRow[]>(HISTORY_KEY)) || [];
  return cached.filter((h) => h.item_id === itemId);
}

async function patchCachedItems(mutate: (rows: ItemRow[]) => ItemRow[]): Promise<void> {
  const rows = (await idbGet<ItemRow[]>(ITEMS_KEY)) || [];
  await idbSet(ITEMS_KEY, mutate(rows));
}

async function patchCachedHistory(mutate: (rows: HistoryRow[]) => HistoryRow[]): Promise<void> {
  const rows = (await idbGet<HistoryRow[]>(HISTORY_KEY)) || [];
  await idbSet(HISTORY_KEY, mutate(rows));
}

export async function createItem(row: ItemRow, historyRow: HistoryRow): Promise<{ queued: boolean }> {
  await patchCachedItems((rows) => [row, ...rows]);
  await patchCachedHistory((rows) => [historyRow, ...rows]);

  if (isOnline()) {
    const { error } = await supabase.from("items").insert(row);
    if (!error) {
      await supabase.from("item_history").insert(historyRow);
      return { queued: false };
    }
    if (!isNetworkError(error)) throw error;
  }
  await enqueue({ kind: "item.create", row, historyRow });
  return { queued: true };
}

export async function updateItem(
  id: string,
  row: Partial<ItemRow>,
  historyRow?: HistoryRow,
): Promise<{ queued: boolean }> {
  await patchCachedItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...row } : r)));
  if (historyRow) await patchCachedHistory((rows) => [historyRow, ...rows]);

  if (isOnline()) {
    const { error } = await supabase.from("items").update(row).eq("id", id);
    if (!error) {
      if (historyRow) await supabase.from("item_history").insert(historyRow);
      return { queued: false };
    }
    if (!isNetworkError(error)) throw error;
  }
  await enqueue({ kind: "item.update", id, row, historyRow });
  return { queued: true };
}

export async function deleteItem(id: string): Promise<{ queued: boolean }> {
  await patchCachedItems((rows) => rows.filter((r) => r.id !== id));

  if (isOnline()) {
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (!error) return { queued: false };
    if (!isNetworkError(error)) throw error;
  }
  await enqueue({ kind: "item.delete", id });
  return { queued: true };
}

export async function bulkDeleteItems(
  ids: string[],
  historyRows: HistoryRow[],
): Promise<{ queued: boolean }> {
  const idSet = new Set(ids);
  await patchCachedItems((rows) => rows.filter((r) => !idSet.has(r.id)));
  await patchCachedHistory((rows) => [...historyRows, ...rows]);

  if (isOnline()) {
    const { error } = await supabase.from("items").delete().in("id", ids);
    if (!error) {
      if (historyRows.length) await supabase.from("item_history").insert(historyRows);
      return { queued: false };
    }
    if (!isNetworkError(error)) throw error;
  }
  await enqueue({ kind: "item.bulkDelete", ids, historyRows });
  return { queued: true };
}

export async function updateRates(value: RatesValue): Promise<{ queued: boolean }> {
  if (isOnline()) {
    const { error } = await supabase.from("settings").upsert({ key: "rates", value });
    if (!error) return { queued: false };
    if (!isNetworkError(error)) throw error;
  }
  await enqueue({ kind: "rates.update", value });
  return { queued: true };
}

// Guards against concurrent replays. Three independent callers can trigger a
// flush (the `online` event, the 5s poll in OfflineSync, and app-context), and
// without this they interleave and can apply the same queued op twice.
let flushing = false;

// Applies a stock movement atomically on the server, so two sellers checking
// out the same product cannot overwrite each other. Falls back to a queued
// delta when offline.
// delta < 0 removes stock (a sale), delta > 0 returns it.
async function callStockRpc(itemId: string, delta: number) {
  const fn = delta < 0 ? "decrement_stock" : "increment_stock";
  return supabase.rpc(fn, { p_item_id: itemId, p_qty: Math.abs(delta) });
}

export async function applyStockDelta(
  itemId: string,
  delta: number,
  historyRow?: HistoryRow,
): Promise<{ queued: boolean }> {
  if (delta === 0) return { queued: false };

  // Optimistic local echo so the UI reflects the change immediately.
  await patchCachedItems((rows) =>
    rows.map((r) =>
      r.id === itemId
        ? { ...r, quantity: Math.max(0, (r.quantity ?? 0) + delta) }
        : r,
    ),
  );
  if (historyRow) await patchCachedHistory((rows) => [historyRow, ...rows]);

  if (isOnline()) {
    const { error } = await callStockRpc(itemId, delta);
    if (!error) {
      if (historyRow) await supabase.from("item_history").insert(historyRow);
      return { queued: false };
    }
    // INSUFFICIENT_STOCK and friends are real rejections - surface them
    // rather than queueing an operation the server will never accept. Undo the
    // optimistic patch first, or the cache keeps a quantity the server refused.
    if (!isNetworkError(error)) {
      await patchCachedItems((rows) =>
        rows.map((r) =>
          r.id === itemId
            ? { ...r, quantity: Math.max(0, (r.quantity ?? 0) - delta) }
            : r,
        ),
      );
      if (historyRow) {
        await patchCachedHistory((rows) => rows.filter((h) => h !== historyRow));
      }
      throw error;
    }
  }
  await enqueue({ kind: "stock.delta", itemId, delta, historyRow });
  return { queued: true };
}

// Registers a return: bumps quantity_returned and restocks the item in one
// server-side transaction, bounded by the sold quantity. When the product was
// deleted since the sale, the server recreates it from the sale line and
// reports that back as `restored`.
export async function returnTransactionItem(
  transactionId: string,
  itemId: string,
  qty: number,
): Promise<{ queued: boolean; restored?: boolean }> {
  if (isOnline()) {
    const { data, error } = await supabase.rpc("return_transaction_item", {
      p_transaction_id: transactionId,
      p_item_id: itemId,
      p_qty: qty,
    });
    if (!error) {
      const result = data as { restored?: boolean } | null;
      return { queued: false, restored: !!result?.restored };
    }
    if (!isNetworkError(error)) throw error;
  }
  // Echo the restock locally; the return itself lands on the next sync.
  await patchCachedItems((rows) =>
    rows.map((r) => (r.id === itemId ? { ...r, quantity: r.quantity + qty } : r)),
  );
  await enqueue({ kind: "txi.return", transactionId, itemId, qty });
  return { queued: true };
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

/** The definitions, fetched together because they are small and always needed
 *  as a set. Cached whole so the ledger still renders names when offline. */
export async function fetchFinanceCatalog(): Promise<{
  catalog: FinanceCatalog;
  offline: boolean;
}> {
  if (isOnline()) {
    try {
      const [accounts, categories, payees, recurring, allocations] =
        await Promise.all([
          supabase.from("finance_accounts").select("*").order("sort_order"),
          supabase.from("finance_categories").select("*").order("name"),
          supabase.from("finance_payees").select("*").order("name"),
          supabase.from("finance_recurring").select("*").order("name"),
          supabase.from("finance_allocations").select("*").order("name"),
        ]);
      const error =
        accounts.error ||
        categories.error ||
        payees.error ||
        recurring.error ||
        allocations.error;
      if (error) throw error;

      const catalog: FinanceCatalog = {
        accounts: accounts.data || [],
        categories: categories.data || [],
        payees: payees.data || [],
        recurring: recurring.data || [],
        allocations: allocations.data || [],
      };
      await idbSet(FINANCE_CATALOG_KEY, catalog);
      return { catalog, offline: false };
    } catch {
      // fall through to cache
    }
  }
  const cached = (await idbGet<FinanceCatalog>(FINANCE_CATALOG_KEY)) || {
    accounts: [],
    categories: [],
    payees: [],
    recurring: [],
    allocations: [],
  };
  return { catalog: cached, offline: true };
}

/** A bounded window of the ledger, newest first. Same contract as the sales
 *  history: the screen says out loud when the window is short rather than
 *  under-reporting. */
export async function fetchFinanceEntries(
  limit: number,
): Promise<{ rows: FinanceEntryRow[]; hasMore: boolean; offline: boolean }> {
  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from("finance_entries")
        .select("*")
        .neq("status", "void")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit + 1);
      if (error) throw error;
      const all = data || [];
      const rows = all.slice(0, limit);
      await idbSet(FINANCE_ENTRIES_KEY, rows);
      return { rows, hasMore: all.length > limit, offline: false };
    } catch {
      // fall through to cache
    }
  }
  const rows = (await idbGet<FinanceEntryRow[]>(FINANCE_ENTRIES_KEY)) || [];
  return { rows, hasMore: false, offline: true };
}

async function patchCachedEntries(
  mutate: (rows: FinanceEntryRow[]) => FinanceEntryRow[],
): Promise<void> {
  const rows = (await idbGet<FinanceEntryRow[]>(FINANCE_ENTRIES_KEY)) || [];
  await idbSet(FINANCE_ENTRIES_KEY, mutate(rows));
}

export async function createFinanceEntry(
  row: FinanceEntryRow,
): Promise<{ queued: boolean }> {
  await patchCachedEntries((rows) => [row, ...rows]);

  if (isOnline()) {
    const { error } = await supabase.from("finance_entries").insert(row);
    if (!error) return { queued: false };
    if (!isNetworkError(error)) {
      await patchCachedEntries((rows) => rows.filter((r) => r.id !== row.id));
      throw error;
    }
  }
  await enqueue({ kind: "finance.entry.create", row });
  return { queued: true };
}

export async function updateFinanceEntry(
  id: string,
  row: Partial<FinanceEntryRow>,
): Promise<{ queued: boolean }> {
  await patchCachedEntries((rows) =>
    rows.map((r) => (r.id === id ? { ...r, ...row } : r)),
  );

  if (isOnline()) {
    const { error } = await supabase
      .from("finance_entries")
      .update(row)
      .eq("id", id);
    if (!error) return { queued: false };
    if (!isNetworkError(error)) throw error;
  }
  await enqueue({ kind: "finance.entry.update", id, row });
  return { queued: true };
}

export async function deleteFinanceEntry(
  id: string,
): Promise<{ queued: boolean }> {
  await patchCachedEntries((rows) => rows.filter((r) => r.id !== id));

  if (isOnline()) {
    const { error } = await supabase.from("finance_entries").delete().eq("id", id);
    if (!error) return { queued: false };
    if (!isNetworkError(error)) throw error;
  }
  await enqueue({ kind: "finance.entry.delete", id });
  return { queued: true };
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

export async function postPurchase(
  purchase: PurchasePayload,
  lines: PurchaseLinePayload[],
): Promise<{ queued: boolean }> {
  if (isOnline()) {
    const { error } = await supabase.rpc("post_purchase", {
      p_purchase: purchase,
      p_lines: lines,
    });
    if (!error) return { queued: false };
    if (!isNetworkError(error)) throw error;
  }
  // Echo the stock arrival locally so the catalogue reads correctly offline.
  // The authoritative move happens when the queued RPC replays.
  await patchCachedItems((rows) =>
    rows.map((r) => {
      const line = lines.find((l) => l.item_id === r.id);
      return line ? { ...r, quantity: r.quantity + line.quantity } : r;
    }),
  );
  await enqueue({ kind: "purchase.post", purchase, lines });
  return { queued: true };
}

export async function postPurchaseReturn(
  payload: PurchaseReturnPayload,
  lines: PurchaseReturnLinePayload[],
): Promise<{ queued: boolean }> {
  if (isOnline()) {
    const { error } = await supabase.rpc("post_purchase_return", {
      p_return: payload,
      p_lines: lines,
    });
    if (!error) return { queued: false };
    if (!isNetworkError(error)) throw error;
  }
  await enqueue({ kind: "purchase.return", payload, lines });
  return { queued: true };
}

/** Purchases with their lines, newest first. Online only: this is an admin
 *  screen, and the lines are needed to render anything useful. */
export async function fetchPurchases(limit: number): Promise<{
  purchases: PurchaseRow[];
  lines: PurchaseLineRow[];
  returns: PurchaseReturnRow[];
}> {
  const { data: purchases, error } = await supabase
    .from("purchases")
    .select("*")
    .order("occurred_on", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const ids = (purchases || []).map((p) => p.id);
  if (ids.length === 0) return { purchases: [], lines: [], returns: [] };

  const [lines, returns] = await Promise.all([
    supabase.from("purchase_lines").select("*").in("purchase_id", ids),
    supabase.from("purchase_returns").select("*").in("purchase_id", ids),
  ]);
  if (lines.error) throw lines.error;
  if (returns.error) throw returns.error;

  return {
    purchases: purchases || [],
    lines: lines.data || [],
    returns: returns.data || [],
  };
}

export async function fetchItemSuppliers(): Promise<ItemSupplierRow[]> {
  const { data, error } = await supabase.from("item_suppliers").select("*");
  if (error) throw error;
  return data || [];
}

// Replays queued ops in order against Supabase. Stops at the first network
// error (so it can be retried later); drops ops the server actively rejects.
export async function flushOutbox(): Promise<void> {
  if (!isOnline() || flushing) return;
  flushing = true;
  try {
    await drainOutbox();
  } finally {
    flushing = false;
  }
}

async function drainOutbox(): Promise<void> {
  let ops = await getOutbox();

  while (ops.length > 0) {
    const op = ops[0];
    let error: unknown = null;

    try {
      switch (op.kind) {
        case "item.create": {
          const res = await supabase.from("items").insert(op.row);
          error = res.error;
          if (!error) await supabase.from("item_history").insert(op.historyRow);
          break;
        }
        case "item.update": {
          const res = await supabase.from("items").update(op.row).eq("id", op.id);
          error = res.error;
          if (!error && op.historyRow) await supabase.from("item_history").insert(op.historyRow);
          break;
        }
        case "item.delete": {
          const res = await supabase.from("items").delete().eq("id", op.id);
          error = res.error;
          break;
        }
        case "item.bulkDelete": {
          const res = await supabase.from("items").delete().in("id", op.ids);
          error = res.error;
          if (!error && op.historyRows.length)
            await supabase.from("item_history").insert(op.historyRows);
          break;
        }
        case "rates.update": {
          const res = await supabase
            .from("settings")
            .upsert({ key: "rates", value: op.value });
          error = res.error;
          break;
        }
        case "stock.delta": {
          const res = await callStockRpc(op.itemId, op.delta);
          error = res.error;
          if (!error && op.historyRow)
            await supabase.from("item_history").insert(op.historyRow);
          break;
        }
        case "txi.return": {
          const res = await supabase.rpc("return_transaction_item", {
            p_transaction_id: op.transactionId,
            p_item_id: op.itemId,
            p_qty: op.qty,
          });
          error = res.error;
          break;
        }
        case "finance.entry.create": {
          const res = await supabase.from("finance_entries").insert(op.row);
          error = res.error;
          break;
        }
        case "finance.entry.update": {
          const res = await supabase
            .from("finance_entries")
            .update(op.row)
            .eq("id", op.id);
          error = res.error;
          break;
        }
        case "finance.entry.delete": {
          const res = await supabase
            .from("finance_entries")
            .delete()
            .eq("id", op.id);
          error = res.error;
          break;
        }
        case "purchase.post": {
          const res = await supabase.rpc("post_purchase", {
            p_purchase: op.purchase,
            p_lines: op.lines,
          });
          error = res.error;
          break;
        }
        case "purchase.return": {
          const res = await supabase.rpc("post_purchase_return", {
            p_return: op.payload,
            p_lines: op.lines,
          });
          error = res.error;
          break;
        }
      }
    } catch (e) {
      error = e;
    }

    if (error && isNetworkError(error)) break; // retry later
    // success, or a real rejection we just drop
    ops = ops.slice(1);
    await setOutbox(ops);
  }
}
