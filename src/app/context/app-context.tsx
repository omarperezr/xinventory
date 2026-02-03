import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { toast } from "sonner";
import { dbService } from "../services/db";

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
  discount: number; // Percentage 0-100
  image?: string;
  history: ItemHistoryRecord[];
}

export interface CartItem extends InventoryItem {
  cartQuantity: number;
  applyDiscount: boolean;
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
  toggleCartItemDiscount: (itemId: string, apply: boolean) => void;
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

  // --- PERSISTENCE & INITIALIZATION ---
  const refreshData = () => {
    try {
      // Fetch Items
      const itemsRows = dbService.exec("SELECT * FROM items");
      const historyRows = dbService.exec(
        "SELECT * FROM history ORDER BY date DESC",
      );

      const mappedItems = itemsRows.map((item: any) => {
        const itemHistory = historyRows
          .filter((h: any) => h.itemId === item.id)
          .map((h: any) => ({
            ...h,
            previousStock:
              typeof h.previousStock === "number" ? h.previousStock : undefined,
            newStock: typeof h.newStock === "number" ? h.newStock : undefined,
          }));

        return {
          ...item,
          buyingPrice: item.buyingPrice || 0,
          includesTaxes: item.includesTaxes === 1,
          discount: item.discount || 0,
          history: itemHistory,
        };
      });
      setItems(mappedItems);

      // Fetch Rates
      const settings = dbService.exec(
        "SELECT value FROM settings WHERE key = 'rates'",
      );
      if (settings.length > 0) {
        setRates(JSON.parse(settings[0].value));
      }
    } catch (e) {
      console.error("Error refreshing data from DB", e);
    }
  };

  useEffect(() => {
    const init = async () => {
      await dbService.waitForInit();
      refreshData();

      // Load local storage items that are not in DB (SavedCarts)
      const loadedSavedCarts = localStorage.getItem("savedCarts");
      if (loadedSavedCarts) setSavedCarts(JSON.parse(loadedSavedCarts));
    };
    init();
  }, []);

  useEffect(() => {
    localStorage.setItem("savedCarts", JSON.stringify(savedCarts));
  }, [savedCarts]);

  // --- INVENTORY ACTIONS ---
  const addItem = (
    newItemData: Omit<InventoryItem, "id" | "history">,
    user: string,
  ) => {
    const id = Date.now().toString();
    const date = new Date().toISOString();

    try {
      dbService.exec(
        `
            INSERT INTO items (id, name, barcode, buyingPrice, sellingPrice, quantity, unit, includesTaxes, currency, discount)
            VALUES ($id, $name, $barcode, $buyingPrice, $sellingPrice, $quantity, $unit, $includesTaxes, $currency, $discount)
        `,
        {
          $id: id,
          $name: newItemData.name,
          $barcode: newItemData.barcode,
          $buyingPrice: newItemData.buyingPrice,
          $sellingPrice: newItemData.sellingPrice,
          $quantity: newItemData.quantity,
          $unit: newItemData.unit,
          $includesTaxes: newItemData.includesTaxes ? 1 : 0,
          $currency: newItemData.currency,
          $discount: newItemData.discount || 0,
        },
      );

      dbService.exec(
        `
            INSERT INTO history (id, itemId, action, date, details, user, newStock)
            VALUES ($id, $itemId, $action, $date, $details, $user, $newStock)
        `,
        {
          $id: Date.now().toString() + "-h",
          $itemId: id,
          $action: "create",
          $date: date,
          $details: "Producto creado inicialmente",
          $user: user,
          $newStock: newItemData.quantity,
        },
      );

      refreshData();
      toast.success("Producto agregado exitosamente");
    } catch (e) {
      console.error(e);
      toast.error("Error al guardar en base de datos");
    }
  };

  const updateItem = (
    updatedItem: InventoryItem,
    user: string,
    notes?: string,
  ) => {
    const date = new Date().toISOString();
    const oldItem = items.find((i) => i.id === updatedItem.id);

    try {
      dbService.exec(
        `
            UPDATE items 
            SET name=$name, barcode=$barcode, buyingPrice=$buyingPrice, sellingPrice=$sellingPrice, 
                quantity=$quantity, unit=$unit, includesTaxes=$includesTaxes, discount=$discount 
            WHERE id=$id
        `,
        {
          $name: updatedItem.name,
          $barcode: updatedItem.barcode,
          $buyingPrice: updatedItem.buyingPrice,
          $sellingPrice: updatedItem.sellingPrice,
          $quantity: updatedItem.quantity,
          $unit: updatedItem.unit,
          $includesTaxes: updatedItem.includesTaxes ? 1 : 0,
          $discount: updatedItem.discount || 0,
          $id: updatedItem.id,
        },
      );

      // Stock Change Log
      if (oldItem && oldItem.quantity !== updatedItem.quantity) {
        dbService.exec(
          `
                INSERT INTO history (id, itemId, action, date, details, user, previousStock, newStock)
                VALUES ($id, $itemId, 'update', $date, $details, $user, $previousStock, $newStock)
            `,
          {
            $id: Date.now().toString() + "-h1",
            $itemId: updatedItem.id,
            $date: date,
            $details: `Stock modificado: ${oldItem.quantity} -> ${updatedItem.quantity}. ${notes ? `Notas: ${notes}` : ""}`,
            $user: user,
            $previousStock: oldItem.quantity,
            $newStock: updatedItem.quantity,
          },
        );
      } else if (notes) {
        dbService.exec(
          `
                INSERT INTO history (id, itemId, action, date, details, user)
                VALUES ($id, $itemId, 'update', $date, $details, $user)
            `,
          {
            $id: Date.now().toString() + "-h2",
            $itemId: updatedItem.id,
            $date: date,
            $details: `Actualización: ${notes}`,
            $user: user,
          },
        );
      }

      refreshData();
      toast.success("Producto actualizado");
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar");
    }
  };

  const deleteItem = (id: string, user: string) => {
    try {
      dbService.exec("DELETE FROM items WHERE id = $id", { $id: id });
      dbService.exec("DELETE FROM history WHERE itemId = $id", { $id: id });
      refreshData();
      toast.success("Producto eliminado");
    } catch (e) {
      console.error(e);
      toast.error("Error al eliminar");
    }
  };

  // --- CURRENCY ACTIONS ---
  const updateRates = (usd: number, eur: number) => {
    try {
      const ratesObj = { USD: usd, EUR: eur };
      // Check if exists
      const exists = dbService.exec(
        "SELECT key FROM settings WHERE key = 'rates'",
      );
      if (exists.length > 0) {
        dbService.exec(
          "UPDATE settings SET value = $value WHERE key = 'rates'",
          { $value: JSON.stringify(ratesObj) },
        );
      } else {
        dbService.exec(
          "INSERT INTO settings (key, value) VALUES ('rates', $value)",
          { $value: JSON.stringify(ratesObj) },
        );
      }

      refreshData();
      toast.success("Tasas de cambio actualizadas");
    } catch (e) {
      console.error(e);
      toast.error("Error al guardar tasas");
    }
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
      return [
        ...prev,
        { ...item, cartQuantity: quantity, applyDiscount: false },
      ];
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

  const toggleCartItemDiscount = (itemId: string, apply: boolean) => {
    setCartItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, applyDiscount: apply } : i)),
    );
  };

  const clearCart = () => {
    setCartItems([]);
    setCurrentPayments([]);
    setTransactionNotes("");
  };

  // --- CART CALCULATIONS ---
  // Calculates based on Selling Price in BS
  const subtotal = cartItems.reduce((sum, item) => {
    let price = item.sellingPrice;
    if (item.applyDiscount && item.discount > 0) {
      price = price * (1 - item.discount / 100);
    }
    return sum + price * item.cartQuantity;
  }, 0);

  // Tax is calculated ONLY for items that have includesTaxes = true
  const taxAmount = cartItems.reduce((sum, item) => {
    if (item.includesTaxes) {
      let price = item.sellingPrice;
      if (item.applyDiscount && item.discount > 0) {
        price = price * (1 - item.discount / 100);
      }
      return sum + price * item.cartQuantity * 0.1; // 10% tax
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
        toggleCartItemDiscount,
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
