// Offline-aware cache and outbox for the `items`/`item_history`/`settings`
// tables. Unlike a REST backend, there is no server to proxy requests
// through here - queued operations are replayed by calling the Supabase
// SDK directly once connectivity returns.
import { toast } from "sonner";
import { supabase } from "../services/supabase";
import type { ItemHistoryRecord, UnitType } from "../context/app-context";
import { idbGet, idbSet } from "./localdb";

const ITEMS_KEY = "items";
const HISTORY_KEY = "item_history";
const OUTBOX_KEY = "outbox";
// Ops that can never be replayed are moved here instead of being deleted.
const OUTBOX_FAILED_KEY = "outbox_failed";
// The op currently being replayed, written before the call goes out.
const INFLIGHT_KEY = "outbox_inflight";
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

/** A product that does not exist yet, created by the same call that posts the
 *  purchase. Abandoning the basket therefore leaves no phantom product behind. */
export interface NewItemPayload {
  id: string;
  name: string;
  barcode: string;
  selling_price_usd: number;
  unit: string;
  type: string;
  brand: string;
  includes_taxes: boolean;
  discount: number;
}

export interface PurchaseLinePayload {
  item_id: string | null;
  name: string;
  quantity: number;
  unit_cost_usd: number;
  new_item?: NewItemPayload;
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

/** The `transactions` row as written at sale time. */
export interface TransactionInsertRow {
  id: string;
  date: string;
  subtotal_usd: number;
  tax_usd: number;
  total_usd: number;
  payments: unknown[];
  notes: string;
  user_id: string;
  images: string[];
  honest_rate: number;
  honest_rate_key: string;
}

/** A `transaction_items` row as written at sale time. */
export interface TransactionItemInsertRow {
  // Minted on the device so both writes are upserts: a replay that resumes
  // after the header landed cannot duplicate the lines.
  id: string;
  transaction_id: string;
  item_id: string;
  name: string;
  price_usd: number;
  quantity: number;
  quantity_returned: number;
  discount_applied: boolean;
  discount_value: number;
  buying_price_usd: number;
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
  // A sale is the one write that must never be lost: the stock deltas above
  // queue happily, so an unqueued sale row means stock left the shelf with no
  // record of the money. The id and date are minted on the device, so a replay
  // cannot duplicate the row and a Saturday sale keeps its Saturday timestamp.
  | {
      kind: "transaction.create";
      row: TransactionInsertRow;
      itemRows: TransactionItemInsertRow[];
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

// Server-reported conditions that say "not now" rather than "no": retrying
// the same payload later is the right answer. The presence of a `code` alone
// cannot decide this - PostgREST reports an unreachable database and an
// expired JWT with codes too, and dropping those loses every queued write.
const RETRY_CODES = new Set([
  "PGRST001", // could not connect to the database
  "PGRST002", // schema cache not loaded (server still coming up)
  "PGRST301", // JWT expired - the SDK refreshes it and the next pass works
  "08000",
  "08003",
  "08006", // connection exception / failure
  "40001",
  "40P01", // serialization failure, deadlock
  "53300", // too many connections
  "57014", // statement timeout
  "57P03", // cannot connect now, server starting up
]);

// What a failed fetch reads like across browsers (and the SDK's own aborts),
// which is all supabase-js gives us: it reports those with an empty code.
const NETWORK_MESSAGE =
  /failed to fetch|networkerror|network request failed|load failed|abort|timeout/i;

type Verdict =
  | "unreachable" // the request never left the device - retry forever
  | "transient" // the server answered "not now", or we could not tell - retry, bounded
  | "rejected"; // the server understood and refused - retrying changes nothing

function classify(error: unknown): Verdict {
  if (!isOnline()) return "unreachable";
  if (!error || typeof error !== "object") return "rejected";
  const code = String((error as { code?: unknown }).code ?? "");
  if (code) return RETRY_CODES.has(code) ? "transient" : "rejected";
  // Codeless: a failed fetch, or something the SDK threw before sending. Only
  // the message separates them, and an unrecognised one is retried under the
  // attempt budget rather than assumed to be either.
  const message = String((error as { message?: unknown }).message ?? "");
  return NETWORK_MESSAGE.test(message) ? "unreachable" : "transient";
}

// True when the op should stay queued rather than be surfaced to the caller.
function isNetworkError(error: unknown): boolean {
  return classify(error) !== "rejected";
}

/** The queue envelope. `userId` scopes replay to the session that created the
 *  op; `opId` is what the in-flight marker points at. Both are optional so
 *  ops queued by an older build still drain. */
type QueuedOp = OutboxOp & { userId?: string; opId?: string };

async function sessionUserId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id;
}

// The caches are best-effort: losing one costs a refetch. Only the outbox
// writes below propagate a storage failure to the caller.
async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    await idbSet(key, value);
  } catch (e) {
    console.warn("No se pudo escribir el caché local", key, e);
  }
}

async function getOutbox(): Promise<QueuedOp[]> {
  return (await idbGet<QueuedOp[]>(OUTBOX_KEY)) || [];
}

async function setOutbox(ops: QueuedOp[]): Promise<void> {
  await idbSet(OUTBOX_KEY, ops);
}

// Callers build item_history rows without a `date`, which online is right: the
// column takes the database's now(), and now() is when the movement happened.
// Queued, that default fires at FLUSH time, so a sale or adjustment made on
// Saturday and synced on Monday reads Monday in the product's history. The
// queue is where the two diverge, so this is where the row is stamped.
function stampHistoryDate(op: OutboxOp): OutboxOp {
  const date = new Date().toISOString();
  const stamp = (h: HistoryRow): HistoryRow => (h.date ? h : { ...h, date });
  if ("historyRow" in op && op.historyRow) return { ...op, historyRow: stamp(op.historyRow) };
  if ("historyRows" in op) return { ...op, historyRows: op.historyRows.map(stamp) };
  return op;
}

// Throws when the queue could not be persisted: the write is lost, and the
// caller must say so instead of reporting "guardado localmente".
async function enqueue(op: OutboxOp): Promise<void> {
  const ops = await getOutbox();
  ops.push({
    ...stampHistoryDate(op),
    userId: await sessionUserId(),
    opId: crypto.randomUUID(),
  });
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
// Server rows do not know about the moves that are still queued. A refetch
// that lands while one is waiting - the flush stopped on a transient error, or
// the op belongs to another session - would otherwise restore the pre-sale
// quantity: the seller sees the stock back on the shelf, rings the sale again,
// and both deltas replay. Every refetch goes through here, so every caller
// (the sync widget, the `online` handler, refreshData) is covered at once.
//
// ponytail: only the quantity-moving ops, which is where the double-sale bug
// lives. A queued item.create still vanishes from a refetch until it replays.
function withPendingDeltas(rows: ItemRow[], ops: QueuedOp[]): ItemRow[] {
  const deltas = new Map<string, number>();
  const add = (id: string, d: number) => deltas.set(id, (deltas.get(id) ?? 0) + d);
  for (const op of ops) {
    if (op.kind === "stock.delta") add(op.itemId, op.delta);
    else if (op.kind === "txi.return") add(op.itemId, op.qty);
    else if (op.kind === "purchase.post")
      for (const line of op.lines) if (line.item_id) add(line.item_id, line.quantity);
  }
  if (deltas.size === 0) return rows;
  return rows.map((r) =>
    deltas.has(r.id)
      ? { ...r, quantity: Math.max(0, (r.quantity ?? 0) + deltas.get(r.id)!) }
      : r,
  );
}

export async function fetchInventory(): Promise<{
  itemRows: ItemRow[];
  offline: boolean;
}> {
  if (isOnline()) {
    try {
      // Read before the query, so it describes the request we are about to
      // make: an empty result from a request that carried no session is RLS,
      // not an empty catalogue (app-context fetches before auth), and it must
      // not replace a populated offline cache.
      const authed = !!(await sessionUserId());
      const { data: itemRows, error } = await supabase
        .from("items")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = withPendingDeltas(itemRows || [], await getOutbox());
      if (rows.length || authed) await cacheSet(ITEMS_KEY, rows);
      return { itemRows: rows, offline: false };
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
  await cacheSet(ITEMS_KEY, mutate(rows));
}

async function patchCachedHistory(mutate: (rows: HistoryRow[]) => HistoryRow[]): Promise<void> {
  const rows = (await idbGet<HistoryRow[]>(HISTORY_KEY)) || [];
  await cacheSet(HISTORY_KEY, mutate(rows));
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
  await enqueue({
    kind: "stock.delta",
    itemId,
    delta,
    // Minted here because the drain writes this row only after the RPC
    // returns: its id is the one thing a crashed replay can ask the server
    // about to find out whether the move already landed.
    historyRow: historyRow && { ...historyRow, id: historyRow.id ?? crypto.randomUUID() },
  });
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
      const authed = !!(await sessionUserId());
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
      // Same pre-auth guard as fetchInventory: an all-empty catalog may just
      // be RLS answering a request that carried no session.
      if (authed || Object.values(catalog).some((rows) => rows.length))
        await cacheSet(FINANCE_CATALOG_KEY, catalog);
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
      const authed = !!(await sessionUserId());
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
      // Same pre-auth guard as fetchInventory.
      if (rows.length || authed) await cacheSet(FINANCE_ENTRIES_KEY, rows);
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
  await cacheSet(FINANCE_ENTRIES_KEY, mutate(rows));
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
// Sales
// ---------------------------------------------------------------------------

/**
 * Writes a sale (header + lines) or queues it. Both writes are upserts keyed
 * on device-minted ids, so a retry after a partial write completes the sale
 * instead of duplicating it.
 */
async function writeTransaction(
  row: TransactionInsertRow,
  itemRows: TransactionItemInsertRow[],
): Promise<{ error: unknown }> {
  const header = await supabase.from("transactions").upsert(row);
  if (header.error) return { error: header.error };
  const lines = await supabase.from("transaction_items").upsert(itemRows);
  return { error: lines.error };
}

export async function saveTransaction(
  row: TransactionInsertRow,
  itemRows: TransactionItemInsertRow[],
): Promise<{ queued: boolean }> {
  if (isOnline()) {
    const { error } = await writeTransaction(row, itemRows);
    if (!error) return { queued: false };
    // A rejection the server actively returned is a bug in the payload, not a
    // connectivity problem: surface it instead of queueing it forever.
    if (!isNetworkError(error)) throw error;
  }
  await enqueue({ kind: "transaction.create", row, itemRows });
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
// error (so it can be retried later); parks ops the server actively rejects.
export async function flushOutbox(): Promise<void> {
  if (!isOnline() || flushing) return;
  flushing = true;
  try {
    await drainOutbox();
  } finally {
    flushing = false;
  }
}

/** What was in flight when the app last stopped. */
type Inflight = { opId?: string; returnedBefore?: number };

// The two replays whose RPCs are not idempotent: sending one twice moves stock
// twice. Everything else is an upsert, a delete or carries a device-minted id.
function isGuarded(op: QueuedOp): boolean {
  return !!op.opId && (op.kind === "stock.delta" || op.kind === "txi.return");
}

// Reads whatever the crash check below will compare against, before the call
// that changes it.
async function inflightMark(op: QueuedOp): Promise<Inflight> {
  if (op.kind !== "txi.return") return { opId: op.opId };
  const { data, error } = await supabase
    .from("transaction_items")
    .select("quantity_returned")
    .eq("transaction_id", op.transactionId)
    .eq("item_id", op.itemId)
    .maybeSingle();
  if (error) throw error;
  return { opId: op.opId, returnedBefore: data?.quantity_returned ?? 0 };
}

// Whether the op that was in flight when the app died actually landed. Only
// the server can say, and these are the witnesses a client can read.
//
// ponytail: a "no" is not proof it did not land - the stock RPC leaves no
// client-visible trace until the history row that follows it, so a crash
// between those two still replays the delta. Airtight needs an idempotency key
// on the RPC itself, which is server side.
async function alreadyApplied(op: QueuedOp, mark: Inflight): Promise<boolean> {
  if (op.kind === "txi.return") {
    const { data, error } = await supabase
      .from("transaction_items")
      .select("quantity_returned")
      .eq("transaction_id", op.transactionId)
      .eq("item_id", op.itemId)
      .maybeSingle();
    if (error) throw error;
    return (data?.quantity_returned ?? 0) >= (mark.returnedBefore ?? 0) + op.qty;
  }
  if (op.kind === "stock.delta" && op.historyRow?.id) {
    const { data, error } = await supabase
      .from("item_history")
      .select("id")
      .eq("id", op.historyRow.id)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }
  return false;
}

// How many passes a head op gets before it is parked. Only failures that are
// not plain connectivity count, so a device with no signal keeps its queue for
// as long as it needs.
// ponytail: in memory, so the budget restarts with the app - enough to unpin a
// live session, not to retire a permanently poisoned op across reloads.
const MAX_TRANSIENT_ATTEMPTS = 25;
let stuckOpKey = "";
let stuckAttempts = 0;

function countAttempt(op: QueuedOp): number {
  const key = op.opId ?? op.kind;
  if (stuckOpKey !== key) {
    stuckOpKey = key;
    stuckAttempts = 0;
  }
  return ++stuckAttempts;
}

// Parked, never deleted: a queued write the server refused still has to be
// recoverable by hand, and this toast is the only sign the user gets that one
// left the queue without landing.
async function parkOp(op: QueuedOp, error: unknown): Promise<void> {
  console.error("Operación offline descartada", op, error);
  try {
    const failed = (await idbGet<unknown[]>(OUTBOX_FAILED_KEY)) || [];
    await idbSet(OUTBOX_FAILED_KEY, [
      ...failed,
      {
        op,
        at: new Date().toISOString(),
        error: (error as { message?: string })?.message ?? String(error),
      },
    ]);
  } catch (e) {
    console.error("No se pudo archivar la operación descartada", e);
  }
  toast.error(`Un cambio pendiente no se pudo sincronizar (${op.kind})`, {
    description: "Quedó archivado en este dispositivo; verifica los datos.",
    duration: 8000,
  });
}

// Returns false when the queue could not be updated: draining must stop then,
// or the op that just succeeded replays on the next pass.
async function removeOp(index: number): Promise<boolean> {
  try {
    // Re-read first: ops enqueued while this one was in flight must survive.
    // Only this function removes, and enqueue only appends, so earlier
    // indexes still point at the same ops.
    const current = await getOutbox();
    current.splice(index, 1);
    await setOutbox(current);
    return true;
  } catch (e) {
    console.error("No se pudo actualizar la cola offline", e);
    toast.error("No se pudo actualizar la cola local de cambios", {
      description: "Cierra y vuelve a abrir la aplicación antes de seguir.",
      duration: 8000,
    });
    return false;
  }
}

// Another user's ops stay queued - only their session can replay them - but
// the pending counter would otherwise sit at a number that never goes down.
let foreignWarnedFor: string | null = null;
function warnForeignOps(count: number, userId: string | undefined): void {
  if (foreignWarnedFor === (userId ?? "")) return;
  foreignWarnedFor = userId ?? "";
  toast.warning(`${count} cambio(s) pendiente(s) de otro usuario`, {
    description: "Se sincronizarán cuando esa persona inicie sesión aquí.",
    duration: 8000,
  });
}

async function drainOutbox(): Promise<void> {
  const userId = await sessionUserId();
  const mark = await idbGet<Inflight>(INFLIGHT_KEY);

  // The queue is re-read every round and re-read again before the op is
  // dropped. Holding one in-memory copy across an await loses every op the
  // user enqueues while a replay is in flight: the write-back would persist a
  // slice taken before those ops existed.
  for (;;) {
    const ops = await getOutbox();
    // Ops replay only under the session that created them. On a shared tablet
    // an admin's edits sent with a seller's JWT are rejected by RLS and lost,
    // and a seller's edits sent with an admin's JWT walk past the guards that
    // exist to stop them.
    const index = ops.findIndex((o) => !o.userId || o.userId === userId);
    if (index === -1) {
      if (ops.length) warnForeignOps(ops.length, userId);
      return;
    }
    const op = ops[index];
    let error: unknown = null;

    if (op.opId && mark?.opId === op.opId) {
      // This op was in flight when the app died. Ask the server whether it
      // landed instead of moving stock a second time.
      let applied: boolean;
      try {
        applied = await alreadyApplied(op, mark);
      } catch {
        return; // could not ask - leave it queued and try again later
      }
      if (applied) {
        if (!(await removeOp(index))) return;
        continue;
      }
    }

    if (isGuarded(op)) {
      // Written before the call goes out, so the window above is detectable.
      try {
        await idbSet(INFLIGHT_KEY, await inflightMark(op));
      } catch (e) {
        console.error("No se pudo registrar la operación en curso", e);
        return;
      }
    }

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
        case "transaction.create": {
          const res = await writeTransaction(op.row, op.itemRows);
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

    if (error) {
      const verdict = classify(error);
      if (verdict === "unreachable") return; // retry later, as often as needed
      if (verdict === "transient" && countAttempt(op) < MAX_TRANSIENT_ATTEMPTS)
        return;
      // A real rejection, or one we retried until the budget ran out.
      await parkOp(op, error);
    }
    if (!(await removeOp(index))) return;
  }
}
