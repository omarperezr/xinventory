import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { toast } from "sonner";
import { supabase } from "../services/supabase";
import * as offlineStore from "../utils/offlineStore";

export type UnitType = "units" | "kg" | "liters";

// Which stored rate is treated as the "honest" bolivar rate - the one that
// says what a bolivar amount is really worth in dollars. In Venezuela that is
// normally the Binance P2P (parallel) rate, but it is configurable because the
// answer is a business decision, not a technical one.
export type RateKey = "USD" | "EUR" | "USDT";

// Display lenses. USD is the canonical price; every other option renders a
// BOLIVAR amount, differing only in which rate produced it:
//   BS   -> honest rate (configurable, default USDT) - the real charge
//   BCV  -> official government rate - reference only
//   EUR  -> official EUR rate        - reference only
//   USDT -> Binance parallel rate    - reference only
export type DisplayCurrency = "USD" | "BS" | "BCV" | "EUR" | "USDT";

export interface Rates {
  USD: number;
  EUR: number;
  USDT: number;
}

// Raised when the server refuses a sale because the stock ran out, usually
// because another seller took the last units first. Carries the offending
// item so the cart can point at the exact line that has to change.
export class InsufficientStockError extends Error {
  constructor(
    public readonly itemId: string,
    public readonly itemName: string,
  ) {
    super("INSUFFICIENT_STOCK");
    this.name = "InsufficientStockError";
  }
}

// Lenses other than USD and BS are reference views: they show what a price
// looks like at a rate we do NOT consider honest, so money must never be
// entered through them (the value would be booked at the wrong worth).
export function isReferenceLens(c: DisplayCurrency): boolean {
  return c !== "USD" && c !== "BS";
}

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
  // When this item last changed. Used for the "last movement" column, which
  // previously required downloading the entire item_history table.
  updatedAt?: string;
  // Loaded on demand by loadItemHistory, empty until then.
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
  refreshData: () => Promise<void>;
  // Loads one item's movement history on demand. The list view never carries
  // history, so the history dialog asks for it when it opens.
  loadItemHistory: (itemId: string) => Promise<ItemHistoryRecord[]>;
  addItem: (item: Omit<InventoryItem, "id" | "history">, user: string) => Promise<void>;
  updateItem: (
    item: InventoryItem,
    user: string,
    notes?: string,
    silent?: boolean,
  ) => Promise<void>;
  deleteItem: (id: string, user: string) => Promise<void>;
  deleteItems: (ids: string[], user: string) => Promise<void>;
  // Atomic server-side stock movement. delta < 0 sells, delta > 0 restocks.
  adjustStock: (
    itemId: string,
    delta: number,
    user: string,
    details: string,
  ) => Promise<void>;
  importItems: (
    rows: Omit<InventoryItem, "id" | "history" | "images" | "currency">[],
    user: string,
  ) => Promise<{ created: number; updated: number }>;

  // Currency - prices are stored in USD; rates convert USD -> Bs for display
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  rates: Rates; // Bs per 1 USD, Bs per 1 EUR, Bs per 1 USDT
  honestRateKey: RateKey;
  honestRate: number; // Bs per 1 USD of real worth
  updateRates: (
    usd: number,
    eur: number,
    usdt: number,
    honest?: RateKey,
  ) => void;

  // DISPLAY ONLY. Never feed the result of this back into a write - see
  // bsToUsd below for why these two are deliberately not inverses.
  convertPrice: (priceInUsd: number) => number;
  currencySymbol: string;
  formatPrice: (priceInUsd: number) => string;
  // Reference figure shown alongside the honest price for clients who want to
  // see the official rate. Null when the official rate is the honest one.
  formatReferencePrice: (priceInUsd: number) => string | null;

  // MONEY ENTRY. A bolivar amount is worth what the HONEST rate says it is,
  // regardless of which rate was used to arrive at that figure - buying at the
  // BCV rate genuinely is a cheaper purchase in real terms. These are exact
  // inverses of each other, so a display/edit round trip cannot drift.
  bsToUsd: (amountInBs: number) => number;
  usdToBs: (amountInUsd: number) => number;

  // Cart
  cartItems: CartItem[];
  addToCart: (item: InventoryItem, quantity: number) => void;
  removeFromCart: (itemId: string) => void;
  updateCartItemQuantity: (itemId: string, quantity: number) => void;
  updateCartItemPrice: (itemId: string, sellingPriceUsd: number) => void;
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
    type: normalizeText(item.type || "N/A"),
    brand: normalizeText(item.brand || "GENERICO"),
  };
}

// Maps a database row to the shape the UI uses. History is not included: it
// is loaded per item, on demand, by loadItemHistory.
function mapRow(row: any): InventoryItem {
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
    updatedAt: row.updated_at ?? row.created_at ?? undefined,
    history: [],
  };
}

const ACTIVE_CART_KEY = "xinventory-active-cart";

interface PersistedActiveCart {
  cartItems: CartItem[];
  currentPayments: PaymentRecord[];
  transactionNotes: string;
}

function loadActiveCart(): PersistedActiveCart {
  try {
    const raw = localStorage.getItem(ACTIVE_CART_KEY);
    if (!raw) return { cartItems: [], currentPayments: [], transactionNotes: "" };
    const parsed = JSON.parse(raw);
    return {
      cartItems: parsed.cartItems || [],
      currentPayments: parsed.currentPayments || [],
      transactionNotes: parsed.transactionNotes || "",
    };
  } catch {
    return { cartItems: [], currentPayments: [], transactionNotes: "" };
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  // Inventory State
  const [items, setItems] = useState<InventoryItem[]>([]);

  // Currency State
  const [currency, setCurrency] = useState<DisplayCurrency>("USD");
  const [rates, setRates] = useState<Rates>({ USD: 36.5, EUR: 39.2, USDT: 36.5 });
  // Which rate defines the real worth of a bolivar. Configurable per business;
  // Binance P2P (USDT) is the usual answer in Venezuela.
  const [honestRateKey, setHonestRateKey] = useState<RateKey>("USDT");
  // Guard against a zero/NaN rate silently producing Infinity prices.
  const rawHonestRate = rates[honestRateKey];
  const honestRate =
    Number.isFinite(rawHonestRate) && rawHonestRate > 0 ? rawHonestRate : 1;

  // Cart State - the in-progress cart is restored from localStorage so a
  // refresh or offline reload doesn't lose it (savedCarts below are
  // explicitly-saved separate lists).
  const initialActiveCart = loadActiveCart();
  const [cartItems, setCartItems] = useState<CartItem[]>(initialActiveCart.cartItems);
  const [savedCarts, setSavedCarts] = useState<SavedCart[]>([]);
  const [currentPayments, setCurrentPayments] = useState<PaymentRecord[]>(
    initialActiveCart.currentPayments,
  );
  const [transactionNotes, setTransactionNotes] = useState(initialActiveCart.transactionNotes);

  // Persistence and initialization
  // Network-first with an IndexedDB fallback, so the inventory and cart stay
  // usable offline; see utils/offlineStore.ts for the cache/outbox logic.
  const refreshData = async () => {
    try {
      const { itemRows, offline } = await offlineStore.fetchInventory();
      setItems(itemRows.map(mapRow));
      if (offline) return;

      const { data: settingsRow } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "rates")
        .maybeSingle();
      if (settingsRow?.value) {
        const stored = settingsRow.value as Partial<Rates> & { honest?: RateKey };
        // Older settings rows predate USDT - fall back to the USD rate.
        setRates({
          USD: stored.USD ?? 36.5,
          EUR: stored.EUR ?? 39.2,
          USDT: stored.USDT ?? stored.USD ?? 36.5,
        });
        // Rows written before the honest-rate setting existed default to USDT,
        // which is the behaviour those rows were already assuming.
        if (stored.honest === "USD" || stored.honest === "EUR" || stored.honest === "USDT") {
          setHonestRateKey(stored.honest);
        }
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

    // Re-fetch when the user signs in. The initial fetch above runs before
    // authentication, so RLS returns nothing until a session exists - without
    // this, data only appears after a manual page refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") refreshData();
    });

    // Flush any queued offline writes as soon as connectivity returns.
    const handleOnline = () => {
      offlineStore.flushOutbox().then(refreshData);
    };
    window.addEventListener("online", handleOnline);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("savedCarts", JSON.stringify(savedCarts));
  }, [savedCarts]);

  useEffect(() => {
    const active: PersistedActiveCart = { cartItems, currentPayments, transactionNotes };
    localStorage.setItem(ACTIVE_CART_KEY, JSON.stringify(active));
  }, [cartItems, currentPayments, transactionNotes]);

  // Inventory actions
  // Each action below writes through utils/offlineStore.ts, which attempts
  // the Supabase call immediately and transparently queues it (replayed once
  // back online) if the network is unavailable.
  const addItem = async (
    rawItemData: Omit<InventoryItem, "id" | "history">,
    user: string,
  ) => {
    const newItemData = normalizeItemText(rawItemData);
    const id = crypto.randomUUID();

    try {
      const { queued } = await offlineStore.createItem(
        {
          id,
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
        },
        {
          item_id: id,
          action: "create",
          details: "Producto creado inicialmente",
          user_name: user,
          new_stock: newItemData.quantity,
        },
      );

      // Insert into local state rather than refetching the whole catalog.
      setItems((prev) => [
        {
          ...newItemData,
          id,
          currency: "USD",
          updatedAt: new Date().toISOString(),
          history: [],
        } as InventoryItem,
        ...prev,
      ]);
      toast.success(
        queued ? "Producto guardado localmente (sin conexión)" : "Producto agregado exitosamente",
      );
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

    const historyRow =
      oldItem && oldItem.quantity !== updatedItem.quantity
        ? {
            item_id: updatedItem.id,
            action: "update" as const,
            details: `Stock modificado: ${oldItem.quantity} -> ${updatedItem.quantity}. ${notes ? `Notas: ${notes}` : ""}`,
            user_name: user,
            previous_stock: oldItem.quantity,
            new_stock: updatedItem.quantity,
          }
        : notes
          ? {
              item_id: updatedItem.id,
              action: "update" as const,
              details: `Actualización: ${notes}`,
              user_name: user,
            }
          : undefined;

    try {
      const { queued } = await offlineStore.updateItem(
        updatedItem.id,
        {
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
        },
        historyRow,
      );

      // Apply the edit locally instead of refetching. The server timestamp is
      // authoritative, but an approximation is fine for the display column.
      setItems((prev) =>
        prev.map((i) =>
          i.id === updatedItem.id
            ? { ...updatedItem, updatedAt: new Date().toISOString() }
            : i,
        ),
      );
      if (!silent)
        toast.success(queued ? "Cambios guardados localmente (sin conexión)" : "Producto actualizado");
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar");
    }
  };

  const deleteItem = async (id: string, _user: string) => {
    try {
      const { queued } = await offlineStore.deleteItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success(queued ? "Eliminación guardada localmente (sin conexión)" : "Producto eliminado");
    } catch (e) {
      console.error(e);
      toast.error("Error al eliminar");
    }
  };

  const deleteItems = async (ids: string[], user: string) => {
    if (ids.length === 0) return;
    try {
      const historyRows = ids.map((id) => ({
        item_id: id,
        action: "delete" as const,
        details: "Eliminación masiva",
        user_name: user,
      }));
      const { queued } = await offlineStore.bulkDeleteItems(ids, historyRows);
      // No refetch: we already know the outcome of the delete.
      const idSet = new Set(ids);
      setItems((prev) => prev.filter((i) => !idSet.has(i.id)));
      toast.success(
        queued
          ? `${ids.length} producto(s) eliminados localmente (sin conexión)`
          : `${ids.length} producto(s) eliminados`,
      );
    } catch (e) {
      console.error(e);
      toast.error("Error al eliminar productos");
    }
  };

  // Stable identity: consumers put this in useEffect dependency arrays, and a
  // fresh function on every provider render would restart the fetch in a loop.
  const loadItemHistory = useCallback(
    async (itemId: string): Promise<ItemHistoryRecord[]> => {
      const rows = await offlineStore.fetchItemHistory(itemId);
      return rows.map((h: any) => ({
        date: h.date,
        action: h.action,
        details: h.details,
        user: h.user_name,
        previousStock: h.previous_stock ?? undefined,
        newStock: h.new_stock ?? undefined,
      }));
    },
    [],
  );

  // Moves stock through the server-side RPC so concurrent sellers cannot
  // clobber each other's writes. Local state is patched from the delta rather
  // than refetched, so a multi-line checkout doesn't trigger a fetch per line.
  const adjustStock = async (
    itemId: string,
    delta: number,
    user: string,
    details: string,
  ) => {
    if (delta === 0) return;
    const item = items.find((i) => i.id === itemId);
    const previousStock = item?.quantity;

    await offlineStore.applyStockDelta(itemId, delta, {
      item_id: itemId,
      action: delta < 0 ? "sale" : "return",
      details,
      user_name: user,
      previous_stock: previousStock,
      new_stock:
        previousStock !== undefined
          ? Math.max(0, previousStock + delta)
          : undefined,
    });

    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, quantity: Math.max(0, i.quantity + delta) }
          : i,
      ),
    );
  };

  // Bulk import from Excel: matches each row against the currently loaded
  // items by normalized barcode - updates matches in place, inserts the
  // rest. Requires connectivity (unlike single-item writes, this isn't
  // queued offline since it's a deliberate one-off batch operation).
  const importItems = async (
    rows: Omit<InventoryItem, "id" | "history" | "images" | "currency">[],
    user: string,
  ) => {
    type ImportRow = Omit<InventoryItem, "id" | "history" | "currency">;
    const byBarcode = new Map(items.map((i) => [i.barcode, i]));
    const toInsert: ImportRow[] = [];
    const toUpdate: { id: string; data: ImportRow }[] = [];

    for (const raw of rows) {
      const normalized = normalizeItemText({ ...raw, images: [] as string[] });
      const existing = byBarcode.get(normalized.barcode);
      if (existing) {
        toUpdate.push({ id: existing.id, data: normalized });
      } else {
        toInsert.push(normalized);
      }
    }

    try {
      if (toInsert.length > 0) {
        const { error } = await supabase.from("items").insert(
          toInsert.map((d) => ({
            name: d.name,
            barcode: d.barcode,
            buying_price_usd: d.buyingPrice,
            selling_price_usd: d.sellingPrice,
            quantity: d.quantity,
            unit: d.unit,
            includes_taxes: d.includesTaxes,
            discount: d.discount || 0,
            images: [],
            type: d.type || "UNASSIGNED",
            brand: d.brand || "GENERIC",
            notes: d.notes || "",
          })),
        );
        if (error) throw error;
      }

      // Batched as a single upsert keyed on id (the PK), instead of one
      // UPDATE round-trip per row - N sequential requests would otherwise
      // make large imports painfully slow.
      if (toUpdate.length > 0) {
        const { error } = await supabase.from("items").upsert(
          toUpdate.map(({ id, data }) => ({
            id,
            name: data.name,
            buying_price_usd: data.buyingPrice,
            selling_price_usd: data.sellingPrice,
            quantity: data.quantity,
            unit: data.unit,
            includes_taxes: data.includesTaxes,
            discount: data.discount || 0,
            type: data.type || "UNASSIGNED",
            brand: data.brand || "GENERIC",
            notes: data.notes || "",
            updated_at: new Date().toISOString(),
          })),
        );
        if (error) throw error;
      }

      if (toUpdate.length > 0) {
        await supabase.from("item_history").insert(
          toUpdate.map(({ id }) => ({
            item_id: id,
            action: "update" as const,
            details: "Actualización vía importación de Excel",
            user_name: user,
          })),
        );
      }

      await refreshData();
      return { created: toInsert.length, updated: toUpdate.length };
    } catch (e) {
      console.error(e);
      toast.error("Error al importar productos");
      throw e;
    }
  };

  // Currency actions
  const updateRates = async (
    usd: number,
    eur: number,
    usdt: number,
    honest: RateKey = honestRateKey,
  ) => {
    try {
      const ratesObj = { USD: usd, EUR: eur, USDT: usdt };
      const { queued } = await offlineStore.updateRates({ ...ratesObj, honest });
      setRates(ratesObj);
      setHonestRateKey(honest);
      toast.success(queued ? "Tasas guardadas localmente (sin conexión)" : "Tasas de cambio actualizadas");
    } catch (e) {
      console.error(e);
      toast.error("Error al guardar tasas");
    }
  };

  // Money entry (exact inverses - safe to round-trip)
  // A bolivar figure is worth whatever the honest rate says, no matter which
  // rate produced it. Provider A quoting at BCV and provider B quoting at the
  // parallel rate are not different conversions; A is simply a cheaper deal.
  const bsToUsd = (amountInBs: number) => amountInBs / honestRate;
  const usdToBs = (amountInUsd: number) => amountInUsd * honestRate;

  // Display lens (read-only - not the inverse of bsToUsd)
  // Every non-USD lens renders bolivares; they differ only in which rate was
  // applied. Feeding this back through bsToUsd would rebook the price at a
  // different worth, so reference lenses are read-only in the UI.
  const convertPrice = (priceInUsd: number) => {
    switch (currency) {
      case "USD":
        return priceInUsd;
      case "BS":
        return usdToBs(priceInUsd);
      case "BCV":
        return priceInUsd * rates.USD;
      case "EUR":
        return priceInUsd * rates.EUR;
      case "USDT":
        return priceInUsd * rates.USDT;
      default:
        return priceInUsd;
    }
  };

  const currencySymbol = currency === "USD" ? "$" : "Bs";

  const formatPrice = (priceInUsd: number) =>
    `${currencySymbol} ${convertPrice(priceInUsd).toFixed(2)}`;

  // Clients often want to see the official (BCV) figure next to the real one.
  // Suppressed when BCV already is the honest rate, or when showing USD.
  const formatReferencePrice = (priceInUsd: number) => {
    if (currency !== "BS" || honestRateKey === "USD") return null;
    return `Bs ${(priceInUsd * rates.USD).toFixed(2)} (BCV)`;
  };

  // Cart actions
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

    toast.success(`${item.name} agregado al carrito`, {
      description: `Cantidad: ${quantity}`,
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

  // Overrides the unit selling price for a single cart line (e.g. the seller
  // closed the sale at a different price). Only affects this cart entry - the
  // stored inventory price is untouched.
  const updateCartItemPrice = (itemId: string, sellingPriceUsd: number) => {
    if (isNaN(sellingPriceUsd) || sellingPriceUsd < 0) return;
    setCartItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, sellingPrice: sellingPriceUsd } : i,
      ),
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

  // Cart calculations (USD base)
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

  // Saved carts
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

  // Clears only the money recorded so far. Notes survive, because this is also
  // used when a sale is rejected and the seller has to re-take payment against
  // a corrected cart - retyping the notes as well would be needless.
  // clearCart resets the notes when a sale actually finishes.
  const clearPayments = () => {
    setCurrentPayments([]);
  };

  return (
    <AppContext.Provider
      value={{
        items,
        refreshData,
        loadItemHistory,
        addItem,
        updateItem,
        deleteItem,
        deleteItems,
        adjustStock,
        importItems,
        currency,
        setCurrency,
        rates,
        honestRateKey,
        honestRate,
        updateRates,
        convertPrice,
        currencySymbol,
        formatPrice,
        formatReferencePrice,
        bsToUsd,
        usdToBs,
        cartItems,
        addToCart,
        removeFromCart,
        updateCartItemQuantity,
        updateCartItemPrice,
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
