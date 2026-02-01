import { useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { InventoryHeader } from "./components/inventory-header";
import { AdminView } from "./components/admin-view";
import { SearchView } from "./components/search-view";
import { TotalView } from "./components/total-view";
import { HistoryView } from "./components/history-view";
import { ReportsView } from "./components/reports-view";
import {
  AppProvider,
  useApp,
  CartItem,
  InventoryItem,
} from "./context/app-context";
import { HistoryProvider, useHistory } from "./context/history-context";
import { AuthProvider, useAuth } from "./context/auth-context";
import { Toaster, toast } from "sonner";

function AppContent() {
  const {
    items,
    updateItem,
    subtotal,
    taxAmount,
    totalAmount,
    currentPayments,
    transactionNotes,
  } = useApp();

  const { addTransaction } = useHistory();
  const { currentUser } = useAuth();

  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>();
  const navigate = useNavigate();

  const handleEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    navigate("/");
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  };

  const handleCancelEdit = () => {
    setEditingItem(undefined);
  };

  const handleCheckout = (cartItems: CartItem[]) => {
    if (!currentUser) return;

    // Update Inventory (Deduct Stock)
    cartItems.forEach((cartItem) => {
      const originalItem = items.find((i) => i.id === cartItem.id);
      if (originalItem) {
        const newQuantity = Math.max(
          0,
          originalItem.quantity - cartItem.cartQuantity,
        );
        updateItem(
          { ...originalItem, quantity: newQuantity },
          currentUser.name,
          `Venta realizada (ID Transacción: ${Date.now()})`,
        );
      }
    });

    // Add to History
    addTransaction(
      cartItems,
      subtotal,
      taxAmount,
      totalAmount,
      currentPayments,
      currentUser.name,
      transactionNotes,
    );

    toast.success("Pago exitoso. Inventario actualizado.");
  };

  const handleReturnInventory = (itemId: string, quantity: number) => {
    if (!currentUser) return;

    const originalItem = items.find((i) => i.id === itemId);
    if (originalItem) {
      updateItem(
        { ...originalItem, quantity: originalItem.quantity + quantity },
        currentUser.name,
        `Devolución de mercancía`,
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Toaster position="top-right" />

      <InventoryHeader />

      <main className="max-w-7xl mx-auto px-8 py-8">
        <Routes>
          <Route
            path="/"
            element={
              <AdminView
                editingItem={editingItem}
                onEditItem={handleEditItem}
                onCancelEdit={handleCancelEdit}
              />
            }
          />
          <Route
            path="/search"
            element={
              <SearchView
                onEditItem={handleEditItem}
                onDeleteItem={(id) => {}}
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
          <Route path="/reports" element={<ReportsView />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <HistoryProvider>
            <AppContent />
          </HistoryProvider>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
