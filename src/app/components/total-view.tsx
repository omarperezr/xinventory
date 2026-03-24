import { useState } from "react";
import {
  Trash2,
  Search,
  Save,
  RotateCcw,
  ShoppingCart,
  Minus,
  Plus,
  X,
  CreditCard,
  Banknote,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { useApp, CartItem } from "../context/app-context";

const PAYMENT_METHODS = [
  "Efectivo",
  "Tarjeta de Crédito",
  "Tarjeta de Débito",
  "Transferencia",
  "Pago Móvil",
  "PayPal",
  "Zelle",
  "Divisas",
  "Otro",
];

interface TotalViewProps {
  onCheckout?: (items: CartItem[]) => void;
}

export function TotalView({ onCheckout }: TotalViewProps) {
  const {
    cartItems,
    savedCarts,
    updateCartItemQuantity,
    removeFromCart,
    toggleCartItemDiscount,
    clearCart,
    saveCart,
    loadCart,
    deleteSavedCart,
    subtotal,
    taxAmount,
    totalAmount,
    formatPrice,
    currentPayments,
    transactionNotes,
    addPayment,
    setTransactionNotes,
    clearPayments,
    amountPaid,
    remainingDue,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState("");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("Efectivo");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [changeAmount, setChangeAmount] = useState(0);

  const filteredItems = cartItems.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.barcode.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleAddPayment = () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Por favor ingrese un monto válido");
      return;
    }
    addPayment(selectedMethod, amount);
    setPaymentAmount("");
    const newPaid = amountPaid + amount;
    const remaining = totalAmount - newPaid;
    if (remaining <= 0.01) {
      setIsPaymentModalOpen(false);
      if (remaining < -0.01) {
        setChangeAmount(Math.abs(remaining));
        setIsChangeModalOpen(true);
      } else {
        handleCompleteTransaction();
      }
    } else {
      toast.success(
        `Pago de ${formatPrice(amount)} agregado. Restante: ${formatPrice(remaining)}`,
      );
    }
  };

  const handleCompleteTransaction = () => {
    if (onCheckout) onCheckout(cartItems);
    clearPayments();
    clearCart();
    setIsChangeModalOpen(false);
    setIsPaymentModalOpen(false);
  };

  const isOverpaid = remainingDue < -0.01;

  return (
    <div className="space-y-4 md:space-y-6 pb-24 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
        {/* ── Main cart ── */}
        <div className="flex-1 space-y-4">
          {/* Header */}
          <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm md:text-lg font-medium text-gray-900 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 md:w-5 md:h-5 text-[#2196F3]" />
                Lista Actual
                {cartItems.length > 0 && (
                  <span className="text-xs bg-[#2196F3] text-white rounded-full px-2 py-0.5">
                    {cartItems.length}
                  </span>
                )}
              </h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={clearCart}
                  disabled={cartItems.length === 0}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2 md:px-3 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5 md:mr-1.5" />
                  <span className="hidden md:inline">Limpiar</span>
                </Button>
                <Button
                  onClick={saveCart}
                  disabled={cartItems.length === 0}
                  className="bg-[#2196F3] hover:bg-[#1976D2] text-white h-8 px-2 md:px-3 text-xs"
                >
                  <Save className="w-3.5 h-3.5 md:mr-1.5" />
                  <span className="hidden md:inline">Guardar</span>
                </Button>
              </div>
            </div>
            {cartItems.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Buscar en la lista…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            )}
          </div>

          {/* Cart items */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            {cartItems.length === 0 ? (
              <div className="p-10 text-center">
                <ShoppingCart className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Tu lista está vacía</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                          Producto
                        </th>
                        <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                          Precio Unit.
                        </th>
                        <th className="text-center px-6 py-4 text-sm text-gray-600 font-normal">
                          Cantidad
                        </th>
                        <th className="text-right px-6 py-4 text-sm text-gray-600 font-normal">
                          Subtotal
                        </th>
                        <th className="px-6 py-4" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredItems.map((item) => {
                        const finalPrice =
                          item.applyDiscount && item.discount > 0
                            ? item.sellingPrice * (1 - item.discount / 100)
                            : item.sellingPrice;
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <div className="font-medium text-[#1A1A1A]">
                                {item.name}
                              </div>
                              <div className="text-xs text-gray-500 font-mono">
                                {item.barcode}
                              </div>
                              {item.includesTaxes && (
                                <div className="text-[10px] text-blue-600 bg-blue-50 inline-block px-1 rounded mt-0.5">
                                  Con Impuestos
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              <div className="flex flex-col">
                                <span>{formatPrice(item.sellingPrice)}</span>
                                {item.discount > 0 && (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <Checkbox
                                      id={`d-${item.id}`}
                                      checked={item.applyDiscount}
                                      onCheckedChange={(c) =>
                                        toggleCartItemDiscount(
                                          item.id,
                                          c as boolean,
                                        )
                                      }
                                      className="h-3 w-3"
                                    />
                                    <Label
                                      htmlFor={`d-${item.id}`}
                                      className="text-xs text-green-600 cursor-pointer font-medium"
                                    >
                                      -{item.discount}%
                                    </Label>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() =>
                                    updateCartItemQuantity(
                                      item.id,
                                      item.cartQuantity - 1,
                                    )
                                  }
                                  className="p-1 rounded hover:bg-gray-200 text-gray-600"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.cartQuantity}
                                  onChange={(e) =>
                                    updateCartItemQuantity(
                                      item.id,
                                      parseInt(e.target.value) || 0,
                                    )
                                  }
                                  className="w-16 text-center h-8"
                                />
                                <button
                                  onClick={() =>
                                    updateCartItemQuantity(
                                      item.id,
                                      item.cartQuantity + 1,
                                    )
                                  }
                                  className="p-1 rounded hover:bg-gray-200 text-gray-600"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-[#1A1A1A]">
                              {item.applyDiscount && item.discount > 0 ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-xs text-gray-400 line-through">
                                    {formatPrice(
                                      item.sellingPrice * item.cartQuantity,
                                    )}
                                  </span>
                                  <span className="text-green-600">
                                    {formatPrice(
                                      finalPrice * item.cartQuantity,
                                    )}
                                  </span>
                                </div>
                              ) : (
                                formatPrice(finalPrice * item.cartQuantity)
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-2 text-right text-sm text-gray-500"
                        >
                          Subtotal:
                        </td>
                        <td className="px-6 py-2 text-right text-sm font-medium">
                          {formatPrice(subtotal)}
                        </td>
                        <td />
                      </tr>
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-2 text-right text-sm text-gray-500"
                        >
                          Impuestos (10%):
                        </td>
                        <td className="px-6 py-2 text-right text-sm font-medium">
                          {formatPrice(taxAmount)}
                        </td>
                        <td />
                      </tr>
                      {currentPayments.map((p, i) => (
                        <tr key={i} className="text-green-600">
                          <td
                            colSpan={3}
                            className="px-6 py-2 text-right text-sm"
                          >
                            Pagado ({p.method}):
                          </td>
                          <td className="px-6 py-2 text-right text-sm font-medium">
                            -{formatPrice(p.amount)}
                          </td>
                          <td />
                        </tr>
                      ))}
                      <tr className={isOverpaid ? "bg-red-50" : "bg-gray-100"}>
                        <td
                          colSpan={3}
                          className="px-6 py-4 text-right font-bold text-gray-700"
                        >
                          {isOverpaid ? "Cambio Pendiente:" : "Total a Pagar:"}
                        </td>
                        <td
                          className={`px-6 py-4 text-right text-xl font-bold ${isOverpaid ? "text-red-600" : "text-[#2196F3]"}`}
                        >
                          {formatPrice(Math.abs(remainingDue))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile cart cards */}
                <div className="md:hidden">
                  <div className="divide-y divide-gray-100">
                    {filteredItems.map((item) => {
                      const finalPrice =
                        item.applyDiscount && item.discount > 0
                          ? item.sellingPrice * (1 - item.discount / 100)
                          : item.sellingPrice;
                      return (
                        <div key={item.id} className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-[#1A1A1A] truncate">
                                {item.name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs text-gray-500">
                                  {formatPrice(item.sellingPrice)}
                                </span>
                                {item.includesTaxes && (
                                  <span className="text-[9px] text-blue-600 bg-blue-50 px-1 rounded">
                                    +IVA
                                  </span>
                                )}
                                {item.discount > 0 && (
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <Checkbox
                                      id={`dm-${item.id}`}
                                      checked={item.applyDiscount}
                                      onCheckedChange={(c) =>
                                        toggleCartItemDiscount(
                                          item.id,
                                          c as boolean,
                                        )
                                      }
                                      className="h-3 w-3"
                                    />
                                    <span className="text-[10px] text-green-600 font-medium">
                                      -{item.discount}%
                                    </span>
                                  </label>
                                )}
                              </div>
                            </div>
                            {/* Subtotal + remove */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="text-right">
                                {item.applyDiscount && item.discount > 0 ? (
                                  <>
                                    <p className="text-[10px] text-gray-400 line-through">
                                      {formatPrice(
                                        item.sellingPrice * item.cartQuantity,
                                      )}
                                    </p>
                                    <p className="text-sm font-semibold text-green-600">
                                      {formatPrice(
                                        finalPrice * item.cartQuantity,
                                      )}
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-sm font-semibold text-[#1A1A1A]">
                                    {formatPrice(
                                      finalPrice * item.cartQuantity,
                                    )}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {/* Quantity controls */}
                          <div className="flex items-center gap-2">
                            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                              <button
                                onClick={() =>
                                  updateCartItemQuantity(
                                    item.id,
                                    item.cartQuantity - 1,
                                  )
                                }
                                className="px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="px-3 py-1.5 text-sm font-medium min-w-[2.5rem] text-center">
                                {item.cartQuantity}
                              </span>
                              <button
                                onClick={() =>
                                  updateCartItemQuantity(
                                    item.id,
                                    item.cartQuantity + 1,
                                  )
                                }
                                className="px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <span className="text-xs text-gray-400">
                              {item.unit === "units"
                                ? "unid."
                                : item.unit === "kg"
                                  ? "kg"
                                  : "L"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mobile totals summary */}
                  <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-1.5">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Subtotal</span>
                      <span>{formatPrice(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Impuestos (10%)</span>
                      <span>{formatPrice(taxAmount)}</span>
                    </div>
                    {currentPayments.map((p, i) => (
                      <div
                        key={i}
                        className="flex justify-between text-xs text-green-600"
                      >
                        <span>Pagado ({p.method})</span>
                        <span>-{formatPrice(p.amount)}</span>
                      </div>
                    ))}
                    <div
                      className={`flex justify-between text-base font-bold pt-1.5 border-t border-gray-200 ${isOverpaid ? "text-red-600" : "text-[#2196F3]"}`}
                    >
                      <span>{isOverpaid ? "Cambio" : "Total"}</span>
                      <span>{formatPrice(Math.abs(remainingDue))}</span>
                    </div>
                  </div>
                </div>

                {/* Pay button */}
                <div className="p-4 bg-white border-t border-gray-200 flex justify-end">
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-5 text-base shadow-md hover:shadow-lg w-full md:w-auto"
                    onClick={() => setIsPaymentModalOpen(true)}
                  >
                    <CreditCard className="w-5 h-5 mr-2" />
                    {remainingDue <= 0.01
                      ? "Finalizar"
                      : `Pagar ${formatPrice(remainingDue)}`}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Saved carts sidebar ── */}
        <div className="w-full md:w-72 space-y-3">
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2 text-sm">
              <RotateCcw className="w-4 h-4 text-gray-500" />
              Listas Guardadas
            </h3>
            {savedCarts.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-3">
                No hay listas guardadas
              </p>
            ) : (
              <div className="space-y-2">
                {savedCarts.map((cart) => (
                  <div
                    key={cart.id}
                    className="p-3 rounded-lg border border-gray-200 hover:border-[#2196F3] hover:bg-blue-50 transition-all cursor-pointer group relative"
                    onClick={() => loadCart(cart)}
                  >
                    <div className="font-medium text-xs text-gray-900 mb-1 pr-5 truncate">
                      {cart.name}
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-gray-500">
                      <span>
                        {format(new Date(cart.dateSaved), "dd MMM HH:mm")}
                      </span>
                      <span>{cart.items.length} items</span>
                    </div>
                    {cart.payments?.length > 0 && (
                      <div className="mt-1 text-[10px] text-green-600 font-medium">
                        Abonado:{" "}
                        {formatPrice(
                          cart.payments.reduce((s, p) => s + p.amount, 0),
                        )}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSavedCart(cart.id);
                      }}
                      className="absolute top-2 right-2 p-0.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Fixed mobile pay bar ── */}
      {cartItems.length > 0 && (
        <div className="md:hidden fixed bottom-14 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2.5 z-40 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500">
                {isOverpaid ? "Cambio:" : "Total:"}
              </p>
              <p
                className={`text-lg font-bold ${isOverpaid ? "text-red-600" : "text-[#2196F3]"}`}
              >
                {formatPrice(Math.abs(remainingDue))}
              </p>
            </div>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 text-sm shadow-md flex-shrink-0"
              onClick={() => setIsPaymentModalOpen(true)}
            >
              <CreditCard className="w-4 h-4 mr-1.5" />
              {remainingDue <= 0.01 ? "Finalizar" : "Pagar"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Payment modal ── */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-md bg-white w-[calc(100vw-2rem)] rounded-xl">
          <DialogHeader>
            <DialogTitle>Procesar Pago</DialogTitle>
            <DialogDescription>
              Restante:{" "}
              <span className="font-bold text-[#2196F3]">
                {formatPrice(remainingDue)}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Monto (Bs)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  Bs
                </span>
                <Input
                  type="number"
                  placeholder="0.00"
                  className="pl-9"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleAddPayment()}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas (Opcional)</Label>
              <Textarea
                placeholder="Notas de la transacción…"
                value={transactionNotes}
                onChange={(e) => setTransactionNotes(e.target.value)}
                className="min-h-[70px]"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="secondary"
              onClick={() => setIsPaymentModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddPayment}
              className="bg-[#2196F3] hover:bg-[#1976D2] w-full sm:w-auto"
            >
              Confirmar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change modal ── */}
      <Dialog
        open={isChangeModalOpen}
        onOpenChange={(o) => {
          if (!o) handleCompleteTransaction();
        }}
      >
        <DialogContent className="sm:max-w-md bg-white border-red-100 w-[calc(100vw-2rem)] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Banknote className="w-6 h-6" />
              Cambio Requerido
            </DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            <p className="text-gray-600 text-base">Dale cambio de</p>
            <p className="text-4xl font-bold text-red-600 mt-2">
              {formatPrice(changeAmount)}
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCompleteTransaction}
              className="w-full bg-green-600 hover:bg-green-700 text-white text-lg py-5"
            >
              Listo (Entregado)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
