import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
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
  SlidersHorizontal,
} from "lucide-react";
import {
  useHistory,
  TransactionItem,
} from "../context/history-context";
import { useApp, isReferenceLens } from "../context/app-context";
import { useAuth } from "../context/auth-context";
import { MoneyInput } from "./money-input";
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

export function HistoryView() {
  const {
    transactions,
    returnItem,
    addImageToTransaction,
    hasMore,
    loadingMore,
    loadMore,
  } = useHistory();
  const { formatPrice, currency } = useApp();
  const { currentUser } = useAuth();
  // Who the user is. Controls which sales they can see and whether the
  // seller filter is offered.
  const isAdmin = currentUser?.role === "admin";
  // What they may do right now. Editing a past sale's price is admin-only and
  // never through a reference lens, because the amount would be rebooked at a
  // rate we do not consider real. Returns are deliberately NOT covered by
  // this: they change quantities, not prices, so the lens is irrelevant.
  const canEditHistoricalPrice = isAdmin && !isReferenceLens(currency);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
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
  const visibleTransactions = useMemo(
    () =>
      isAdmin
        ? transactions
        : transactions.filter((t) => t.userId === currentUser?.name),
    [isAdmin, transactions, currentUser],
  );

  // Distinct sellers present in the visible set, for the admin seller filter.
  const sellers = useMemo(
    () =>
      Array.from(
        new Set(visibleTransactions.map((t) => t.userId).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [visibleTransactions],
  );

  const term = searchTerm.trim().toLowerCase();
  const userTerm = userFilter.trim().toLowerCase();
  const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
  const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

  const filteredTransactions = useMemo(
    () =>
      visibleTransactions.filter((t) => {
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
      }),
    [visibleTransactions, term, userTerm, fromTime, toTime],
  );

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
      {/* Header / Search */}
      <div className="bg-white rounded-xl border border-border shadow-card p-4 md:p-6 space-y-3">
        <h2 className="text-base md:text-lg font-bold text-foreground flex items-center gap-2">
          <History className="size-5 text-primary" aria-hidden="true" />
          Historial de transacciones
        </h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Buscar transacciones"
              placeholder={
                isAdmin
                  ? "Buscar por ID, producto o vendedor…"
                  : "Buscar por ID o producto…"
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="relative shrink-0 px-4"
          >
            <SlidersHorizontal aria-hidden="true" />
            <span className="hidden sm:inline">Filtros</span>
            {(userFilter || dateFrom || dateTo) && (
              <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-meta font-bold text-white" data-money>
                {(userFilter ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
              </span>
            )}
          </Button>
        </div>

        {/* Filters fold away: seller (admins only) + date range */}
        {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {isAdmin && (
            <div className="relative">
              <User
                className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                list="history-sellers"
                aria-label="Filtrar por vendedor"
                placeholder="Filtrar por vendedor…"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="pl-10 pr-3"
              />
              <datalist id="history-sellers">
                {sellers.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          )}
          <div className="relative">
            <Calendar
              className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              type="date"
              aria-label="Desde"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="pl-10 pr-2"
            />
          </div>
          <div className="relative">
            <Calendar
              className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              type="date"
              aria-label="Hasta"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="pl-10 pr-2"
            />
          </div>
        </div>
        )}

        {hasActiveFilters && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" data-money>
              {filteredTransactions.length} resultado
              {filteredTransactions.length !== 1 ? "s" : ""}
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
            >
              <X className="size-4" aria-hidden="true" />
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* List */}
      {visibleTransactions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-10 md:p-14 text-center shadow-card">
          <Receipt
            className="mx-auto mb-3 size-10 text-muted-foreground/50"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h3 className="text-base font-semibold text-foreground mb-1">
            No hay transacciones aún
          </h3>
          <p className="text-sm text-muted-foreground">
            Las ventas que completes van a aparecer aquí.
          </p>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-10 md:p-14 text-center shadow-card">
          <Search
            className="mx-auto mb-3 size-10 text-muted-foreground/50"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h3 className="text-base font-semibold text-foreground mb-1">
            Ninguna transacción coincide
          </h3>
          <p className="text-sm text-muted-foreground">
            Revisa los filtros o bórralos para ver todo el historial.
          </p>
          <Button variant="soft" size="sm" onClick={clearFilters} className="mt-4">
            Limpiar filtros
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop table - hidden on mobile */}
          <div className="hidden md:block bg-white rounded-xl border border-border overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-canvas border-b border-border">
                  <tr>
                    <th className="text-left px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                      ID transacción
                    </th>
                    <th className="text-left px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                      Fecha
                    </th>
                    <th className="text-left px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                      Vendedor
                    </th>
                    <th className="text-left px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                      Items
                    </th>
                    <th className="text-right px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                      Total
                    </th>
                    <th className="px-6 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTransactions.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-canvas cursor-pointer transition-colors"
                      onClick={() => setSelectedId(t.id)}
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono text-meta text-muted-foreground">
                          #{t.id.slice(-8)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                          data-money
                        >
                          <Calendar className="size-4 text-muted-foreground" aria-hidden="true" />
                          {format(new Date(t.date), "dd MMM yyyy HH:mm", { locale: es })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="size-4 text-muted-foreground" aria-hidden="true" />
                          {t.userId || "Desconocido"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {t.items.length} items{" "}
                        <span className="text-meta text-muted-foreground">
                          ({t.items.reduce((a, i) => a + i.cartQuantity, 0)} u)
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-semibold text-foreground" data-money>
                          {formatPrice(t.total)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ChevronRight className="size-4 text-muted-foreground inline-block" aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card list - visible only on mobile */}
          <div className="md:hidden space-y-2">
            {filteredTransactions.map((t) => (
              <button
                key={t.id}
                type="button"
                className="w-full bg-white rounded-xl border border-border shadow-card p-4 text-left active:bg-secondary transition-colors"
                onClick={() => setSelectedId(t.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* ID + date */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-meta text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-md">
                        #{t.id.slice(-6)}
                      </span>
                      <span className="text-meta text-muted-foreground" data-money>
                        {format(new Date(t.date), "dd/MM/yy HH:mm")}
                      </span>
                    </div>
                    {/* Seller */}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                      <User className="size-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {t.userId || "Desconocido"}
                      </span>
                    </div>
                    {/* Items summary */}
                    <p className="text-meta text-muted-foreground">
                      {t.items.length} producto{t.items.length !== 1 ? "s" : ""}{" "}
                      · {t.items.reduce((a, i) => a + i.cartQuantity, 0)} u
                    </p>
                    {/* First items preview */}
                    <p className="text-meta text-muted-foreground truncate mt-0.5">
                      {t.items
                        .slice(0, 2)
                        .map((i) => i.name)
                        .join(", ")}
                      {t.items.length > 2 ? ` +${t.items.length - 2}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 gap-1">
                    <span className="text-sm font-semibold text-foreground" data-money>
                      {formatPrice(t.total)}
                    </span>
                    <ChevronRight className="size-4 text-border-strong" aria-hidden="true" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Only the most recent sales are loaded; older ones on request. */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Cargando..." : "Cargar transacciones anteriores"}
          </Button>
        </div>
      )}

      {/* Transaction detail dialog */}
      <Dialog
        open={!!selectedTransaction}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-4 md:p-5">
          <DialogHeader className="gap-1">
            <DialogTitle>Detalles de la transacción</DialogTitle>
            <DialogDescription>
              <span data-money>ID: #{selectedTransaction?.id}</span> ·{" "}
              {selectedTransaction &&
                format(new Date(selectedTransaction.date), "PPP p", { locale: es })}
            </DialogDescription>
          </DialogHeader>

          {selectedTransaction && (
            <div className="space-y-2 mt-1 min-h-0 flex-1 overflow-y-auto pr-1">
              {/* Items - responsive table/cards */}
              <div className="border border-border rounded-xl overflow-x-auto md:overflow-x-visible">
                {/* Desktop table.
                    table-fixed is the point: column widths come from the
                    colgroup below rather than from content, so nothing inside
                    a cell can push the table wider than the dialog. Anything
                    too long clips instead of producing a scrollbar. */}
                <table className="hidden md:table w-full table-fixed text-sm">
                  {/* Proportional, not pixel, widths: under table-fixed these
                      resolve against the table's own width, so the columns can
                      never add up to more than the dialog. */}
                  <colgroup>
                    <col className="w-[29%]" />
                    <col className="w-[20%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[13%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead className="bg-canvas text-meta uppercase text-muted-foreground font-semibold">
                    <tr>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                      <th className="px-3 py-2 text-center">Comprado</th>
                      <th className="px-3 py-2 text-center">Devuelto</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm">
                    {selectedTransaction.items.map((item) => (
                      <TransactionItemRow
                        key={item.id}
                        item={item}
                        transactionId={selectedTransaction.id}
                        canEditPrice={canEditHistoricalPrice}
                        onReturn={(qty) => {
                          returnItem(selectedTransaction.id, item.id, qty);
                        }}
                      />
                    ))}
                  </tbody>
                  <tfoot className="bg-canvas text-sm">
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-1.5 text-right text-muted-foreground"
                      >
                        Subtotal:
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold text-foreground" data-money>
                        {formatPrice(selectedTransaction.subtotal)}
                      </td>
                      <td />
                    </tr>
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-1.5 text-right text-muted-foreground"
                      >
                        Impuestos (10%):
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold text-foreground" data-money>
                        {formatPrice(selectedTransaction.tax)}
                      </td>
                      <td />
                    </tr>
                    <tr className="border-t border-border">
                      <td
                        colSpan={4}
                        className="px-3 py-2 text-right text-base font-bold text-foreground"
                      >
                        Total pagado:
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-base font-bold text-foreground" data-money>
                          {formatPrice(selectedTransaction.total)}
                        </span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {/* Mobile item cards */}
                <div className="md:hidden divide-y divide-border">
                  {selectedTransaction.items.map((item) => (
                    <MobileItemCard
                      key={item.id}
                      item={item}
                      transactionId={selectedTransaction.id}
                      canEditPrice={canEditHistoricalPrice}
                      onReturn={(qty) => {
                        returnItem(selectedTransaction.id, item.id, qty);
                      }}
                    />
                  ))}
                  {/* Mobile totals */}
                  <div className="p-3 bg-canvas space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Subtotal</span>
                      <span data-money>{formatPrice(selectedTransaction.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Impuestos (10%)</span>
                      <span data-money>{formatPrice(selectedTransaction.tax)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-foreground pt-1.5 border-t border-border">
                      <span>Total pagado</span>
                      <span data-money>{formatPrice(selectedTransaction.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment details */}
              <div className="bg-canvas p-3 rounded-xl border border-border space-y-1.5">
                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                  <CreditCard className="size-4 text-primary" aria-hidden="true" />
                  Detalles del pago
                </h3>
                <div className="grid gap-1">
                  {selectedTransaction.payments.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      Sin detalles de pago registrados
                    </p>
                  )}
                  {selectedTransaction.payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{p.method}</span>
                      <span className="font-semibold text-foreground" data-money>
                        {formatPrice(p.amount)}
                      </span>
                    </div>
                  ))}
                  {selectedTransaction.total <
                    selectedTransaction.payments.reduce(
                      (s, p) => s + p.amount,
                      0,
                    ) && (
                    <div className="flex justify-between text-sm border-t border-border pt-1.5 mt-0.5">
                      <span className="text-muted-foreground">Cambio entregado</span>
                      <span className="font-semibold text-destructive" data-money>
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
                  <div className="pt-1.5 border-t border-border">
                    <div className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                      <StickyNote className="size-4" aria-hidden="true" /> Notas
                    </div>
                    <p className="text-sm text-foreground italic bg-white p-2.5 rounded-lg border border-border">
                      {selectedTransaction.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Images */}
              <div className="space-y-1.5">
                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                  <ImageIcon className="size-4 text-primary" aria-hidden="true" />
                  Adjuntos (facturas/recibos)
                </h3>
                <div className="grid grid-cols-5 md:grid-cols-12 gap-2">
                  {selectedTransaction.images.map((img, idx) => (
                    <a
                      key={idx}
                      href={img}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative aspect-square bg-secondary rounded-lg overflow-hidden border border-border"
                    >
                      <img
                        src={img}
                        alt={`Comprobante ${idx + 1} de la transacción`}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                  <div className="aspect-square bg-canvas rounded-lg border-2 border-dashed border-border-strong flex flex-col items-center justify-center cursor-pointer hover:bg-secondary transition-colors relative">
                    <input
                      type="file"
                      accept="image/*"
                      aria-label="Subir comprobante"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) =>
                        handleFileUpload(e, selectedTransaction.id)
                      }
                    />
                    <Upload className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-meta text-muted-foreground text-center px-1">
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

// Inline editable unit price for a history line - admins only. Shows the price
// in the active display currency and commits (converted to USD) on blur/Enter,
// which recomputes the transaction total and all reports.
function EditableHistoryPrice({
  item,
  transactionId,
  compact,
}: {
  item: TransactionItem;
  transactionId: string;
  // The desktop table is tight on width; the full-height control pushed the
  // return button out of the row.
  compact?: boolean;
}) {
  const { updateTransactionItemPrice } = useHistory();
  return (
    <MoneyInput
      label={`Precio de venta de ${item.name}`}
      valueUsd={item.sellingPrice}
      onCommitUsd={(usd) =>
        updateTransactionItemPrice(transactionId, item.id, usd)
      }
      compact={compact}
      className={compact ? "w-full ml-auto" : "w-44 ml-auto"}
    />
  );
}

// Desktop row
function TransactionItemRow({
  item,
  transactionId,
  canEditPrice,
  onReturn,
}: {
  item: TransactionItem;
  transactionId: string;
  canEditPrice: boolean;
  onReturn: (qty: number) => void;
}) {
  const { formatPrice } = useApp();
  const [returnMode, setReturnMode] = useState(false);
  const [returnQty, setReturnQty] = useState(1);
  const available = item.cartQuantity - item.quantityReturned;
  const netQty = item.cartQuantity - item.quantityReturned;
  const wasReturned = item.quantityReturned > 0;

  return (
    <tr className={wasReturned ? "bg-destructive-soft/60" : undefined}>
      <td className="px-3 py-2">
        <div className="font-semibold text-foreground truncate" title={item.name}>
          {item.name}
        </div>
        <div className="text-meta text-muted-foreground font-mono truncate">
          {item.barcode}
        </div>
      </td>
      <td className="px-3 py-2 text-right text-muted-foreground">
        {canEditPrice ? (
          <EditableHistoryPrice
            item={item}
            transactionId={transactionId}
            compact
          />
        ) : (
          <span data-money>{formatPrice(item.sellingPrice)}</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">{item.cartQuantity}</td>
      <td className="px-3 py-2 text-center">
        {wasReturned ? (
          <span
            className="text-destructive-soft-foreground font-semibold bg-destructive-soft px-2 py-0.5 rounded-md text-meta"
            data-money
          >
            -{item.quantityReturned}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-semibold">
        {wasReturned ? (
          <div className="flex flex-col items-end" data-money>
            <span className="text-meta text-muted-foreground line-through">
              {formatPrice(item.sellingPrice * item.cartQuantity)}
            </span>
            <span className="text-foreground">{formatPrice(item.sellingPrice * netQty)}</span>
          </div>
        ) : (
          <span className="text-foreground" data-money>
            {formatPrice(item.sellingPrice * item.cartQuantity)}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {available > 0 &&
          (!returnMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReturnMode(true)}
              aria-label={`Devolver ${item.name}`}
            >
              <CornerUpLeft aria-hidden="true" /> Devolver
            </Button>
          ) : (
            <div className="flex items-center justify-end gap-1 bg-canvas p-1 rounded-lg border border-border">
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
                aria-label={`Cantidad a devolver de ${item.name}`}
                className="h-10 w-14 px-1 text-center text-sm"
              />
              <Button
                size="sm"
                variant="destructive"
                aria-label={`Confirmar devolución de ${item.name}`}
                onClick={() => {
                  onReturn(returnQty);
                  toast.success(`Devuelto ${returnQty} de ${item.name}`);
                  setReturnMode(false);
                  setReturnQty(1);
                }}
              >
                Confirmar
              </Button>
              <button
                type="button"
                onClick={() => setReturnMode(false)}
                aria-label="Cancelar devolución"
                className="tap-target inline-flex items-center justify-center h-9 w-9 hover:bg-secondary rounded-md"
              >
                <X className="size-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </div>
          ))}
      </td>
    </tr>
  );
}

// Mobile card
function MobileItemCard({
  item,
  transactionId,
  canEditPrice,
  onReturn,
}: {
  item: TransactionItem;
  transactionId: string;
  canEditPrice: boolean;
  onReturn: (qty: number) => void;
}) {
  const { formatPrice } = useApp();
  const [returnMode, setReturnMode] = useState(false);
  const [returnQty, setReturnQty] = useState(1);
  const available = item.cartQuantity - item.quantityReturned;
  const netQty = item.cartQuantity - item.quantityReturned;
  const wasReturned = item.quantityReturned > 0;

  return (
    <div className={`p-3 ${wasReturned ? "bg-destructive-soft/60" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {item.name}
          </p>
          <p className="text-meta font-mono text-muted-foreground">{item.barcode}</p>
        </div>
        <div className="text-right flex-shrink-0" data-money>
          {wasReturned ? (
            <p className="text-sm font-semibold text-foreground">
              <span className="text-meta text-muted-foreground line-through mr-1">
                {formatPrice(item.sellingPrice * item.cartQuantity)}
              </span>
              {formatPrice(item.sellingPrice * netQty)}
            </p>
          ) : (
            <p className="text-sm font-semibold text-foreground">
              {formatPrice(item.sellingPrice * item.cartQuantity)}
            </p>
          )}
          <p className="text-meta text-muted-foreground">
            {formatPrice(item.sellingPrice)} × {item.cartQuantity}
          </p>
        </div>
      </div>

      {canEditPrice && (
        <div className="flex items-center justify-end gap-2 mb-2">
          <span className="text-meta text-muted-foreground">Precio:</span>
          <EditableHistoryPrice item={item} transactionId={transactionId} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2 text-sm text-muted-foreground">
          <span>
            Comprado: <b>{item.cartQuantity}</b>
          </span>
          {wasReturned && (
            <span className="text-destructive font-semibold">Dev: -{item.quantityReturned}</span>
          )}
        </div>
        {available > 0 && (
          <>
            {!returnMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReturnMode(true)}
                aria-label={`Devolver ${item.name}`}
              >
                <CornerUpLeft aria-hidden="true" /> Devolver
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
                  aria-label={`Cantidad a devolver de ${item.name}`}
                  className="h-10 w-14 text-center px-1 text-sm"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  aria-label={`Confirmar devolución de ${item.name}`}
                  onClick={() => {
                    onReturn(returnQty);
                    toast.success(`Devuelto ${returnQty} de ${item.name}`);
                    setReturnMode(false);
                    setReturnQty(1);
                  }}
                >
                  Confirmar
                </Button>
                <button
                  type="button"
                  onClick={() => setReturnMode(false)}
                  aria-label="Cancelar devolución"
                  className="tap-target inline-flex items-center justify-center h-9 w-9 hover:bg-secondary rounded-md"
                >
                  <X className="size-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
