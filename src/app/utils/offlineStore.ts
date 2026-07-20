// Offline-aware cache + outbox for the `items`/`item_history`/`settings`
// tables. Unlike a REST backend, there is no server to proxy through here —
// queued operations are replayed by calling the Supabase SDK directly.
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
  | { kind: "rates.update"; value: RatesValue };

// `honest` records which rate the business treats as the real bolívar worth.
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
// returned (a real rejection — e.g. constraint violation — which should be
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

// Network-first fetch of items + history, falling back to the IndexedDB
// cache when offline or the request fails. Successful fetches refresh the
// cache so the next offline session has up-to-date data.
export async function fetchInventory(): Promise<{
  itemRows: ItemRow[];
  historyRows: HistoryRow[];
  offline: boolean;
}> {
  if (isOnline()) {
    try {
      const [{ data: itemRows, error: itemsErr }, { data: historyRows, error: histErr }] =
        await Promise.all([
          supabase.from("items").select("*").order("created_at", { ascending: false }),
          supabase.from("item_history").select("*").order("date", { ascending: false }),
        ]);
      if (itemsErr) throw itemsErr;
      if (histErr) throw histErr;
      await idbSet(ITEMS_KEY, itemRows || []);
      await idbSet(HISTORY_KEY, historyRows || []);
      return { itemRows: itemRows || [], historyRows: historyRows || [], offline: false };
    } catch {
      // fall through to cache
    }
  }
  const itemRows = (await idbGet<ItemRow[]>(ITEMS_KEY)) || [];
  const historyRows = (await idbGet<HistoryRow[]>(HISTORY_KEY)) || [];
  return { itemRows, historyRows, offline: true };
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
