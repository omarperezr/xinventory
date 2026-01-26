import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CartItem, PaymentRecord } from './cart-context';
import { toast } from 'sonner';

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
  images: string[]; // Base64 strings
  payments: PaymentRecord[];
  notes?: string;
}

interface HistoryContextType {
  transactions: Transaction[];
  addTransaction: (
      items: CartItem[], 
      subtotal: number, 
      tax: number, 
      total: number, 
      payments: PaymentRecord[],
      notes?: string
  ) => void;
  returnItem: (transactionId: string, itemId: string, quantity: number) => void;
  addImageToTransaction: (transactionId: string, imageBase64: string) => void;
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('transactionHistory');
    if (saved) {
      try {
        setTransactions(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('transactionHistory', JSON.stringify(transactions));
  }, [transactions]);

  const addTransaction = (
      items: CartItem[], 
      subtotal: number, 
      tax: number, 
      total: number,
      payments: PaymentRecord[],
      notes?: string
  ) => {
    const newTransaction: Transaction = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      items: items.map(item => ({ ...item, quantityReturned: 0 })),
      subtotal,
      tax,
      total,
      images: [],
      payments,
      notes
    };
    setTransactions(prev => [newTransaction, ...prev]);
  };

  const returnItem = (transactionId: string, itemId: string, quantity: number) => {
    setTransactions(prev => prev.map(t => {
      if (t.id !== transactionId) return t;

      const updatedItems = t.items.map(item => {
        if (item.id !== itemId) return item;
        return { ...item, quantityReturned: item.quantityReturned + quantity };
      });
      
      return { ...t, items: updatedItems };
    }));
  };

  const addImageToTransaction = (transactionId: string, imageBase64: string) => {
    setTransactions(prev => prev.map(t => {
      if (t.id !== transactionId) return t;
      return { ...t, images: [...t.images, imageBase64] };
    }));
    toast.success("Image attached to transaction");
  };

  return (
    <HistoryContext.Provider value={{
      transactions,
      addTransaction,
      returnItem,
      addImageToTransaction
    }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (context === undefined) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return context;
}
