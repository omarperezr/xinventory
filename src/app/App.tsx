import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { InventoryHeader } from "./components/inventory-header";
import { DashboardView } from "./components/dashboard-view";
import { SearchView } from "./components/search-view";
import { TotalView } from "./components/total-view";
import { HistoryView } from "./components/history-view";
import { type InventoryItem } from "./components/inventory-form";
import { CartProvider, type CartItem, useCart } from "./context/cart-context";
import { HistoryProvider, useHistory } from "./context/history-context";
import { Toaster } from "sonner";
import { toast } from "sonner";

function AppContent() {
  const navigate = useNavigate();
  const { addTransaction } = useHistory();
  const { currentPayments, transactionNotes } = useCart(); // Access payment state from Cart
  const [defaultCurrency, setDefaultCurrency] = useState("BS");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>();
  const [usdValue, setUsdValue] = useState(
    Math.max(1, parseFloat(localStorage.getItem("usdValue") || "1")),
  );
  const [eurValue, setEurValue] = useState(
    Math.max(1, parseFloat(localStorage.getItem("eurValue") || "1")),
  );

  // Load data from localStorage on mount
  useEffect(() => {
    const savedItems = localStorage.getItem("inventoryItems");
    const savedCurrency = localStorage.getItem("defaultCurrency");

    if (savedItems) {
      try {
        setItems(JSON.parse(savedItems));
      } catch (error) {
        console.error("Error al cargar los elementos del inventario:", error);
      }
    }

    if (savedCurrency) {
      setDefaultCurrency(savedCurrency);
    }
  }, []);

  // Save items to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("inventoryItems", JSON.stringify(items));
  }, [items]);

  // Save currency to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("defaultCurrency", defaultCurrency);
  }, [defaultCurrency]);

  const handleAddItem = (item: Omit<InventoryItem, "id">) => {
    if (editingItem) {
      // Update existing item
      setItems((prev) =>
        prev.map((i) =>
          i.id === editingItem.id ? { ...item, id: editingItem.id } : i,
        ),
      );
      setEditingItem(undefined);
      toast.success("Producto actualizado exitosamente");
    } else {
      // Add new item
      const newItem: InventoryItem = {
        ...item,
        id: Date.now().toString(),
      };
      setItems((prev) => [...prev, newItem]);
      toast.success("Producto agregado exitosamente");
    }
  };

  const handleEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    navigate("/");
    // Scroll to form after navigation
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (editingItem?.id === id) {
      setEditingItem(undefined);
    }
    toast.success("Producto eliminado exitosamente");
  };

  const handleCancelEdit = () => {
    setEditingItem(undefined);
  };

  const handleCheckout = (cartItems: CartItem[]) => {
    // Calculate totals
    const subtotal = cartItems.reduce(
      (sum, item) => sum + item.sellingPrice * item.cartQuantity,
      0,
    );
    const tax = cartItems.reduce(
      (sum, item) =>
        sum +
        (item.includesTax ? item.sellingPrice * item.cartQuantity * 0.1 : 0),
      0,
    );
    const total = subtotal + tax;

    // Update Inventory
    setItems((prev) =>
      prev.map((item) => {
        const cartItem = cartItems.find((c) => c.id === item.id);
        if (cartItem) {
          return {
            ...item,
            quantity: Math.max(0, item.quantity - cartItem.cartQuantity),
          };
        }
        return item;
      }),
    );

    // Add to History with Payment Details from Context
    // Note: We are using the 'currentPayments' and 'transactionNotes' which are available via closure/context
    // but simpler to pass them here if we refactored AppContent to just use useCart(), but AppContent IS inside CartProvider
    // so we can use useCart hook at the top of this component!

    addTransaction(
      cartItems,
      subtotal,
      tax,
      total,
      currentPayments,
      transactionNotes,
    );

    toast.success("Pago exitoso. Inventario actualizado.");
  };

  const handleReturnInventory = (itemId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return { ...item, quantity: item.quantity + quantity };
        }
        return item;
      }),
    );
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Toaster position="top-right" />

      <InventoryHeader
        defaultCurrency={defaultCurrency}
        onCurrencyChange={setDefaultCurrency}
      />

      <main className="max-w-7xl mx-auto px-8 py-8">
        <Routes>
          <Route
            path="/"
            element={
              <DashboardView
                items={items}
                editingItem={editingItem}
                defaultCurrency={defaultCurrency}
                onAddItem={handleAddItem}
                onEditItem={handleEditItem}
                onCancelEdit={handleCancelEdit}
                onDeleteItem={handleDeleteItem}
                usdValue={usdValue}
                eurValue={eurValue}
                setUsdValue={setUsdValue}
                setEurValue={setEurValue}
              />
            }
          />
          <Route
            path="/search"
            element={
              <SearchView
                items={items}
                onEditItem={handleEditItem}
                onDeleteItem={handleDeleteItem}
              />
            }
          />
          <Route
            path="/total"
            element={<TotalView onCheckout={handleCheckout} />}
          />
          <Route
            path="/history"
            element={<HistoryView onReturnInventory={handleReturnInventory} />}
          />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <HistoryProvider>
          <AppContent />
        </HistoryProvider>
      </CartProvider>
    </BrowserRouter>
  );
}

export default App;
