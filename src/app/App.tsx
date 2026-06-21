import { Suspense, lazy, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { Package } from "lucide-react";
import { InventoryHeader } from "./components/inventory-header";
import { LoginPage } from "./components/login-page";

const AdminView = lazy(() =>
  import("./components/admin-view").then((m) => ({ default: m.AdminView })),
);
const SearchView = lazy(() =>
  import("./components/search-view").then((m) => ({ default: m.SearchView })),
);
const TotalView = lazy(() =>
  import("./components/total-view").then((m) => ({ default: m.TotalView })),
);
const HistoryView = lazy(() =>
  import("./components/history-view").then((m) => ({
    default: m.HistoryView,
  })),
);
const ReportsView = lazy(() =>
  import("./components/reports-view").then((m) => ({
    default: m.ReportsView,
  })),
);
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
  const { currentUser, loaded } = useAuth();

  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>();
  const navigate = useNavigate();

  if (!loaded) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 bg-[#2196F3] rounded-xl flex items-center justify-center shadow-lg">
          <Package className="w-6 h-6 text-white" strokeWidth={1.5} />
        </div>
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          Cargando...
        </div>
      </div>
    );
  }

  // Show login page if no user is authenticated
  if (!currentUser) {
    return <LoginPage />;
  }

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
          true,
        );
      }
    });

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
        true,
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Toaster
        position="top-center"
        duration={2200}
        closeButton
        richColors
        toastOptions={{ style: { marginTop: "0.5rem" } }}
      />

      <InventoryHeader />

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
              Cargando...
            </div>
          }
        >
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
                  onDeleteItem={(id) => {
                    toast.error(
                      "Solo los administradores pueden eliminar desde la vista de administración",
                    );
                  }}
                />
              }
            />
            <Route
              path="/total"
              element={<TotalView onCheckout={handleCheckout} />}
            />
            <Route
              path="/history"
              element={
                <HistoryView onReturnInventory={handleReturnInventory} />
              }
            />
            <Route
              path="/reports"
              element={
                currentUser?.role === "admin" ? (
                  <ReportsView />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="text-red-500 font-medium text-lg mb-2">
                      Acceso Restringido
                    </div>
                    <p className="text-gray-500 text-sm">
                      Solo los administradores pueden ver los reportes.
                    </p>
                  </div>
                )
              }
            />
          </Routes>
        </Suspense>
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
