import { useState } from "react";
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
  Transaction,
  TransactionItem,
} from "../context/history-context";
import { useApp } from "../context/app-context";
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

interface HistoryViewProps {
  onReturnInventory: (itemId: string, quantity: number) => void;
}

export function HistoryView({ onReturnInventory }: HistoryViewProps) {
  const { transactions, returnItem, addImageToTransaction } = useHistory();
  const { formatPrice } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);

  const filteredTransactions = transactions.filter(
    (t) =>
      t.id.includes(searchTerm) ||
      t.items.some((i) =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
  );

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    transactionId: string,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("Imagen muy grande. Máximo 1MB.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      addImageToTransaction(transactionId, reader.result as string);
    };
    reader.readAsDataURL(file);
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
            placeholder="Buscar por ID o producto…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {searchTerm && (
          <p className="text-xs text-gray-500">
            {filteredTransactions.length} resultado
            {filteredTransactions.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ── List ── */}
      {transactions.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No hay transacciones aún</p>
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
                      onClick={() => setSelectedTransaction(t)}
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
                onClick={() => setSelectedTransaction(t)}
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
        onOpenChange={(open) => !open && setSelectedTransaction(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white w-[calc(100vw-2rem)] md:w-full rounded-xl">
          <DialogHeader>
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
            <div className="space-y-6 mt-2">
              {/* Items – responsive table/cards */}
              <div className="border rounded-lg overflow-hidden">
                {/* Desktop table */}
                <table className="hidden md:table w-full">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-medium">
                    <tr>
                      <th className="px-4 py-3 text-left">Producto</th>
                      <th className="px-4 py-3 text-right">Precio</th>
                      <th className="px-4 py-3 text-center">Comprado</th>
                      <th className="px-4 py-3 text-center">Devuelto</th>
                      <th className="px-4 py-3 text-right">Subtotal</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {selectedTransaction.items.map((item) => (
                      <TransactionItemRow
                        key={item.id}
                        item={item}
                        transactionId={selectedTransaction.id}
                        onReturn={(qty) => {
                          returnItem(selectedTransaction.id, item.id, qty);
                          onReturnInventory(item.id, qty);
                        }}
                      />
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 text-sm">
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-2 text-right text-gray-500"
                      >
                        Subtotal:
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatPrice(selectedTransaction.subtotal)}
                      </td>
                      <td />
                    </tr>
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-2 text-right text-gray-500"
                      >
                        Impuestos (10%):
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatPrice(selectedTransaction.tax)}
                      </td>
                      <td />
                    </tr>
                    <tr className="border-t border-gray-200">
                      <td
                        colSpan={4}
                        className="px-4 py-3 text-right font-bold text-gray-900"
                      >
                        Total Pagado:
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[#2196F3]">
                        {formatPrice(selectedTransaction.total)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {/* Mobile item cards */}
                <div className="md:hidden divide-y divide-gray-100">
                  {selectedTransaction.items.map((item) => (
                    <MobileItemCard
                      key={item.id}
                      item={item}
                      transactionId={selectedTransaction.id}
                      onReturn={(qty) => {
                        returnItem(selectedTransaction.id, item.id, qty);
                        onReturnInventory(item.id, qty);
                      }}
                    />
                  ))}
                  {/* Mobile totals */}
                  <div className="p-3 bg-gray-50 space-y-1.5">
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
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                <h3 className="font-medium text-gray-900 flex items-center gap-2 text-sm">
                  <CreditCard className="w-4 h-4 text-[#2196F3]" />
                  Detalles del Pago
                </h3>
                <div className="grid gap-2">
                  {selectedTransaction.payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-sm">
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
                    <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-1">
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
                  <div className="pt-2 border-t border-gray-200">
                    <div className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                      <StickyNote className="w-3 h-3" /> Notas
                    </div>
                    <p className="text-sm text-gray-700 italic bg-white p-2 rounded border border-gray-100">
                      {selectedTransaction.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Images */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900 flex items-center gap-2 text-sm">
                  <ImageIcon className="w-4 h-4 text-[#2196F3]" />
                  Adjuntos (Facturas/Recibos)
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                  {selectedTransaction.images.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200"
                    >
                      <img
                        src={img}
                        alt="Receipt"
                        className="w-full h-full object-cover"
                      />
                    </div>
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
                    <Upload className="w-5 h-5 text-gray-400 mb-1" />
                    <span className="text-[10px] text-gray-500 text-center px-1">
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

// ── Desktop row ────────────────────────────────────────────────────────────────
function TransactionItemRow({
  item,
  onReturn,
}: {
  item: TransactionItem;
  transactionId: string;
  onReturn: (qty: number) => void;
}) {
  const { formatPrice } = useApp();
  const [returnMode, setReturnMode] = useState(false);
  const [returnQty, setReturnQty] = useState(1);
  const available = item.cartQuantity - item.quantityReturned;

  return (
    <tr>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{item.name}</div>
        <div className="text-xs text-gray-400 font-mono">{item.barcode}</div>
      </td>
      <td className="px-4 py-3 text-right text-gray-600">
        {formatPrice(item.sellingPrice)}
      </td>
      <td className="px-4 py-3 text-center">{item.cartQuantity}</td>
      <td className="px-4 py-3 text-center">
        {item.quantityReturned > 0 ? (
          <span className="text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded text-xs">
            -{item.quantityReturned}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-medium">
        {formatPrice(item.sellingPrice * item.cartQuantity)}
      </td>
      <td className="px-4 py-3 text-right">
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
  onReturn,
}: {
  item: TransactionItem;
  transactionId: string;
  onReturn: (qty: number) => void;
}) {
  const { formatPrice } = useApp();
  const [returnMode, setReturnMode] = useState(false);
  const [returnQty, setReturnQty] = useState(1);
  const available = item.cartQuantity - item.quantityReturned;

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
          <p className="text-sm font-semibold text-gray-900">
            {formatPrice(item.sellingPrice * item.cartQuantity)}
          </p>
          <p className="text-xs text-gray-500">
            {formatPrice(item.sellingPrice)} × {item.cartQuantity}
          </p>
        </div>
      </div>

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
