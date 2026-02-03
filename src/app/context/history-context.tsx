import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { CartItem, PaymentRecord } from "./app-context";
import { toast } from "sonner";
import { dbService } from "../services/db";

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
  userId: string; // User who performed the transaction
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
  ) => void;
  returnItem: (transactionId: string, itemId: string, quantity: number) => void;
  addImageToTransaction: (transactionId: string, imageBase64: string) => void;
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const refreshTransactions = () => {
    try {
      const txRows = dbService.exec(
        "SELECT * FROM transactions ORDER BY date DESC",
      );
      const itemRows = dbService.exec("SELECT * FROM transaction_items");

      const mappedTransactions = txRows.map((tx: any) => {
        const items = itemRows
          .filter((i: any) => i.transactionId === tx.id)
          .map((i: any) => ({
            id: i.itemId,
            name: i.name,
            sellingPrice: i.price,
            cartQuantity: i.quantity,
            quantityReturned: i.quantityReturned || 0,
            applyDiscount: i.discountApplied === 1,
            discount: i.discountValue || 0,
            // Minimal fields to satisfy types
            barcode: "",
            buyingPrice: 0,
            quantity: 0,
            unit: "units",
            includesTaxes: false,
            currency: "BS",
            history: [],
          }));

        return {
          ...tx,
          payments: JSON.parse(tx.payments || "[]"),
          images: JSON.parse(tx.images || "[]"),
          items,
        };
      });
      setTransactions(mappedTransactions);
    } catch (e) {
      console.error("Failed to load history from DB", e);
    }
  };

  useEffect(() => {
    const init = async () => {
      await dbService.waitForInit();
      refreshTransactions();
    };
    init();
  }, []);

  const addTransaction = (
    items: CartItem[],
    subtotal: number,
    tax: number,
    total: number,
    payments: PaymentRecord[],
    userId: string,
    notes?: string,
  ) => {
    const id = Date.now().toString();
    const date = new Date().toISOString();

    try {
      dbService.exec(
        `
            INSERT INTO transactions (id, date, subtotal, tax, total, payments, notes, userId, images)
            VALUES ($id, $date, $subtotal, $tax, $total, $payments, $notes, $userId, $images)
        `,
        {
          $id: id,
          $date: date,
          $subtotal: subtotal,
          $tax: tax,
          $total: total,
          $payments: JSON.stringify(payments),
          $notes: notes || "",
          $userId: userId,
          $images: JSON.stringify([]),
        },
      );

      items.forEach((item, idx) => {
        dbService.exec(
          `
                INSERT INTO transaction_items (id, transactionId, itemId, name, price, quantity, quantityReturned, discountApplied, discountValue)
                VALUES ($id, $transactionId, $itemId, $name, $price, $quantity, 0, $discountApplied, $discountValue)
            `,
          {
            $id: id + "-" + idx,
            $transactionId: id,
            $itemId: item.id,
            $name: item.name,
            $price: item.sellingPrice,
            $quantity: item.cartQuantity,
            $discountApplied: item.applyDiscount ? 1 : 0,
            $discountValue: item.discount || 0,
          },
        );
      });

      refreshTransactions();
    } catch (e) {
      console.error("Error saving transaction", e);
      toast.error("Error al guardar venta");
    }
  };

  const returnItem = (
    transactionId: string,
    itemId: string,
    quantity: number,
  ) => {
    try {
      // Find the specific transaction item row.
      // itemId in table is the product id.
      const row = dbService.exec(
        `
            SELECT quantityReturned FROM transaction_items 
            WHERE transactionId = $tid AND itemId = $iid
        `,
        { $tid: transactionId, $iid: itemId },
      );

      if (row.length > 0) {
        const currentReturned = row[0].quantityReturned || 0;
        dbService.exec(
          `
                UPDATE transaction_items 
                SET quantityReturned = $qty 
                WHERE transactionId = $tid AND itemId = $iid
            `,
          {
            $qty: currentReturned + quantity,
            $tid: transactionId,
            $iid: itemId,
          },
        );

        refreshTransactions();
        toast.success("Devolución registrada");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error al procesar devolución");
    }
  };

  const addImageToTransaction = (
    transactionId: string,
    imageBase64: string,
  ) => {
    try {
      const row = dbService.exec(
        "SELECT images FROM transactions WHERE id = $id",
        { $id: transactionId },
      );
      if (row.length > 0) {
        const images = JSON.parse(row[0].images || "[]");
        images.push(imageBase64);
        dbService.exec(
          "UPDATE transactions SET images = $images WHERE id = $id",
          {
            $images: JSON.stringify(images),
            $id: transactionId,
          },
        );
        refreshTransactions();
        toast.success("Imagen adjuntada a la transacción");
      }
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
