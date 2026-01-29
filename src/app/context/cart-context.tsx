import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { InventoryItem } from "../components/inventory-form";
import { toast } from "sonner";

export interface CartItem extends InventoryItem {
  cartQuantity: number;
}

export interface PaymentRecord {
  method: string;
  amount: number;
  timestamp: string;
}

export interface SavedCart {
  id: string;
  name: string;
  items: CartItem[];
  dateSaved: string;
  payments: PaymentRecord[];
  notes: string;
}

interface CartContextType {
  cartItems: CartItem[];
  savedCarts: SavedCart[];
  addToCart: (item: InventoryItem, quantity: number) => void;
  removeFromCart: (itemId: string) => void;
  updateCartItemQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  saveCart: () => void;
  loadCart: (cart: SavedCart) => void;
  deleteSavedCart: (cartId: string) => void;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  // Payment State
  currentPayments: PaymentRecord[];
  transactionNotes: string;
  addPayment: (method: string, amount: number) => void;
  setTransactionNotes: (notes: string) => void;
  clearPayments: () => void;
  amountPaid: number;
  remainingDue: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({
  defaultCurrency,
  usdValue,
  eurValue,
  children,
}: {
  defaultCurrency: string;
  usdValue: number;
  eurValue: number;
  children: ReactNode;
}) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [savedCarts, setSavedCarts] = useState<SavedCart[]>([]);

  // Payment State
  const [currentPayments, setCurrentPayments] = useState<PaymentRecord[]>([]);
  const [transactionNotes, setTransactionNotes] = useState("");

  // Load saved carts from localStorage on mount
  useEffect(() => {
    const storedCarts = localStorage.getItem("savedCarts");
    if (storedCarts) {
      try {
        setSavedCarts(JSON.parse(storedCarts));
      } catch (e) {
        console.error("Failed to parse saved carts", e);
      }
    }
  }, []);

  // Save savedCarts to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("savedCarts", JSON.stringify(savedCarts));
  }, [savedCarts]);

  const addToCart = (item: InventoryItem, quantity: number) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id
            ? { ...i, cartQuantity: i.cartQuantity + quantity }
            : i,
        );
      }
      return [...prev, { ...item, cartQuantity: quantity }];
    });
    toast.success(`Se agrego ${quantity} ${item.name}(s) al total`);
  };

  const removeFromCart = (itemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const updateCartItemQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCartItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, cartQuantity: quantity } : i)),
    );
  };

  const clearCart = () => {
    setCartItems([]);
    setCurrentPayments([]);
    setTransactionNotes("");
  };

  const saveCart = () => {
    if (cartItems.length === 0) {
      toast.error("Lista Total vacía, no se puede guardar");
      return;
    }
    const newSavedCart: SavedCart = {
      id: Date.now().toString(),
      name: `Carrito - ${savedCarts.length + 1}`,
      items: [...cartItems],
      dateSaved: new Date().toLocaleString(),
      payments: [...currentPayments],
      notes: transactionNotes,
    };

    setSavedCarts((prev) => [newSavedCart, ...prev]);
    clearCart();
    toast.success("Carrito Guardado");
  };

  const loadCart = (cart: SavedCart) => {
    setCartItems(cart.items);
    // Backward compatibility: check if payments/notes exist, otherwise default to empty
    setCurrentPayments(cart.payments || []);
    setTransactionNotes(cart.notes || "");
    toast.success("Carrito Cargado");
  };

  const deleteSavedCart = (cartId: string) => {
    setSavedCarts((prev) => prev.filter((c) => c.id !== cartId));
    toast.success("Carrito eliminado");
  };

  // Payment Actions
  const addPayment = (method: string, amount: number) => {
    setCurrentPayments((prev) => [
      ...prev,
      {
        method,
        amount,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const clearPayments = () => {
    setCurrentPayments([]);
    setTransactionNotes("");
  };

  const getRightPriceBasedOnCurrency = (
    item: InventoryItem,
    price: number,
    defaultCurrency: string,
    usdValue: number,
    eurValue: number,
  ) => {
    if (item.currency === defaultCurrency) {
      return price;
    }

    // Convert to default currency
    switch (defaultCurrency) {
      case "BS":
        if (item.currency === "USD") {
          return price * usdValue;
        } else if (item.currency === "EUR") {
          return price * eurValue;
        }
        break;
      case "USD":
        if (item.currency === "BS") {
          return price / usdValue;
        } else if (item.currency === "EUR") {
          return (price * eurValue) / usdValue;
        }
        break;
      case "EUR":
        if (item.currency === "BS") {
          return price / eurValue;
        } else if (item.currency === "USD") {
          return (price * usdValue) / eurValue;
        }
        break;
    }

    return item.sellingPrice; // Fallback
  };

  // Calculations
  const sellingPrice = (item: InventoryItem) => {
    return getRightPriceBasedOnCurrency(
      item,
      item.sellingPrice,
      defaultCurrency,
      usdValue,
      eurValue,
    );
  };

  const subtotal = cartItems.reduce(
    (sum, item) => sum + sellingPrice(item) * item.cartQuantity,
    0,
  );
  // Calculate tax at 10% IF item.includesTax is true
  const taxAmount = cartItems.reduce(
    (sum, item) =>
      sum + (item.includesTax ? sellingPrice(item) * item.cartQuantity * 0.1 : 0),
    0,
  );
  const totalAmount = subtotal + taxAmount;

  const amountPaid = currentPayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingDue = totalAmount - amountPaid;

  return (
    <CartContext.Provider
      value={{
        cartItems,
        savedCarts,
        addToCart,
        removeFromCart,
        updateCartItemQuantity,
        clearCart,
        saveCart,
        loadCart,
        deleteSavedCart,
        subtotal,
        taxAmount,
        totalAmount,
        currentPayments,
        transactionNotes,
        addPayment,
        setTransactionNotes,
        clearPayments,
        amountPaid,
        remainingDue,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
