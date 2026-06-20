import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { toast } from "sonner";
import { supabase } from "../services/supabase";

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
  buyingPrice: number; // Canonical price, always USD
  sellingPrice: number; // Canonical price, always USD
  quantity: number;
  unit: UnitType;
  includesTaxes: boolean;
  currency: string;
  discount: number; // Percentage 0-100
  image?: string;
  images: string[]; // Public Supabase Storage URLs
  type: string; // Product type/category, default "UNASSIGNED"
  brand: string; // Product brand, default "GENERIC"
  notes: string; // Free-text product notes, shown in detail view
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
  updateItem: (
    item: InventoryItem,
    user: string,
    notes?: string,
    silent?: boolean,
  ) => void;
  deleteItem: (id: string, user: string) => void;

  // Currency — prices are stored in USD; rates convert USD -> BS/EUR for display
  currency: "BS" | "USD" | "EUR";
  setCurrency: (c: "BS" | "USD" | "EUR") => void;
  rates: { USD: number; EUR: number }; // Bs per 1 USD, Bs per 1 EUR
  updateRates: (usd: number, eur: number) => void;
  convertPrice: (priceInUsd: number) => number;
  formatPrice: (priceInUsd: number) => string;

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

// Normalizes free-text fields for consistent, efficient DB lookups:
// uppercase, trimmed, internal whitespace collapsed to single spaces.
function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeItemText<T extends { name: string; barcode: string; type: string; brand: string }>(
  item: T,
): T {
  return {
    ...item,
    name: normalizeText(item.name),
    barcode: normalizeText(item.barcode),
    type: normalizeText(item.type || "unassigned"),
    brand: normalizeText(item.brand || "generic"),
  };
}

function mapRow(row: any, historyRows: any[]): InventoryItem {
  const itemHistory: ItemHistoryRecord[] = historyRows
    .filter((h) => h.item_id === row.id)
    .map((h) => ({
      date: h.date,
      action: h.action,
      details: h.details,
      user: h.user_name,
      previousStock: h.previous_stock ?? undefined,
      newStock: h.new_stock ?? undefined,
    }));

  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    buyingPrice: Number(row.buying_price_usd) || 0,
    sellingPrice: Number(row.selling_price_usd) || 0,
    quantity: row.quantity,
    unit: row.unit,
    includesTaxes: row.includes_taxes,
    currency: "USD",
    discount: Number(row.discount) || 0,
    images: row.images || [],
    type: row.type || "UNASSIGNED",
    brand: row.brand || "GENERIC",
    notes: row.notes || "",
    history: itemHistory,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  // Inventory State
  const [items, setItems] = useState<InventoryItem[]>([]);

  // Currency State
  const [currency, setCurrency] = useState<"BS" | "USD" | "EUR">("USD");
  const [rates, setRates] = useState({ USD: 36.5, EUR: 39.2 });

  // Cart State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [savedCarts, setSavedCarts] = useState<SavedCart[]>([]);
  const [currentPayments, setCurrentPayments] = useState<PaymentRecord[]>([]);
  const [transactionNotes, setTransactionNotes] = useState("");

  // --- PERSISTENCE & INITIALIZATION ---
  const refreshData = async () => {
    try {
      const [{ data: itemRows, error: itemsErr }, { data: historyRows, error: histErr }] =
        await Promise.all([
          supabase.from("items").select("*").order("created_at", { ascending: false }),
          supabase.from("item_history").select("*").order("date", { ascending: false }),
        ]);
      if (itemsErr) throw itemsErr;
      if (histErr) throw histErr;

      setItems((itemRows || []).map((row) => mapRow(row, historyRows || [])));

      const { data: settingsRow } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "rates")
        .maybeSingle();
      if (settingsRow?.value) {
        setRates(settingsRow.value as { USD: number; EUR: number });
      }
    } catch (e) {
      console.error("Error refreshing data from Supabase", e);
      toast.error("Error al cargar datos de Supabase");
    }
  };

  useEffect(() => {
    refreshData();

    const loadedSavedCarts = localStorage.getItem("savedCarts");
    if (loadedSavedCarts) setSavedCarts(JSON.parse(loadedSavedCarts));
  }, []);

  useEffect(() => {
    localStorage.setItem("savedCarts", JSON.stringify(savedCarts));
  }, [savedCarts]);

  // --- INVENTORY ACTIONS ---
  const addItem = async (
    rawItemData: Omit<InventoryItem, "id" | "history">,
    user: string,
  ) => {
    const newItemData = normalizeItemText(rawItemData);

    try {
      const { data: inserted, error } = await supabase
        .from("items")
        .insert({
          name: newItemData.name,
          barcode: newItemData.barcode,
          buying_price_usd: newItemData.buyingPrice,
          selling_price_usd: newItemData.sellingPrice,
          quantity: newItemData.quantity,
          unit: newItemData.unit,
          includes_taxes: newItemData.includesTaxes,
          discount: newItemData.discount || 0,
          images: newItemData.images || [],
          type: newItemData.type || "UNASSIGNED",
          brand: newItemData.brand || "GENERIC",
          notes: newItemData.notes || "",
        })
        .select("id")
        .single();
      if (error) throw error;

      await supabase.from("item_history").insert({
        item_id: inserted.id,
        action: "create",
        details: "Producto creado inicialmente",
        user_name: user,
        new_stock: newItemData.quantity,
      });

      await refreshData();
      toast.success("Producto agregado exitosamente");
    } catch (e) {
      console.error(e);
      toast.error("Error al guardar en Supabase");
    }
  };

  const updateItem = async (
    rawUpdatedItem: InventoryItem,
    user: string,
    notes?: string,
    silent?: boolean,
  ) => {
    const updatedItem = normalizeItemText(rawUpdatedItem);
    const oldItem = items.find((i) => i.id === updatedItem.id);

    try {
      const { error } = await supabase
        .from("items")
        .update({
          name: updatedItem.name,
          barcode: updatedItem.barcode,
          buying_price_usd: updatedItem.buyingPrice,
          selling_price_usd: updatedItem.sellingPrice,
          quantity: updatedItem.quantity,
          unit: updatedItem.unit,
          includes_taxes: updatedItem.includesTaxes,
          discount: updatedItem.discount || 0,
          images: updatedItem.images || [],
          type: updatedItem.type || "UNASSIGNED",
          brand: updatedItem.brand || "GENERIC",
          notes: updatedItem.notes || "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", updatedItem.id);
      if (error) throw error;

      if (oldItem && oldItem.quantity !== updatedItem.quantity) {
        await supabase.from("item_history").insert({
          item_id: updatedItem.id,
          action: "update",
          details: `Stock modificado: ${oldItem.quantity} -> ${updatedItem.quantity}. ${notes ? `Notas: ${notes}` : ""}`,
          user_name: user,
          previous_stock: oldItem.quantity,
          new_stock: updatedItem.quantity,
        });
      } else if (notes) {
        await supabase.from("item_history").insert({
          item_id: updatedItem.id,
          action: "update",
          details: `Actualización: ${notes}`,
          user_name: user,
        });
      }

      await refreshData();
      if (!silent) toast.success("Producto actualizado");
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar");
    }
  };

  const deleteItem = async (id: string, _user: string) => {
    try {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw error;
      await refreshData();
      toast.success("Producto eliminado");
    } catch (e) {
      console.error(e);
      toast.error("Error al eliminar");
    }
  };

  // --- CURRENCY ACTIONS ---
  const updateRates = async (usd: number, eur: number) => {
    try {
      const ratesObj = { USD: usd, EUR: eur };
      const { error } = await supabase
        .from("settings")
        .upsert({ key: "rates", value: ratesObj });
      if (error) throw error;
      setRates(ratesObj);
      toast.success("Tasas de cambio actualizadas");
    } catch (e) {
      console.error(e);
      toast.error("Error al guardar tasas");
    }
  };

  // Base price is always USD. BS/EUR are derived display-only conversions.
  const convertPrice = (priceInUsd: number) => {
    if (currency === "USD") return priceInUsd;
    if (currency === "BS") return priceInUsd * rates.USD;
    if (currency === "EUR") return (priceInUsd * rates.USD) / rates.EUR;
    return priceInUsd;
  };

  const formatPrice = (priceInUsd: number) => {
    const converted = convertPrice(priceInUsd);
    const symbol = currency === "BS" ? "Bs" : currency === "USD" ? "$" : "€";
    return `${symbol} ${converted.toFixed(2)}`;
  };

  // --- CART ACTIONS ---
  const addToCart = (item: InventoryItem, quantity: number) => {
    if (item.quantity <= 0) {
      toast.error(`No hay suficiente stock de ${item.name} para comprar.`);
      return;
    }

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

  // --- CART CALCULATIONS (USD base) ---
  const subtotal = cartItems.reduce((sum, item) => {
    let price = item.sellingPrice;
    if (item.applyDiscount && item.discount > 0) {
      price = price * (1 - item.discount / 100);
    }
    return sum + price * item.cartQuantity;
  }, 0);

  const taxAmount = cartItems.reduce((sum, item) => {
    if (item.includesTaxes) {
      let price = item.sellingPrice;
      if (item.applyDiscount && item.discount > 0) {
        price = price * (1 - item.discount / 100);
      }
      return sum + price * item.cartQuantity * 0.1;
    }
    return sum;
  }, 0);

  const totalAmount = subtotal + taxAmount;

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
