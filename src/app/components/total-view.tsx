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
  DollarSign,
} from "lucide-react";
import { useCart, type CartItem } from "../context/cart-context";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
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

const currencySymbols: Record<string, string> = {
  BS: "BS",
  USD: "$",
  EUR: "€",
};

const PAYMENT_METHODS = [
  "Pago Movil",
  "Efectivo",
  "Tarjeta de Credito",
  "Tarjeta de Debito",
  "Transferencia Bancaria",
  "Crypto",
  "Zelle",
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
    clearCart,
    saveCart,
    loadCart,
    deleteSavedCart,
    subtotal,
    taxAmount,
    totalAmount,
    // Payment State
    currentPayments,
    transactionNotes,
    addPayment,
    setTransactionNotes,
    clearPayments,
    amountPaid,
    remainingDue,
  } = useCart();

  const [searchTerm, setSearchTerm] = useState("");

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("Cash");
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
      toast.error("Por favor ingrese una cantidad valida");
      return;
    }

    addPayment(selectedMethod, amount);
    setPaymentAmount("");

    // Check if we are done or overpaid
    const newPaidTotal = amountPaid + amount;
    const remaining = totalAmount - newPaidTotal;

    if (remaining <= 0) {
      // Transaction Complete
      setIsPaymentModalOpen(false);
      if (remaining < 0) {
        setChangeAmount(Math.abs(remaining));
        setIsChangeModalOpen(true);
      } else {
        // Exact amount
        handleCompleteTransaction();
      }
    } else {
      toast.success(
        `Pago de $${amount.toFixed(2)} agregado. Falta: $${remaining.toFixed(2)}`,
      );
    }
  };

  const handleCompleteTransaction = () => {
    if (onCheckout) {
      onCheckout(cartItems);
    }
    clearPayments();
    clearCart();
    setIsChangeModalOpen(false);
    setIsPaymentModalOpen(false);
  };

  const isOverpaid = remainingDue < 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-start gap-8">
        {/* Main Cart Area */}
        <div className="flex-1 space-y-6">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-[#2196F3]" />
                Carrito de Compras
              </h2>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={clearCart}
                  disabled={cartItems.length === 0}
                  className="flex-1 sm:flex-none text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Borrar
                </Button>
                <Button
                  onClick={saveCart}
                  disabled={cartItems.length === 0}
                  className="flex-1 sm:flex-none bg-[#2196F3] hover:bg-[#1976D2] text-white"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Guardar
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Buscar en el carrito..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            {cartItems.length === 0 ? (
              <div className="p-12 text-center">
                <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Tu carrito esta vacio</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                        Producto
                      </th>
                      <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                        Precio
                      </th>
                      <th className="text-center px-6 py-4 text-sm text-gray-600 font-normal">
                        Cantidad
                      </th>
                      <th className="text-right px-6 py-4 text-sm text-gray-600 font-normal">
                        Subtotal
                      </th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-[#1A1A1A]">
                            {item.name}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            {item.barcode}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {currencySymbols[item.currency] || "$"}
                          {item.sellingPrice.toFixed(2)}
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
                          {currencySymbols[item.currency] || "$"}
                          {(item.sellingPrice * item.cartQuantity).toFixed(2)}
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
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td
                        colSpan={3}
                        className="px-6 py-2 text-right text-sm text-gray-500"
                      >
                        Subtotal:
                      </td>
                      <td className="px-6 py-2 text-right text-sm text-gray-900 font-medium">
                        ${subtotal.toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                    <tr>
                      <td
                        colSpan={3}
                        className="px-6 py-2 text-right text-sm text-gray-500"
                      >
                        Impuestos (10%):
                      </td>
                      <td className="px-6 py-2 text-right text-sm text-gray-900 font-medium">
                        ${taxAmount.toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                    {currentPayments.length > 0 && (
                      <>
                        {currentPayments.map((p, idx) => (
                          <tr key={idx} className="text-green-600">
                            <td
                              colSpan={3}
                              className="px-6 py-2 text-right text-sm"
                            >
                              Pagado ({p.method}):
                            </td>
                            <td className="px-6 py-2 text-right text-sm font-medium">
                              -${p.amount.toFixed(2)}
                            </td>
                            <td></td>
                          </tr>
                        ))}
                      </>
                    )}
                    <tr className={isOverpaid ? "bg-red-50" : "bg-gray-100"}>
                      <td
                        colSpan={3}
                        className="px-6 py-4 text-right font-bold text-gray-700"
                      >
                        {isOverpaid ? "Vuelto a Dar:" : "Total a Pagar:"}
                      </td>
                      <td
                        className={`px-6 py-4 text-right text-xl font-bold ${isOverpaid ? "text-red-600" : "text-[#2196F3]"}`}
                      >
                        ${Math.abs(remainingDue).toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Pay Button Area */}
            {cartItems.length > 0 && (
              <div className="p-6 bg-white border-t border-gray-200 flex justify-end">
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg shadow-md transition-all hover:shadow-lg"
                  onClick={() => setIsPaymentModalOpen(true)}
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  {remainingDue <= 0
                    ? "Finalizar Transacción"
                    : `Pagar: $${remainingDue.toFixed(2)}`}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Payment Modal */}
        <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
          <DialogContent className="sm:max-w-md bg-white">
            <DialogHeader>
              <DialogTitle>Procesar Pago</DialogTitle>
              <DialogDescription>
                Total Restante:{" "}
                <span className="font-bold text-[#2196F3]">
                  ${remainingDue.toFixed(2)}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Metodo de Pago</Label>
                <Select
                  value={selectedMethod}
                  onValueChange={setSelectedMethod}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cantidad</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    type="number"
                    placeholder="0.00"
                    className="pl-9"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleAddPayment();
                      }
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notas (Opcional)</Label>
                <Textarea
                  placeholder="Agregar notas de transacción..."
                  value={transactionNotes}
                  onChange={(e) => setTransactionNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="flex-col sm:justify-between gap-2">
              <Button
                variant="secondary"
                onClick={() => setIsPaymentModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddPayment}
                className="bg-[#2196F3] hover:bg-[#1976D2]"
              >
                Confirmar Pago
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Due Modal */}
        <Dialog
          open={isChangeModalOpen}
          onOpenChange={(open) => {
            if (!open) handleCompleteTransaction();
          }}
        >
          <DialogContent className="sm:max-w-md bg-white border-red-100">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <Banknote className="w-6 h-6" />
                Vuelto a Dar
              </DialogTitle>
            </DialogHeader>

            <div className="py-8 text-center">
              <p className="text-gray-600 text-lg">Dale cambio de</p>
              <p className="text-4xl font-bold text-red-600 mt-2">
                ${changeAmount.toFixed(2)}
              </p>
            </div>

            <DialogFooter>
              <Button
                onClick={handleCompleteTransaction}
                className="w-full bg-green-600 hover:bg-green-700 text-white text-lg py-6"
              >
                Listo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Sidebar - Saved Carts */}
        <div className="w-full md:w-80 space-y-4">
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-gray-500" />
              Carritos Guardados
            </h3>

            {savedCarts.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No hay carritos guardados
              </p>
            ) : (
              <div className="space-y-3">
                {savedCarts.map((cart) => (
                  <div
                    key={cart.id}
                    className="p-3 rounded-lg border border-gray-200 hover:border-[#2196F3] hover:bg-blue-50 transition-all cursor-pointer group relative"
                    onClick={() => loadCart(cart)}
                  >
                    <div className="font-medium text-sm text-gray-900 mb-1">
                      {cart.name}
                    </div>
                    <div className="flex justify-between items-end text-xs text-gray-500">
                      <span>
                        {format(new Date(cart.dateSaved), "MMM dd, HH:mm")}
                      </span>
                      <span>{cart.items.length} items</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSavedCart(cart.id);
                      }}
                      className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
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
    </div>
  );
}
