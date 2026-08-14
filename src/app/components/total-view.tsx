import { useState, useEffect } from "react";
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
  Loader2,
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
import {
  useApp,
  CartItem,
  PaymentRecord,
  isReferenceLens,
  InsufficientStockError,
  formatMoneyValue,
} from "../context/app-context";
import { PriceTag } from "./price-tag";
import { useAuth } from "../context/auth-context";
import { MoneyInput } from "./money-input";
import { QuantityStepper } from "./quantity-stepper";

// Inline editable unit price for a cart line, so a seller can close a sale at
// a price different from the default. Entry is always USD or honest-rate
// bolivares - never the display lens, which may be a reference rate.
function EditablePrice({ item }: { item: CartItem }) {
  const { updateCartItemPrice } = useApp();
  return (
    <MoneyInput
      label="Precio de venta"
      valueUsd={item.sellingPrice}
      onCommitUsd={(usd) => updateCartItemPrice(item.id, usd)}
      className="w-32"
    />
  );
}

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
  onCheckout?: (
    items: CartItem[],
    payments?: PaymentRecord[],
  ) => void | Promise<void>;
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
    currencySymbol,
    currency,
    bsToUsd,
    usdToBs,
  } = useApp();
  const { currentUser } = useAuth();
  // Reference lenses (BCV/EUR/Binance) restate prices at a rate we do not
  // treat as the real worth of a bolivar, so editing money while one is
  // active would book the amount at the wrong value.
  const referenceLens = isReferenceLens(currency);
  const canEditPrice =
    (currentUser?.role === "admin" || currentUser?.canEditPrice === true) &&
    !referenceLens;

  const [searchTerm, setSearchTerm] = useState("");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("Efectivo");
  const [paymentAmount, setPaymentAmount] = useState("");
  // Payments are entered explicitly in USD or honest-rate bolivares, never
  // through the display lens (which may be a reference rate the money is not
  // actually worth).
  const [paymentEntry, setPaymentEntry] = useState<"USD" | "BS">("USD");
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [changeAmount, setChangeAmount] = useState(0);
  const [processing, setProcessing] = useState(false);
  // Payments captured at the moment the sale was completed. We thread these
  // through completion explicitly because addPayment's state update has not
  // flushed yet when we finalize, so reading currentPayments would miss the
  // final (often only) payment and lose its method in the stored history.
  const [pendingPayments, setPendingPayments] = useState<
    PaymentRecord[] | undefined
  >(undefined);
  // Lines the server refused for lack of stock. Struck through in the cart so
  // the seller can see exactly which product to remove, instead of having to
  // work it out from the toast.
  const [unavailableIds, setUnavailableIds] = useState<string[]>([]);

  // Any change to the cart clears the marks: the seller has acted on them, and
  // stale warnings on a rebuilt cart would be misleading.
  useEffect(() => {
    setUnavailableIds([]);
  }, [cartItems.length]);

  const filteredItems = cartItems.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.barcode.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleAddPayment = async () => {
    const enteredAmount = parseFloat(paymentAmount);
    if (isNaN(enteredAmount) || enteredAmount <= 0) {
      toast.error("Por favor ingrese un monto válido");
      return;
    }
    // Payments are stored in the canonical USD basis used by
    // totalAmount/remainingDue. Bolivares convert at the honest rate.
    const amount =
      paymentEntry === "USD" ? enteredAmount : bsToUsd(enteredAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Monto inválido — verifica las tasas de cambio");
      return;
    }
    const newPayments: PaymentRecord[] = [
      ...currentPayments,
      { method: selectedMethod, amount, timestamp: new Date().toISOString() },
    ];
    addPayment(selectedMethod, amount);
    setPaymentAmount("");
    const newPaid = amountPaid + amount;
    const remaining = totalAmount - newPaid;
    if (remaining <= 0.01) {
      setIsPaymentModalOpen(false);
      if (remaining < -0.01) {
        setChangeAmount(Math.abs(remaining));
        setPendingPayments(newPayments);
        setIsChangeModalOpen(true);
      } else {
        await handleCompleteTransaction(newPayments);
      }
    } else {
      toast.success(
        `Pago de ${formatPrice(amount)} agregado. Restante: ${formatPrice(remaining)}`,
      );
    }
  };

  const handleCompleteTransaction = async (payments?: PaymentRecord[]) => {
    if (processing) return;
    setProcessing(true);
    try {
      if (onCheckout) await onCheckout(cartItems, payments);
      clearPayments();
      clearCart();
      setPendingPayments(undefined);
      setIsChangeModalOpen(false);
      setIsPaymentModalOpen(false);
    } catch (err) {
      // The cart is deliberately left intact so the sale can be retried
      // rather than silently lost.
      console.error("Error al completar la venta", err);

      // The sale was rejected, so no money was received against it. Discard
      // the recorded payment: leaving it makes the app show the customer as
      // having paid, and the totals then read as change owed on a sale that
      // never happened. The cart survives so it can be corrected and re-taken.
      clearPayments();
      setPendingPayments(undefined);
      setIsChangeModalOpen(false);
      setIsPaymentModalOpen(false);

      if (err instanceof InsufficientStockError) {
        // App.tsx already named the product; flag the line and say what the
        // seller has to do next, rather than stacking another error toast.
        setUnavailableIds((prev) =>
          prev.includes(err.itemId) ? prev : [...prev, err.itemId],
        );
        toast.warning("El pago no se registró. Corrige la lista y cobra de nuevo.");
      } else {
        toast.error(
          "No se pudo completar la venta. El pago no se registró; revisa la lista e intenta de nuevo.",
        );
      }
    } finally {
      setProcessing(false);
    }
  };

  const isOverpaid = remainingDue < -0.01;

  return (
    <div className="space-y-4 md:space-y-6 pb-24 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
        {/* Main cart */}
        <div className="flex-1 space-y-4">
          {/* Header */}
          <div className="bg-white rounded-xl border border-border shadow-card p-4 md:p-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base md:text-lg font-bold text-foreground flex items-center gap-2">
                <ShoppingCart className="size-5 text-primary" aria-hidden="true" />
                Lista para cobrar
                {cartItems.length > 0 && (
                  <span className="text-sm bg-primary-soft text-primary-soft-foreground font-bold rounded-full px-2.5 py-0.5" data-money>
                    {cartItems.length}
                  </span>
                )}
              </h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearCart}
                  disabled={cartItems.length === 0}
                  aria-label="Limpiar la lista"
                  className="tap-target text-destructive hover:text-destructive hover:bg-destructive-soft"
                >
                  <Trash2 aria-hidden="true" />
                  Limpiar
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  onClick={saveCart}
                  disabled={cartItems.length === 0}
                  aria-label="Guardar la lista"
                  className="tap-target"
                >
                  <Save aria-hidden="true" />
                  Guardar
                </Button>
              </div>
            </div>
            {cartItems.length > 0 && (
              <div className="relative">
                <Search
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  aria-label="Buscar en la lista"
                  placeholder="Buscar en la lista…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 text-sm"
                />
              </div>
            )}
          </div>

          {/* Cart items */}
          <div className="bg-white rounded-xl border border-border overflow-hidden shadow-card">
            {cartItems.length === 0 ? (
              <div className="p-10 md:p-14 text-center">
                <ShoppingCart
                  className="size-10 text-muted-foreground/50 mx-auto mb-3"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <p className="text-base font-semibold text-foreground mb-1">
                  Todavía no hay nada que cobrar
                </p>
                <p className="text-sm text-muted-foreground">
                  Busca productos en <strong>Vender</strong> y agrégalos aquí.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-canvas border-b border-border">
                      <tr>
                        <th className="text-left px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                          Producto
                        </th>
                        <th className="text-left px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                          Precio Unit.
                        </th>
                        <th className="text-center px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                          Cantidad
                        </th>
                        <th className="text-right px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                          Subtotal
                        </th>
                        <th className="px-6 py-3.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredItems.map((item) => {
                        const finalPrice =
                          item.applyDiscount && item.discount > 0
                            ? item.sellingPrice * (1 - item.discount / 100)
                            : item.sellingPrice;
                        const unavailable = unavailableIds.includes(item.id);
                        return (
                          <tr
                            key={item.id}
                            className={
                              unavailable
                                ? "bg-destructive-soft/60"
                                : "hover:bg-canvas"
                            }
                          >
                            <td className="px-6 py-4">
                              <div
                                className={`font-semibold ${
                                  unavailable
                                    ? "text-destructive-soft-foreground line-through"
                                    : "text-foreground"
                                }`}
                              >
                                {item.name}
                              </div>
                              {/* Text label as well as colour, so the warning
                                  survives a colourblind or sunlit screen. */}
                              {unavailable && (
                                <div
                                  role="status"
                                  className="text-xs font-semibold text-destructive-soft-foreground mt-0.5"
                                >
                                  Sin stock — quita este producto para continuar
                                </div>
                              )}
                              <div
                                className={`text-xs font-mono ${
                                  unavailable
                                    ? "text-destructive-soft-foreground/70 line-through"
                                    : "text-muted-foreground"
                                }`}
                                data-money
                              >
                                {item.barcode}
                              </div>
                              {item.includesTaxes && (
                                <div className="text-meta font-semibold text-secondary-foreground bg-secondary inline-block px-1.5 py-0.5 rounded mt-1">
                                  Con impuestos
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-foreground">
                              <div className="flex flex-col gap-1">
                                {canEditPrice ? (
                                  <EditablePrice item={item} />
                                ) : (
                                  <PriceTag usd={item.sellingPrice} size="sm" />
                                )}
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
                                      className="size-4"
                                    />
                                    <Label
                                      htmlFor={`d-${item.id}`}
                                      className="text-xs text-primary cursor-pointer font-semibold"
                                    >
                                      -{item.discount}%
                                    </Label>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center">
                                <QuantityStepper
                                  label={`Cantidad de ${item.name}`}
                                  value={item.cartQuantity}
                                  max={item.quantity}
                                  onChange={(q) =>
                                    updateCartItemQuantity(item.id, q)
                                  }
                                />
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right font-semibold text-foreground" data-money>
                              {item.applyDiscount && item.discount > 0 ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-xs text-muted-foreground line-through">
                                    {formatPrice(
                                      item.sellingPrice * item.cartQuantity,
                                    )}
                                  </span>
                                  <PriceTag
                                    usd={finalPrice * item.cartQuantity}
                                    size="sm"
                                    className="text-primary-soft-foreground"
                                  />
                                </div>
                              ) : (
                                <PriceTag
                                  usd={finalPrice * item.cartQuantity}
                                  size="sm"
                                  className="justify-end"
                                />
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => removeFromCart(item.id)}
                                aria-label={`Quitar ${item.name} de la lista`}
                                className="tap-target inline-flex items-center justify-center h-10 w-10 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive-soft transition-colors"
                              >
                                <X className="size-4.5" aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-canvas border-t border-border">
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-2 text-right text-sm text-muted-foreground"
                        >
                          Subtotal:
                        </td>
                        <td className="px-6 py-2 text-right text-sm font-semibold" data-money>
                          <PriceTag usd={subtotal} size="sm" className="justify-end" />
                        </td>
                        <td />
                      </tr>
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-2 text-right text-sm text-muted-foreground"
                        >
                          Impuestos (10%):
                        </td>
                        <td className="px-6 py-2 text-right text-sm font-semibold" data-money>
                          <PriceTag usd={taxAmount} size="sm" className="justify-end" />
                        </td>
                        <td />
                      </tr>
                      {currentPayments.map((p, i) => (
                        <tr key={i} className="text-primary-soft-foreground">
                          <td
                            colSpan={3}
                            className="px-6 py-2 text-right text-sm"
                          >
                            Pagado ({p.method}):
                          </td>
                          <td className="px-6 py-2 text-right text-sm font-semibold" data-money>
                            -{formatPrice(p.amount)}
                          </td>
                          <td />
                        </tr>
                      ))}
                      <tr className={isOverpaid ? "bg-destructive-soft" : "bg-canvas"}>
                        <td
                          colSpan={3}
                          className="px-6 py-4 text-right text-base font-bold text-foreground"
                        >
                          {isOverpaid ? "Cambio pendiente:" : "Total a pagar:"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <PriceTag
                            usd={Math.abs(remainingDue)}
                            size="lg"
                            className={`justify-end ${isOverpaid ? "text-destructive [&>span]:text-destructive" : ""}`}
                          />
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile cart cards */}
                <div className="md:hidden">
                  <div className="divide-y divide-border">
                    {filteredItems.map((item) => {
                      const finalPrice =
                        item.applyDiscount && item.discount > 0
                          ? item.sellingPrice * (1 - item.discount / 100)
                          : item.sellingPrice;
                      const unavailable = unavailableIds.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 ${unavailable ? "bg-destructive-soft/60" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-[0.9375rem] font-semibold break-words ${
                                  unavailable
                                    ? "text-destructive-soft-foreground line-through"
                                    : "text-foreground"
                                }`}
                              >
                                {item.name}
                              </p>
                              {unavailable && (
                                <p
                                  role="status"
                                  className="text-xs font-semibold text-destructive-soft-foreground"
                                >
                                  Sin stock — quita este producto
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {canEditPrice ? (
                                  <EditablePrice item={item} />
                                ) : (
                                  <PriceTag usd={item.sellingPrice} size="sm" className="font-normal" />
                                )}
                                {item.includesTaxes && (
                                  <span className="text-meta font-semibold text-secondary-foreground bg-secondary px-1.5 py-0.5 rounded">
                                    +IVA
                                  </span>
                                )}
                                {item.discount > 0 && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <Checkbox
                                      id={`dm-${item.id}`}
                                      checked={item.applyDiscount}
                                      onCheckedChange={(c) =>
                                        toggleCartItemDiscount(
                                          item.id,
                                          c as boolean,
                                        )
                                      }
                                      className="size-4"
                                    />
                                    <span className="text-meta text-primary font-semibold">
                                      -{item.discount}%
                                    </span>
                                  </label>
                                )}
                              </div>
                            </div>
                            {/* Subtotal + remove */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <div className="text-right" data-money>
                                {item.applyDiscount && item.discount > 0 ? (
                                  <>
                                    <p className="text-meta text-muted-foreground line-through">
                                      {formatPrice(
                                        item.sellingPrice * item.cartQuantity,
                                      )}
                                    </p>
                                    <p className="text-[0.9375rem] font-bold text-primary-soft-foreground">
                                      {formatPrice(
                                        finalPrice * item.cartQuantity,
                                      )}
                                    </p>
                                  </>
                                ) : (
                                  <PriceTag
                                    usd={finalPrice * item.cartQuantity}
                                    size="sm"
                                    className="justify-end"
                                  />
                                )}
                              </div>
                              <button
                                onClick={() => removeFromCart(item.id)}
                                aria-label={`Quitar ${item.name} del carrito`}
                                className="h-11 w-11 min-w-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive-soft transition-colors"
                              >
                                <X className="size-4.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                          {/* Quantity controls */}
                          <div className="flex items-center gap-2">
                            <QuantityStepper
                              label={`Cantidad de ${item.name}`}
                              value={item.cartQuantity}
                              max={item.quantity}
                              onChange={(q) =>
                                updateCartItemQuantity(item.id, q)
                              }
                            />
                            <span className="text-sm text-muted-foreground">
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
                  <div className="border-t border-border bg-canvas p-4 space-y-1.5" data-money>
                    <div className="flex justify-between gap-2 text-sm text-muted-foreground">
                      <span>Subtotal</span>
                      <PriceTag usd={subtotal} size="sm" className="font-normal text-muted-foreground [&>span]:text-muted-foreground" />
                    </div>
                    <div className="flex justify-between gap-2 text-sm text-muted-foreground">
                      <span>Impuestos (10%)</span>
                      <PriceTag usd={taxAmount} size="sm" className="font-normal text-muted-foreground [&>span]:text-muted-foreground" />
                    </div>
                    {currentPayments.map((p, i) => (
                      <div
                        key={i}
                        className="flex justify-between text-sm font-semibold text-primary-soft-foreground"
                      >
                        <span>Pagado ({p.method})</span>
                        <span>-{formatPrice(p.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-baseline justify-between pt-2 border-t border-border">
                      <span className={`text-base font-bold ${isOverpaid ? "text-destructive" : "text-foreground"}`}>
                        {isOverpaid ? "Cambio" : "Total"}
                      </span>
                      <PriceTag
                        usd={Math.abs(remainingDue)}
                        size="lg"
                        className={isOverpaid ? "text-destructive [&>span]:text-destructive" : ""}
                      />
                    </div>
                  </div>
                </div>

                {/* Pay button */}
                <div className="p-4 bg-white border-t border-border flex flex-col items-end gap-2">
                  {/* Collecting money under a reference lens would quote the
                      customer bolivares at a rate the sale is not booked at:
                      the seller takes that cash and the books record a
                      fraction of it. Same rule as the price edit above. */}
                  <Button
                    size="lg"
                    className="w-full md:w-auto disabled:opacity-60"
                    onClick={() => setIsPaymentModalOpen(true)}
                    disabled={referenceLens}
                  >
                    <CreditCard aria-hidden="true" />
                    {remainingDue <= 0.01
                      ? "Finalizar"
                      : referenceLens
                        ? `Cobrar $ ${formatMoneyValue(remainingDue)}`
                        : `Cobrar ${formatPrice(remainingDue)}`}
                  </Button>
                  {referenceLens && (
                    <p className="text-sm text-pending text-right">
                      Estás viendo una tasa de referencia. Cambia a $ o Bs para cobrar.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Saved carts sidebar */}
        <div className="w-full md:w-72 space-y-3">
          <div className="bg-white rounded-xl border border-border shadow-card p-4 md:p-6">
            <h3 className="font-bold text-foreground mb-3 flex items-center gap-2 text-[0.9375rem]">
              <RotateCcw className="size-4.5 text-muted-foreground" aria-hidden="true" />
              Listas guardadas
            </h3>
            {savedCarts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                Guarda una lista para retomarla después
              </p>
            ) : (
              <div className="space-y-2">
                {savedCarts.map((cart) => (
                  <div
                    key={cart.id}
                    className="rounded-lg border border-border hover:border-primary hover:bg-primary-soft/40 transition-all group relative"
                  >
                    {/* Loading the list is a button rather than a click
                        handler on the card, so it can be reached by keyboard.
                        Delete stays a sibling: buttons cannot nest. */}
                    <button
                      type="button"
                      onClick={() => loadCart(cart)}
                      aria-label={`Cargar la lista ${cart.name}`}
                      className="w-full text-left p-3 cursor-pointer"
                    >
                      <div className="font-semibold text-sm text-foreground mb-1 pr-8 truncate">
                        {cart.name}
                      </div>
                      <div className="flex justify-between items-center text-meta text-muted-foreground" data-money>
                        <span>
                          {format(new Date(cart.dateSaved), "dd MMM HH:mm")}
                        </span>
                        <span>{cart.items.length} items</span>
                      </div>
                      {cart.payments?.length > 0 && (
                        <div className="mt-1 text-meta text-primary-soft-foreground font-semibold" data-money>
                          Abonado:{" "}
                          {formatPrice(
                            cart.payments.reduce((s, p) => s + p.amount, 0),
                          )}
                        </div>
                      )}
                    </button>
                    {/* Revealed on hover on a pointer device; a touch screen
                        has no hover, so there it is simply always visible. */}
                    <button
                      onClick={() => deleteSavedCart(cart.id)}
                      aria-label={`Eliminar la lista ${cart.name}`}
                      className="tap-target absolute top-1.5 right-1.5 inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive-soft transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed mobile pay bar */}
      {cartItems.length > 0 && (
        <div className="md:hidden fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] left-0 right-0 bg-white border-t border-border px-4 py-3 z-40 shadow-raised">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-sm font-semibold ${isOverpaid ? "text-destructive" : "text-muted-foreground"}`}>
                {isOverpaid ? "Cambio" : "Total"}
              </p>
              <PriceTag
                usd={Math.abs(remainingDue)}
                size="lg"
                className={isOverpaid ? "text-destructive [&>span]:text-destructive" : ""}
              />
            </div>
            <Button
              size="lg"
              className="flex-shrink-0"
              onClick={() => setIsPaymentModalOpen(true)}
              disabled={referenceLens}
            >
              <CreditCard aria-hidden="true" />
              {remainingDue <= 0.01 ? "Finalizar" : "Cobrar"}
            </Button>
          </div>
        </div>
      )}

      {/* Payment modal */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cobrar</DialogTitle>
            <DialogDescription className="text-base">
              Falta por pagar:{" "}
              <span className="font-bold text-foreground" data-money>
                {formatPrice(remainingDue)}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="payment-method">¿Cómo paga el cliente?</Label>
              <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                <SelectTrigger id="payment-method">
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
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="payment-amount">Monto a recibir</Label>
                {/* Explicit basis: the amount owed is restated in whichever
                    unit the seller is about to type, so what they read on
                    screen is exactly what settles the sale. */}
                <div className="flex rounded-lg border border-input overflow-hidden">
                  {(["USD", "BS"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={paymentEntry === c}
                      onClick={() => setPaymentEntry(c)}
                      className={`h-11 px-4 text-sm font-semibold ${
                        paymentEntry === c
                          ? "bg-primary text-white"
                          : "bg-input-background text-foreground hover:bg-secondary"
                      }`}
                    >
                      {c === "USD" ? "$" : "Bs"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground" aria-live="polite" data-money>
                Pendiente:{" "}
                <span className="font-semibold text-foreground">
                  {paymentEntry === "USD"
                    ? `$ ${formatMoneyValue(remainingDue)}`
                    : `Bs ${formatMoneyValue(usdToBs(remainingDue))}`}
                </span>
              </p>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-base font-semibold"
                >
                  {paymentEntry === "USD" ? "$" : "Bs"}
                </span>
                <Input
                  id="payment-amount"
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  placeholder="0.00"
                  className="pl-10 h-13 text-lg font-semibold"
                  data-money
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleAddPayment()}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transaction-notes">Notas (opcional)</Label>
              <Textarea
                id="transaction-notes"
                placeholder="Notas de la venta…"
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
              disabled={processing}
              className="w-full sm:w-auto disabled:opacity-60"
            >
              {processing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4.5 animate-spin" aria-hidden="true" />
                  Procesando…
                </span>
              ) : (
                "Confirmar pago"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change modal */}
      {/* Completing the sale is an explicit action, never a side effect of the
          dialog closing - Escape and backdrop clicks must not finalize money. */}
      <Dialog open={isChangeModalOpen} onOpenChange={setIsChangeModalOpen}>
        <DialogContent
          className="sm:max-w-md"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="size-6 text-primary" aria-hidden="true" />
              Entrega el cambio
            </DialogTitle>
          </DialogHeader>
          {/* Change is physical cash. It is quoted in dollars and honest-rate
              bolivares, never through the display lens: the payment that
              produced it was converted at the honest rate, so a lens figure
              here would send the seller to the till with the wrong notes. */}
          <div className="py-6 text-center rounded-2xl bg-canvas border border-border" data-money>
            <p className="text-muted-foreground text-base">Dale al cliente</p>
            <p className="text-[2.5rem] leading-tight font-bold text-foreground mt-1.5">
              $ {formatMoneyValue(changeAmount)}
            </p>
            <p className="text-2xl font-bold text-foreground mt-0.5">
              Bs {formatMoneyValue(usdToBs(changeAmount))}
            </p>
          </div>
          <DialogFooter>
            <Button
              size="lg"
              onClick={() => handleCompleteTransaction(pendingPayments)}
              disabled={processing}
              className="w-full disabled:opacity-60"
            >
              {processing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                  Procesando…
                </span>
              ) : (
                "Cambio entregado, terminar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
