import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { CartItem, PaymentRecord } from "./app-context";
import { toast } from "sonner";
import { supabase } from "../services/supabase";

export interface TransactionItem extends CartItem {
  quantityReturned: number;
}

export interface Transaction {
  id: string;
  date: string;
  items: TransactionItem[];
  subtotal: number;
  tax: number;
  total: number;
  images: string[];
  payments: PaymentRecord[];
  notes?: string;
  userId: string;
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
  addImageToTransaction: (transactionId: string, imageUrl: string) => void;
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const refreshTransactions = async () => {
    try {
      const [{ data: txRows, error: txErr }, { data: itemRows, error: itemErr }] =
        await Promise.all([
          supabase.from("transactions").select("*").order("date", { ascending: false }),
          supabase.from("transaction_items").select("*"),
        ]);
      if (txErr) throw txErr;
      if (itemErr) throw itemErr;

      const mapped: Transaction[] = (txRows || []).map((tx: any) => {
        const items: TransactionItem[] = (itemRows || [])
          .filter((i: any) => i.transaction_id === tx.id)
          .map((i: any) => ({
            id: i.item_id,
            name: i.name,
            sellingPrice: Number(i.price_usd) || 0,
            cartQuantity: i.quantity,
            quantityReturned: i.quantity_returned || 0,
            applyDiscount: i.discount_applied,
            discount: Number(i.discount_value) || 0,
            barcode: "",
            buyingPrice: 0,
            quantity: 0,
            unit: "units",
            includesTaxes: false,
            currency: "USD",
            images: [],
            type: "UNASSIGNED",
            brand: "GENERIC",
            notes: "",
            history: [],
          }));

        return {
          id: tx.id,
          date: tx.date,
          subtotal: Number(tx.subtotal_usd) || 0,
          tax: Number(tx.tax_usd) || 0,
          total: Number(tx.total_usd) || 0,
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

    // Re-fetch when the user signs in — the initial fetch runs before
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
        })
        .select("id")
        .single();
      if (error) throw error;

      const rows = items.map((item) => ({
        transaction_id: tx.id,
        item_id: item.id,
        name: item.name,
        price_usd: item.sellingPrice,
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

  const returnItem = async (
    transactionId: string,
    itemId: string,
    quantity: number,
  ) => {
    try {
      const { data: row, error: selErr } = await supabase
        .from("transaction_items")
        .select("quantity_returned")
        .eq("transaction_id", transactionId)
        .eq("item_id", itemId)
        .maybeSingle();
      if (selErr) throw selErr;
      if (!row) return;

      const { error } = await supabase
        .from("transaction_items")
        .update({ quantity_returned: (row.quantity_returned || 0) + quantity })
        .eq("transaction_id", transactionId)
        .eq("item_id", itemId);
      if (error) throw error;

      await refreshTransactions();
      toast.success("Devolución registrada");
    } catch (e) {
      console.error(e);
      toast.error("Error al procesar devolución");
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
        addImageToTransaction,
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
