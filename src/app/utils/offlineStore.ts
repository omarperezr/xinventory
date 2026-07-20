// Offline-aware cache and outbox for the `items`/`item_history`/`settings`
// tables. Unlike a REST backend, there is no server to proxy requests
// through here - queued operations are replayed by calling the Supabase
// SDK directly once connectivity returns.
import { supabase } from "../services/supabase";
import { idbGet, idbSet } from "./localdb";

const ITEMS_KEY = "items";
const HISTORY_KEY = "item_history";
const OUTBOX_KEY = "outbox";

export interface ItemRow {
  id: string;
  name: string;
  barcode: string;
  buying_price_usd: number;
  selling_price_usd: number;
  quantity: number;
  unit: string;
  includes_taxes: boolean;
  discount: number;
  images: string[];
  type: string;
  brand: string;
  notes: string;
  updated_at?: string;
}

export interface HistoryRow {
  id?: string;
  item_id: string;
  action: "create" | "update" | "delete" | "sale" | "return";
  details: string;
  user_name: string;
  previous_stock?: number;
  new_stock?: number;
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
function isNetworkError(error: any): boolean {
  return !!error && !error.code;
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
// server-side transaction, bounded by the sold quantity.
export async function returnTransactionItem(
  transactionId: string,
  itemId: string,
  qty: number,
): Promise<{ queued: boolean }> {
  if (isOnline()) {
    const { error } = await supabase.rpc("return_transaction_item", {
      p_transaction_id: transactionId,
      p_item_id: itemId,
      p_qty: qty,
    });
    if (!error) return { queued: false };
    if (!isNetworkError(error)) throw error;
  }
  // Echo the restock locally; the return itself lands on the next sync.
  await patchCachedItems((rows) =>
    rows.map((r) => (r.id === itemId ? { ...r, quantity: r.quantity + qty } : r)),
  );
  await enqueue({ kind: "txi.return", transactionId, itemId, qty });
  return { queued: true };
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
    let error: any = null;

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
