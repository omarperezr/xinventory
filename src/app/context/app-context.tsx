import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { toast } from "sonner";

export type UnitType = "units" | "kg" | "liters";

export interface ItemHistoryRecord {
  date: string;
  action: "create" | "update" | "delete" | "sale" | "return";
  details: string;
  user: string;
  previousStock?: number;
  newStock?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  barcode: string;
  buyingPrice: number;
  sellingPrice: number; // Formerly 'price'
  quantity: number;
  unit: UnitType;
  includesTaxes: boolean;
  currency: string;
  image?: string;
  history: ItemHistoryRecord[];
  discount?: number; // Discount percentage (0-100)
}

// Helper function to calculate discounted price
export const applyDiscount = (price: number, discount?: number): number => {
  if (!discount || discount <= 0) return price;
  return price * (1 - discount / 100);
};

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

interface AppContextType {
  // Inventory
  items: InventoryItem[];
  addItem: (item: Omit<InventoryItem, "id" | "history">, user: string) => void;
  updateItem: (item: InventoryItem, user: string, notes?: string) => void;
  deleteItem: (id: string, user: string) => void;

  // Currency
  currency: "BS" | "USD" | "EUR";
  setCurrency: (c: "BS" | "USD" | "EUR") => void;
  rates: { USD: number; EUR: number };
  updateRates: (usd: number, eur: number) => void;
  convertPrice: (priceInBs: number) => number;
  formatPrice: (priceInBs: number) => string;

  // Cart
  cartItems: CartItem[];
  addToCart: (item: InventoryItem, quantity: number) => void;
  removeFromCart: (itemId: string) => void;
  updateCartItemQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;

  // Cart Totals
  subtotal: number;
  taxAmount: number;
  totalAmount: number;

  // Payment
  currentPayments: PaymentRecord[];
  transactionNotes: string;
  addPayment: (method: string, amount: number) => void;
  setTransactionNotes: (notes: string) => void;
  clearPayments: () => void;
  amountPaid: number;
  remainingDue: number;

  // Saved Carts
  savedCarts: SavedCart[];
  saveCart: () => void;
  loadCart: (cart: SavedCart) => void;
  deleteSavedCart: (cartId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  // Inventory State
  const [items, setItems] = useState<InventoryItem[]>([]);

  // Currency State
  const [currency, setCurrency] = useState<"BS" | "USD" | "EUR">("BS");
  const [rates, setRates] = useState({ USD: 1, EUR: 1 });

  // Cart State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [savedCarts, setSavedCarts] = useState<SavedCart[]>([]);
  const [currentPayments, setCurrentPayments] = useState<PaymentRecord[]>([]);
  const [transactionNotes, setTransactionNotes] = useState("");

  // --- PERSISTENCE ---
  useEffect(() => {
    const loadedItems = localStorage.getItem("inventoryItems");
    const loadedRates = localStorage.getItem("exchangeRates");
    const loadedSavedCarts = localStorage.getItem("savedCarts");

    if (loadedItems) setItems(JSON.parse(loadedItems));
    if (loadedRates) setRates(JSON.parse(loadedRates));
    if (loadedSavedCarts) setSavedCarts(JSON.parse(loadedSavedCarts));
  }, []);

  useEffect(() => {
    localStorage.setItem("inventoryItems", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem("exchangeRates", JSON.stringify(rates));
  }, [rates]);

  useEffect(() => {
    localStorage.setItem("savedCarts", JSON.stringify(savedCarts));
  }, [savedCarts]);

  // --- INVENTORY ACTIONS ---
  const addItem = (
    newItemData: Omit<InventoryItem, "id" | "history">,
    user: string,
  ) => {
    const newItem: InventoryItem = {
      ...newItemData,
      id: Date.now().toString(),
      history: [
        {
          date: new Date().toISOString(),
          action: "create",
          details: "Producto creado inicialmente",
          user,
          newStock: newItemData.quantity,
        },
      ],
    };
    setItems((prev) => [...prev, newItem]);
    toast.success("Producto agregado exitosamente");
  };

  const updateItem = (
    updatedItem: InventoryItem,
    user: string,
    notes?: string,
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== updatedItem.id) return item;

        const history = [...item.history];

        // Stock Change Log
        if (item.quantity !== updatedItem.quantity) {
          history.push({
            date: new Date().toISOString(),
            action: "update",
            details: `Stock modificado: ${item.quantity} -> ${updatedItem.quantity}. ${notes ? `Notas: ${notes}` : ""}`,
            user,
            previousStock: item.quantity,
            newStock: updatedItem.quantity,
          });
        } else if (notes) {
          history.push({
            date: new Date().toISOString(),
            action: "update",
            details: `Actualización: ${notes}`,
            user,
          });
        }

        return { ...updatedItem, history };
      }),
    );
    toast.success("Producto actualizado");
  };

  const deleteItem = (id: string, user: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Producto eliminado");
  };

  // --- CURRENCY ACTIONS ---
  const updateRates = (usd: number, eur: number) => {
    setRates({ USD: usd, EUR: eur });
    toast.success("Tasas de cambio actualizadas");
  };

  const convertPrice = (priceInBs: number) => {
    if (currency === "BS") return priceInBs;
    if (currency === "USD") return priceInBs / rates.USD;
    if (currency === "EUR") return priceInBs / rates.EUR;
    return priceInBs;
  };

  const formatPrice = (priceInBs: number) => {
    const converted = convertPrice(priceInBs);
    const symbol = currency === "BS" ? "Bs" : currency === "USD" ? "$" : "€";
    return `${symbol} ${converted.toFixed(2)}`;
  };

  // --- CART ACTIONS ---
  const addToCart = (item: InventoryItem, quantity: number) => {
    if (item.quantity <= 0) {
      toast.error(`No hay suficiente stock de ${item.name} para comprar.`);
      return;
    }

    // Check if adding this quantity exceeds stock considering what's already in cart
    const existingInCart = cartItems.find((i) => i.id === item.id);
    const currentCartQty = existingInCart ? existingInCart.cartQuantity : 0;

    if (currentCartQty + quantity > item.quantity) {
      toast.error(`No hay suficiente producto ${item.name} para comprar.`);
      return;
    }

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
    toast.success(
      `Agregado ${quantity} ${item.unit === "units" ? "unidades" : item.unit} de ${item.name}`,
    );
  };

  const removeFromCart = (itemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const updateCartItemQuantity = (itemId: string, quantity: number) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    if (quantity > item.quantity) {
      toast.error(`No hay suficiente producto ${item.name}`);
      return;
    }

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

  // --- CART CALCULATIONS ---
  // Calculates based on Selling Price in BS
  const subtotal = cartItems.reduce(
    (sum, item) =>
      sum + applyDiscount(item.sellingPrice, item.discount) * item.cartQuantity,
    0,
  );

  // Tax is calculated ONLY for items that have includesTaxes = true
  const taxAmount = cartItems.reduce((sum, item) => {
    if (item.includesTaxes) {
      return sum + item.sellingPrice * item.cartQuantity * 0.1; // 10% tax
    }
    return sum;
  }, 0);

  const totalAmount = subtotal + taxAmount;

  // Payment math
  const amountPaid = currentPayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingDue = totalAmount - amountPaid;

  // --- SAVED CARTS ---
  const saveCart = () => {
    if (cartItems.length === 0) {
      toast.error("La lista está vacía");
      return;
    }

    const newSavedCart: SavedCart = {
      id: Date.now().toString(),
      name: `Lista - ${new Date().toLocaleString()}`,
      items: [...cartItems],
      dateSaved: new Date().toISOString(),
      payments: [...currentPayments],
      notes: transactionNotes,
    };

    setSavedCarts((prev) => [newSavedCart, ...prev]);
    clearCart();
    toast.success("Lista guardada");
  };

  const loadCart = (cart: SavedCart) => {
    setCartItems(cart.items);
    setCurrentPayments(cart.payments || []);
    setTransactionNotes(cart.notes || "");
    toast.success("Lista cargada");
  };

  const deleteSavedCart = (cartId: string) => {
    setSavedCarts((prev) => prev.filter((c) => c.id !== cartId));
    toast.success("Lista eliminada");
  };

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

  return (
    <AppContext.Provider
      value={{
        items,
        addItem,
        updateItem,
        deleteItem,
        currency,
        setCurrency,
        rates,
        updateRates,
        convertPrice,
        formatPrice,
        cartItems,
        addToCart,
        removeFromCart,
        updateCartItemQuantity,
        clearCart,
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
        savedCarts,
        saveCart,
        loadCart,
        deleteSavedCart,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
