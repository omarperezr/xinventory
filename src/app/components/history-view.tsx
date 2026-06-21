import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  History,
  Search,
  Receipt,
  Calendar,
  ChevronRight,
  Upload,
  CornerUpLeft,
  Image as ImageIcon,
  X,
  CreditCard,
  StickyNote,
  User,
  ChevronDown,
} from "lucide-react";
import {
  useHistory,
  TransactionItem,
} from "../context/history-context";
import { useApp } from "../context/app-context";
import { useAuth } from "../context/auth-context";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { toast } from "sonner";
import { uploadImage } from "../services/image-utils";

interface HistoryViewProps {
  onReturnInventory: (itemId: string, quantity: number) => void;
}

export function HistoryView({ onReturnInventory }: HistoryViewProps) {
  const { transactions, returnItem, updateTransactionItemPrice, addImageToTransaction } =
    useHistory();
  const { formatPrice } = useApp();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const [searchTerm, setSearchTerm] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Derive the open transaction from the live list so returns and price edits
  // reflect immediately in the dialog instead of showing a stale snapshot.
  const selectedTransaction =
    transactions.find((t) => t.id === selectedId) ?? null;

  // Sellers may only see their own sales; admins see everyone's. Transactions
  // record the seller by name (see App.handleCheckout), so we match on that.
  const visibleTransactions = isAdmin
    ? transactions
    : transactions.filter((t) => t.userId === currentUser?.name);

  // Distinct sellers present in the visible set, for the admin seller filter.
  const sellers = Array.from(
    new Set(visibleTransactions.map((t) => t.userId).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const term = searchTerm.trim().toLowerCase();
  const userTerm = userFilter.trim().toLowerCase();
  const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
  const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

  const filteredTransactions = visibleTransactions.filter((t) => {
    if (term) {
      const matches =
        t.id.toLowerCase().includes(term) ||
        (t.userId || "").toLowerCase().includes(term) ||
        t.items.some((i) => i.name.toLowerCase().includes(term));
      if (!matches) return false;
    }
    if (userTerm && !(t.userId || "").toLowerCase().includes(userTerm))
      return false;
    const time = new Date(t.date).getTime();
    if (fromTime !== null && time < fromTime) return false;
    if (toTime !== null && time > toTime) return false;
    return true;
  });

  const hasActiveFilters =
    !!term || !!userTerm || !!dateFrom || !!dateTo;

  const clearFilters = () => {
    setSearchTerm("");
    setUserFilter("");
    setDateFrom("");
    setDateTo("");
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    transactionId: string,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      addImageToTransaction(transactionId, url);
    } catch (err) {
      console.error(err);
      toast.error("Error al subir imagen");
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-6">
      {/* ── Header / Search ── */}
      <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <h2 className="text-base md:text-lg font-medium text-gray-900 flex items-center gap-2">
          <History className="w-5 h-5 text-[#2196F3]" />
          Historial de Transacciones
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={
              isAdmin
                ? "Buscar por ID, producto o vendedor…"
                : "Buscar por ID o producto…"
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Filters: seller (admins only) + date range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {isAdmin && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                list="history-sellers"
                placeholder="Filtrar por vendedor…"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#2196F3]/30"
              />
              <datalist id="history-sellers">
                {sellers.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          )}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="date"
              aria-label="Desde"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full h-9 pl-9 pr-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#2196F3]/30"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="date"
              aria-label="Hasta"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full h-9 pl-9 pr-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#2196F3]/30"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {filteredTransactions.length} resultado
              {filteredTransactions.length !== 1 ? "s" : ""}
            </p>
            <button
              onClick={clearFilters}
              className="text-xs text-[#2196F3] hover:underline flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* ── List ── */}
      {visibleTransactions.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No hay transacciones aún</p>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            Ninguna transacción coincide con los filtros
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table – hidden on mobile */}
          <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                      ID Transacción
                    </th>
                    <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                      Fecha
                    </th>
                    <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                      Vendedor
                    </th>
                    <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                      Items
                    </th>
                    <th className="text-right px-6 py-4 text-sm text-gray-600 font-normal">
                      Total
                    </th>
                    <th className="px-6 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredTransactions.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedId(t.id)}
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-gray-500">
                          #{t.id.slice(-8)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-900">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {format(new Date(t.date), "MMM dd, yyyy HH:mm")}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <User className="w-3 h-3 text-gray-400" />
                          {t.userId || "Desconocido"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {t.items.length} items{" "}
                        <span className="text-xs text-gray-400">
                          ({t.items.reduce((a, i) => a + i.cartQuantity, 0)} u)
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-[#1A1A1A]">
                        {formatPrice(t.total)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ChevronRight className="w-4 h-4 text-gray-400 inline-block" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card list – visible only on mobile */}
          <div className="md:hidden space-y-2">
            {filteredTransactions.map((t) => (
              <button
                key={t.id}
                className="w-full bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-left active:bg-gray-50 transition-colors"
                onClick={() => setSelectedId(t.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* ID + date */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        #{t.id.slice(-6)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(t.date), "dd/MM/yy HH:mm")}
                      </span>
                    </div>
                    {/* Seller */}
                    <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                      <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="truncate">
                        {t.userId || "Desconocido"}
                      </span>
                    </div>
                    {/* Items summary */}
                    <p className="text-xs text-gray-500">
                      {t.items.length} producto{t.items.length !== 1 ? "s" : ""}{" "}
                      · {t.items.reduce((a, i) => a + i.cartQuantity, 0)} u
                    </p>
                    {/* First items preview */}
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {t.items
                        .slice(0, 2)
                        .map((i) => i.name)
                        .join(", ")}
                      {t.items.length > 2 ? ` +${t.items.length - 2}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 gap-1">
                    <span className="text-base font-bold text-[#2196F3]">
                      {formatPrice(t.total)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Transaction detail dialog ── */}
      <Dialog
        open={!!selectedTransaction}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden bg-white w-[calc(100vw-2rem)] md:w-full rounded-xl flex flex-col p-4 md:p-5">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-sm md:text-base">
              Detalles de Transacción
            </DialogTitle>
            <DialogDescription className="text-xs md:text-sm">
              ID: #{selectedTransaction?.id} ·{" "}
              {selectedTransaction &&
                format(new Date(selectedTransaction.date), "PPP p")}
            </DialogDescription>
          </DialogHeader>

          {selectedTransaction && (
            <div className="space-y-3 mt-1 min-h-0 flex-1 overflow-y-auto pr-1">
              {/* Items – responsive table/cards */}
              <div className="border rounded-lg overflow-hidden">
                {/* Desktop table */}
                <table className="hidden md:table w-full text-xs">
                  <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 font-medium">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Producto</th>
                      <th className="px-3 py-1.5 text-right">Precio</th>
                      <th className="px-3 py-1.5 text-center">Comprado</th>
                      <th className="px-3 py-1.5 text-center">Devuelto</th>
                      <th className="px-3 py-1.5 text-right">Subtotal</th>
                      <th className="px-3 py-1.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {selectedTransaction.items.map((item) => (
                      <TransactionItemRow
                        key={item.id}
                        item={item}
                        transactionId={selectedTransaction.id}
                        isAdmin={isAdmin}
                        onReturn={(qty) => {
                          returnItem(selectedTransaction.id, item.id, qty);
                          onReturnInventory(item.id, qty);
                        }}
                      />
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 text-xs">
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-1 text-right text-gray-500"
                      >
                        Subtotal:
                      </td>
                      <td className="px-3 py-1 text-right font-medium">
                        {formatPrice(selectedTransaction.subtotal)}
                      </td>
                      <td />
                    </tr>
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-1 text-right text-gray-500"
                      >
                        Impuestos (10%):
                      </td>
                      <td className="px-3 py-1 text-right font-medium">
                        {formatPrice(selectedTransaction.tax)}
                      </td>
                      <td />
                    </tr>
                    <tr className="border-t border-gray-200">
                      <td
                        colSpan={4}
                        className="px-3 py-1.5 text-right font-bold text-gray-900"
                      >
                        Total Pagado:
                      </td>
                      <td className="px-3 py-1.5 text-right font-bold text-[#2196F3]">
                        {formatPrice(selectedTransaction.total)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {/* Mobile item cards */}
                <div className="md:hidden divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {selectedTransaction.items.map((item) => (
                    <MobileItemCard
                      key={item.id}
                      item={item}
                      transactionId={selectedTransaction.id}
                      isAdmin={isAdmin}
                      onReturn={(qty) => {
                        returnItem(selectedTransaction.id, item.id, qty);
                        onReturnInventory(item.id, qty);
                      }}
                    />
                  ))}
                  {/* Mobile totals */}
                  <div className="p-2.5 bg-gray-50 space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Subtotal</span>
                      <span>{formatPrice(selectedTransaction.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Impuestos (10%)</span>
                      <span>{formatPrice(selectedTransaction.tax)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-[#2196F3] pt-1 border-t border-gray-200">
                      <span>Total Pagado</span>
                      <span>{formatPrice(selectedTransaction.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment details */}
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                <h3 className="font-medium text-gray-900 flex items-center gap-2 text-xs">
                  <CreditCard className="w-3.5 h-3.5 text-[#2196F3]" />
                  Detalles del Pago
                </h3>
                <div className="grid gap-1">
                  {selectedTransaction.payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-600">{p.method}</span>
                      <span className="font-medium">
                        {formatPrice(p.amount)}
                      </span>
                    </div>
                  ))}
                  {selectedTransaction.total <
                    selectedTransaction.payments.reduce(
                      (s, p) => s + p.amount,
                      0,
                    ) && (
                    <div className="flex justify-between text-xs border-t border-gray-200 pt-1.5 mt-0.5">
                      <span className="text-gray-600">Cambio Entregado</span>
                      <span className="font-medium text-red-600">
                        -
                        {formatPrice(
                          selectedTransaction.payments.reduce(
                            (s, p) => s + p.amount,
                            0,
                          ) - selectedTransaction.total,
                        )}
                      </span>
                    </div>
                  )}
                </div>
                {selectedTransaction.notes && (
                  <div className="pt-1.5 border-t border-gray-200">
                    <div className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                      <StickyNote className="w-3 h-3" /> Notas
                    </div>
                    <p className="text-xs text-gray-700 italic bg-white p-2 rounded border border-gray-100">
                      {selectedTransaction.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Images */}
              <div className="space-y-2">
                <h3 className="font-medium text-gray-900 flex items-center gap-2 text-xs">
                  <ImageIcon className="w-3.5 h-3.5 text-[#2196F3]" />
                  Adjuntos (Facturas/Recibos)
                </h3>
                <div className="grid grid-cols-5 md:grid-cols-8 gap-2">
                  {selectedTransaction.images.map((img, idx) => (
                    <a
                      key={idx}
                      href={img}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200"
                    >
                      <img
                        src={img}
                        alt="Receipt"
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                  <div className="aspect-square bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors relative">
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) =>
                        handleFileUpload(e, selectedTransaction.id)
                      }
                    />
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-[9px] text-gray-500 text-center px-1">
                      Subir
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Inline editable unit price for a history line — admins only. Shows the price
// in the active display currency and commits (converted to USD) on blur/Enter,
// which recomputes the transaction total and all reports.
function EditableHistoryPrice({
  item,
  transactionId,
}: {
  item: TransactionItem;
  transactionId: string;
}) {
  const { convertPrice, convertToUsd, currency } = useApp();
  const { updateTransactionItemPrice } = useHistory();
  const symbol = currency === "BS" ? "Bs" : currency === "USD" ? "$" : "€";
  const [value, setValue] = useState(convertPrice(item.sellingPrice).toFixed(2));

  useEffect(() => {
    setValue(convertPrice(item.sellingPrice).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.sellingPrice, currency]);

  const commit = () => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) {
      setValue(convertPrice(item.sellingPrice).toFixed(2));
      return;
    }
    const usd = convertToUsd(parsed);
    if (Math.abs(usd - item.sellingPrice) < 0.0001) return;
    updateTransactionItemPrice(transactionId, item.id, usd);
  };

  return (
    <div className="relative w-24 ml-auto">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
        {symbol}
      </span>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-8 pl-7 pr-1 text-sm text-right"
        title="Editar precio de venta"
      />
    </div>
  );
}

// ── Desktop row ────────────────────────────────────────────────────────────────
function TransactionItemRow({
  item,
  transactionId,
  isAdmin,
  onReturn,
}: {
  item: TransactionItem;
  transactionId: string;
  isAdmin: boolean;
  onReturn: (qty: number) => void;
}) {
  const { formatPrice } = useApp();
  const [returnMode, setReturnMode] = useState(false);
  const [returnQty, setReturnQty] = useState(1);
  const available = item.cartQuantity - item.quantityReturned;
  const netQty = item.cartQuantity - item.quantityReturned;

  return (
    <tr>
      <td className="px-3 py-1.5">
        <div className="font-medium text-gray-900">{item.name}</div>
        <div className="text-[10px] text-gray-400 font-mono">{item.barcode}</div>
      </td>
      <td className="px-3 py-1.5 text-right text-gray-600">
        {isAdmin ? (
          <EditableHistoryPrice item={item} transactionId={transactionId} />
        ) : (
          formatPrice(item.sellingPrice)
        )}
      </td>
      <td className="px-3 py-1.5 text-center">{item.cartQuantity}</td>
      <td className="px-3 py-1.5 text-center">
        {item.quantityReturned > 0 ? (
          <span className="text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded text-[10px]">
            -{item.quantityReturned}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right font-medium">
        {item.quantityReturned > 0 ? (
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-400 line-through">
              {formatPrice(item.sellingPrice * item.cartQuantity)}
            </span>
            <span>{formatPrice(item.sellingPrice * netQty)}</span>
          </div>
        ) : (
          formatPrice(item.sellingPrice * item.cartQuantity)
        )}
      </td>
      <td className="px-3 py-1.5 text-right">
        {available > 0 &&
          (!returnMode ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setReturnMode(true)}
            >
              <CornerUpLeft className="w-3 h-3 mr-1" /> Devolver
            </Button>
          ) : (
            <div className="flex items-center justify-end gap-1.5 bg-gray-50 p-1 rounded border border-gray-200">
              <Input
                type="number"
                min="1"
                max={available}
                value={returnQty}
                onChange={(e) =>
                  setReturnQty(
                    Math.min(
                      available,
                      Math.max(1, parseInt(e.target.value) || 1),
                    ),
                  )
                }
                className="w-12 h-7 text-xs px-1 text-center"
              />
              <Button
                size="sm"
                className="h-7 px-2 text-xs bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  onReturn(returnQty);
                  toast.success(`Devuelto ${returnQty} de ${item.name}`);
                  setReturnMode(false);
                  setReturnQty(1);
                }}
              >
                OK
              </Button>
              <button
                onClick={() => setReturnMode(false)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <X className="w-3 h-3 text-gray-500" />
              </button>
            </div>
          ))}
      </td>
    </tr>
  );
}

// ── Mobile card ────────────────────────────────────────────────────────────────
function MobileItemCard({
  item,
  transactionId,
  isAdmin,
  onReturn,
}: {
  item: TransactionItem;
  transactionId: string;
  isAdmin: boolean;
  onReturn: (qty: number) => void;
}) {
  const { formatPrice } = useApp();
  const [returnMode, setReturnMode] = useState(false);
  const [returnQty, setReturnQty] = useState(1);
  const available = item.cartQuantity - item.quantityReturned;
  const netQty = item.cartQuantity - item.quantityReturned;

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {item.name}
          </p>
          <p className="text-[10px] font-mono text-gray-400">{item.barcode}</p>
        </div>
        <div className="text-right flex-shrink-0">
          {item.quantityReturned > 0 ? (
            <p className="text-sm font-semibold text-gray-900">
              <span className="text-xs text-gray-400 line-through mr-1">
                {formatPrice(item.sellingPrice * item.cartQuantity)}
              </span>
              {formatPrice(item.sellingPrice * netQty)}
            </p>
          ) : (
            <p className="text-sm font-semibold text-gray-900">
              {formatPrice(item.sellingPrice * item.cartQuantity)}
            </p>
          )}
          <p className="text-xs text-gray-500">
            {formatPrice(item.sellingPrice)} × {item.cartQuantity}
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-end gap-2 mb-2">
          <span className="text-[10px] text-gray-400">Precio:</span>
          <EditableHistoryPrice item={item} transactionId={transactionId} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2 text-xs text-gray-500">
          <span>
            Comprado: <b>{item.cartQuantity}</b>
          </span>
          {item.quantityReturned > 0 && (
            <span className="text-red-600">Dev: -{item.quantityReturned}</span>
          )}
        </div>
        {available > 0 && (
          <>
            {!returnMode ? (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => setReturnMode(true)}
              >
                <CornerUpLeft className="w-3 h-3 mr-1" /> Devolver
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min="1"
                  max={available}
                  value={returnQty}
                  onChange={(e) =>
                    setReturnQty(
                      Math.min(
                        available,
                        Math.max(1, parseInt(e.target.value) || 1),
                      ),
                    )
                  }
                  className="w-12 h-6 text-xs text-center px-1"
                />
                <Button
                  size="sm"
                  className="h-6 px-2 text-[10px] bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => {
                    onReturn(returnQty);
                    toast.success(`Devuelto ${returnQty} de ${item.name}`);
                    setReturnMode(false);
                    setReturnQty(1);
                  }}
                >
                  OK
                </Button>
                <button onClick={() => setReturnMode(false)}>
                  <X className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
