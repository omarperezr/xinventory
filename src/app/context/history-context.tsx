import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { CartItem, PaymentRecord, useApp } from "./app-context";
import { toast } from "sonner";
import { supabase } from "../services/supabase";
import * as offlineStore from "../utils/offlineStore";

export interface TransactionItem extends CartItem {
  quantityReturned: number;
}

export interface Transaction {
  id: string;
  date: string;
  items: TransactionItem[];
  // subtotal/tax/total are the EFFECTIVE values: net of returns and reflecting
  // any admin price edits. originalTotal is the amount charged at sale time,
  // kept so the UI can show what changed after returns/edits.
  subtotal: number;
  tax: number;
  total: number;
  originalTotal: number;
  images: string[];
  payments: PaymentRecord[];
  notes?: string;
  userId: string;
}

// Per-line price after its own discount (the unit price actually charged).
function effectiveUnitPrice(item: TransactionItem): number {
  if (item.applyDiscount && item.discount > 0) {
    return item.sellingPrice * (1 - item.discount / 100);
  }
  return item.sellingPrice;
}

interface HistoryContextType {
  transactions: Transaction[];
  addTransaction: (
    items: CartItem[],
    subtotal: number,
    tax: number,
    total: number,
    payments: PaymentRecord[],
    userId: string,
    notes?: string,
  ) => Promise<void>;
  returnItem: (transactionId: string, itemId: string, quantity: number) => Promise<void>;
  updateTransactionItemPrice: (
    transactionId: string,
    itemId: string,
    sellingPriceUsd: number,
  ) => Promise<void>;
  addImageToTransaction: (transactionId: string, imageUrl: string) => void;
  // True when older sales exist beyond the currently loaded window.
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

// How many recent sales to load at once. Reports and the history screen work
// from this window; "Cargar mas" extends it.
const PAGE_SIZE = 200;

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // HistoryProvider is nested inside AppProvider (see App.tsx), so the app
  // context is available here for rate provenance and stock refreshes.
  const { honestRate, honestRateKey, refreshData } = useApp();

  const refreshTransactions = async (limit: number = pageSize) => {
    try {
      // Load a bounded window of the most recent sales instead of the whole
      // table, then fetch only the line items belonging to that window. The
      // previous version pulled every transaction_items row in the database.
      const { data: txRows, error: txErr } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false })
        .limit(limit + 1);
      if (txErr) throw txErr;

      const page = (txRows || []).slice(0, limit);
      setHasMore((txRows || []).length > limit);

      const txIds = page.map((t: any) => t.id);
      let itemRows: any[] = [];
      if (txIds.length > 0) {
        const { data, error: itemErr } = await supabase
          .from("transaction_items")
          .select("*")
          .in("transaction_id", txIds);
        if (itemErr) throw itemErr;
        itemRows = data || [];
      }

      // Group line items by transaction once (O(n+m)) instead of re-scanning
      // the full item list for every transaction (O(n*m)), which would not
      // scale as the history grows.
      const itemsByTx = new Map<string, any[]>();
      for (const i of itemRows || []) {
        const bucket = itemsByTx.get(i.transaction_id);
        if (bucket) bucket.push(i);
        else itemsByTx.set(i.transaction_id, [i]);
      }

      const mapped: Transaction[] = page.map((tx: any) => {
        const items: TransactionItem[] = (itemsByTx.get(tx.id) || []).map(
          (i: any) => ({
            id: i.item_id,
            name: i.name,
            sellingPrice: Number(i.price_usd) || 0,
            cartQuantity: i.quantity,
            quantityReturned: i.quantity_returned || 0,
            applyDiscount: i.discount_applied,
            discount: Number(i.discount_value) || 0,
            barcode: "",
            // Snapshot taken at sale time. Rows predating the snapshot column
            // carry 0; reports fall back to the live inventory cost for those.
            buyingPrice: Number(i.buying_price_usd) || 0,
            quantity: 0,
            unit: "units",
            includesTaxes: false,
            currency: "USD",
            images: [],
            type: "UNASSIGNED",
            brand: "GENERIC",
            notes: "",
            history: [],
          }),
        );

        // Derive effective totals from the line items so returns and admin
        // price edits flow through automatically. The blended tax rate is taken
        // from the sale-time snapshot (we don't store a per-line tax flag) and
        // applied to the net subtotal.
        const netSubtotal = items.reduce(
          (s, it) =>
            s + effectiveUnitPrice(it) * (it.cartQuantity - it.quantityReturned),
          0,
        );
        const creationSubtotal = Number(tx.subtotal_usd) || 0;
        const creationTax = Number(tx.tax_usd) || 0;
        const taxRate = creationSubtotal > 0 ? creationTax / creationSubtotal : 0;
        const netTax = netSubtotal * taxRate;

        return {
          id: tx.id,
          date: tx.date,
          subtotal: netSubtotal,
          tax: netTax,
          total: netSubtotal + netTax,
          originalTotal: Number(tx.total_usd) || 0,
          payments: tx.payments || [],
          images: tx.images || [],
          notes: tx.notes,
          userId: tx.user_id,
          items,
        };
      });
      setTransactions(mapped);
    } catch (e) {
      console.error("Failed to load history from Supabase", e);
    }
  };

  useEffect(() => {
    refreshTransactions();

    // Re-fetch when the user signs in - the initial fetch runs before
    // authentication, so it returns nothing until a session exists.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") refreshTransactions();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const addTransaction = async (
    items: CartItem[],
    subtotal: number,
    tax: number,
    total: number,
    payments: PaymentRecord[],
    userId: string,
    notes?: string,
  ) => {
    try {
      const { data: tx, error } = await supabase
        .from("transactions")
        .insert({
          subtotal_usd: subtotal,
          tax_usd: tax,
          total_usd: total,
          payments,
          notes: notes || "",
          user_id: userId,
          images: [],
          // Provenance: which bolivar rate the books used for this sale, so a
          // later change to the honest rate cannot restate history.
          honest_rate: honestRate,
          honest_rate_key: honestRateKey,
        })
        .select("id")
        .single();
      if (error) throw error;

      const rows = items.map((item) => ({
        transaction_id: tx.id,
        item_id: item.id,
        name: item.name,
        price_usd: item.sellingPrice,
        // Cost snapshotted at sale time. Reading the live buying price later
        // reports 0 for deleted products (a false 100% margin) and silently
        // restates past margins whenever a cost is edited.
        buying_price_usd: item.buyingPrice || 0,
        quantity: item.cartQuantity,
        quantity_returned: 0,
        discount_applied: item.applyDiscount,
        discount_value: item.discount || 0,
      }));
      const { error: itemsErr } = await supabase
        .from("transaction_items")
        .insert(rows);
      if (itemsErr) throw itemsErr;

      await refreshTransactions();
    } catch (e) {
      console.error("Error saving transaction", e);
      toast.error("Error al guardar venta");
    }
  };

  // Extends the loaded window by another page of older sales.
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = pageSize + PAGE_SIZE;
    setPageSize(next);
    try {
      await refreshTransactions(next);
    } finally {
      setLoadingMore(false);
    }
  };

  // One server-side transaction bumps quantity_returned, bounds-checks it
  // against the sold quantity, and restocks the item. The previous
  // select-then-update lost concurrent returns and could return more units
  // than were ever sold.
  const returnItem = async (
    transactionId: string,
    itemId: string,
    quantity: number,
  ) => {
    try {
      const { queued, restored } = await offlineStore.returnTransactionItem(
        transactionId,
        itemId,
        quantity,
      );
      await refreshTransactions();
      await refreshData();
      if (queued) {
        toast.success("Devolución guardada localmente (sin conexión)");
      } else if (restored) {
        // The product had been deleted. It is back in the catalogue but with
        // placeholder barcode, unit, brand and type, so say so rather than
        // letting an incomplete product appear silently.
        toast.success("Devolución registrada. El producto fue recreado.", {
          description: "Revisa sus datos en Administración (tipo RECUPERADO).",
          duration: 6000,
        });
      } else {
        toast.success("Devolución registrada");
      }
    } catch (e) {
      console.error(e);
      const message = (e as { message?: string })?.message ?? "";
      toast.error(
        message.includes("RETURN_EXCEEDS_SOLD")
          ? "La devolución supera la cantidad vendida"
          : "Error al procesar devolución",
      );
    }
  };

  // Admin-only: override the unit selling price of a line in a past sale.
  // Effective totals (and all reports/metrics) recompute on refresh.
  const updateTransactionItemPrice = async (
    transactionId: string,
    itemId: string,
    sellingPriceUsd: number,
  ) => {
    if (isNaN(sellingPriceUsd) || sellingPriceUsd < 0) return;
    try {
      const { error } = await supabase
        .from("transaction_items")
        .update({ price_usd: sellingPriceUsd })
        .eq("transaction_id", transactionId)
        .eq("item_id", itemId);
      if (error) throw error;

      await refreshTransactions();
      toast.success("Precio de venta actualizado");
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar precio");
    }
  };

  const addImageToTransaction = async (
    transactionId: string,
    imageUrl: string,
  ) => {
    try {
      const { data: row, error: selErr } = await supabase
        .from("transactions")
        .select("images")
        .eq("id", transactionId)
        .single();
      if (selErr) throw selErr;

      const images = [...(row.images || []), imageUrl];
      const { error } = await supabase
        .from("transactions")
        .update({ images })
        .eq("id", transactionId);
      if (error) throw error;

      await refreshTransactions();
      toast.success("Imagen adjuntada a la transacción");
    } catch (e) {
      console.error(e);
      toast.error("Error al guardar imagen");
    }
  };

  return (
    <HistoryContext.Provider
      value={{
        transactions,
        addTransaction,
        returnItem,
        updateTransactionItemPrice,
        addImageToTransaction,
        hasMore,
        loadingMore,
        loadMore,
      }}
    >
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (context === undefined) {
    throw new Error("useHistory must be used within a HistoryProvider");
  }
  return context;
}
