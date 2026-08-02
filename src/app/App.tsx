import { Suspense, lazy, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { Package } from "lucide-react";
import { InventoryHeader } from "./components/inventory-header";
import { LoginPage } from "./components/login-page";
import { OfflineSync } from "./components/offline-sync";
import { Spinner } from "./components/ui/spinner";
import { MODULE_FINANZAS, MODULE_REPORTES, MODULE_REDES } from "./modules";

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
// Optional modules: when the flag folds to false at build time the dynamic
// import below is dead code, so the module's chunks never reach dist/.
const ReportsView = MODULE_REPORTES
  ? lazy(() =>
      import("./components/reports-view").then((m) => ({
        default: m.ReportsView,
      })),
    )
  : null;
const FinanceView = MODULE_FINANZAS
  ? lazy(() =>
      import("./components/finance-view").then((m) => ({
        default: m.FinanceView,
      })),
    )
  : null;
const SocialView = MODULE_REDES
  ? lazy(() =>
      import("./components/social-view").then((m) => ({
        default: m.SocialView,
      })),
    )
  : null;
import {
  AppProvider,
  useApp,
  CartItem,
  InventoryItem,
  PaymentRecord,
  InsufficientStockError,
} from "./context/app-context";
import { HistoryProvider, useHistory } from "./context/history-context";
import { FinanceProvider } from "./context/finance-context";
import { SocialProvider } from "./context/social-context";
import { AuthProvider, useAuth } from "./context/auth-context";
import { Toaster, toast } from "sonner";

function AppContent() {
  const {
    adjustStock,
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
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg">
          <Package className="w-6 h-6 text-white" strokeWidth={1.5} />
        </div>
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Spinner />
          Cargando...
        </div>
      </div>
    );
  }

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

  const handleCheckout = async (
    cartItems: CartItem[],
    payments?: PaymentRecord[],
  ) => {
    if (!currentUser) return;

    const saleRef = Date.now();

    // Stock moves through an atomic server-side decrement, so two sellers
    // ringing up the same product can no longer overwrite each other. Applied
    // sequentially: if one line fails (INSUFFICIENT_STOCK), we stop and roll
    // back the lines already taken rather than recording a partial sale.
    const applied: CartItem[] = [];
    let failedItem: CartItem | undefined;
    const rollbackStock = async (reason: string) => {
      for (const done of applied) {
        try {
          await adjustStock(done.id, done.cartQuantity, currentUser.name, reason);
        } catch (rollbackErr) {
          console.error("No se pudo revertir el stock", rollbackErr);
        }
      }
    };
    try {
      for (const cartItem of cartItems) {
        failedItem = cartItem;
        await adjustStock(
          cartItem.id,
          -cartItem.cartQuantity,
          currentUser.name,
          `Venta realizada (ID Transacción: ${saleRef})`,
        );
        applied.push(cartItem);
      }
      failedItem = undefined;
    } catch (err) {
      await rollbackStock(`Reversión de venta incompleta (ID Transacción: ${saleRef})`);
      const outOfStock = (err as { message?: string })?.message?.includes(
        "INSUFFICIENT_STOCK",
      );
      toast.error(
        outOfStock
          ? `Stock insuficiente: otro vendedor tomó ${failedItem?.name ?? "el producto"} primero.`
          : "No se pudo actualizar el inventario. La venta no fue registrada.",
      );
      // Rethrow so TotalView keeps the cart intact for a retry. The typed
      // error names the offending line so the cart can flag it.
      if (outOfStock && failedItem) {
        throw new InsufficientStockError(failedItem.id, failedItem.name);
      }
      throw err;
    }

    // The sale record is the point of the whole operation: if it cannot be
    // written or queued, put the stock back rather than leaving the shelf
    // short with nothing in the books.
    try {
      await addTransaction(
        cartItems,
        subtotal,
        taxAmount,
        totalAmount,
        payments ?? currentPayments,
        currentUser.name,
        transactionNotes,
      );
    } catch (err) {
      await rollbackStock(`Reversión de venta no registrada (ID Transacción: ${saleRef})`);
      toast.error("No se pudo registrar la venta. El inventario fue restaurado.");
      throw err;
    }

    toast.success("Pago exitoso. Inventario actualizado.");
  };

  return (
    <div className="min-h-screen bg-canvas">
      <Toaster
        position="top-center"
        duration={2200}
        closeButton
        richColors
        toastOptions={{ style: { marginTop: "0.5rem" } }}
      />

      <InventoryHeader />
      <OfflineSync />

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
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
            {/* Returns restock the item inside the same server-side
                transaction that records them, so no separate call here. */}
            <Route path="/history" element={<HistoryView />} />
            {/* Sellers may record what they spend in the field; only admins
                see the whole picture and the purchase side. */}
            {FinanceView && (
              <Route path="/finance" element={<FinanceView />} />
            )}
            {ReportsView && (
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
            )}
            {/* The marketing calendar: config holds an AI API key, so this is
                admin-only end to end (route gate here, RLS in the database). */}
            {SocialView && (
              <Route
                path="/social"
                element={
                  currentUser?.role === "admin" ? (
                    <SocialView />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="text-red-500 font-medium text-lg mb-2">
                        Acceso Restringido
                      </div>
                      <p className="text-gray-500 text-sm">
                        Solo los administradores pueden gestionar redes sociales.
                      </p>
                    </div>
                  )
                }
              />
            )}
            {/* Unmatched paths (incl. deep links to modules this instance
                does not ship) land on the search page instead of a blank. */}
            <Route path="*" element={<Navigate to="/search" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function App() {
  // Optional-module providers wrap only when their module ships; the folded
  // false branch lets the bundler drop the provider with the rest of the
  // module. Finance sits inside History (it stamps the honest rate on every
  // bolivar movement and reads the sales history); Social only needs Auth.
  let content = <AppContent />;
  if (MODULE_REDES) content = <SocialProvider>{content}</SocialProvider>;
  if (MODULE_FINANZAS) content = <FinanceProvider>{content}</FinanceProvider>;

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <HistoryProvider>{content}</HistoryProvider>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
