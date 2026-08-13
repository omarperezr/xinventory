// Registering a purchase: the one operation that moves stock and money at the
// same time.
//
// The basket lives here, in the browser, and is sent in a single call. Nothing
// touches inventory until "Registrar" is pressed, and the server applies the
// whole thing or none of it - a purchase that raised stock but never recorded
// the payment is not a state this can reach.

import { useMemo, useState } from "react";
import { PackagePlus, Plus, Search, Trash2, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useApp } from "../../context/app-context";
import { useAuth } from "../../context/auth-context";
import {
  NewProductInput,
  PurchaseLineInput,
  todayIso,
  useFinance,
} from "../../context/finance-context";
import type { UnitType } from "../../context/app-context";

const NONE = "none";

interface DraftLine extends PurchaseLineInput {
  key: string;
}

const emptyProduct = (name: string): NewProductInput => ({
  name,
  barcode: "",
  sellingPriceUsd: 0,
  unit: "units",
  type: "",
  brand: "",
  includesTaxes: false,
  discount: 0,
});

export function PurchaseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { items, formatPrice } = useApp();
  const { accounts, categories, payees, createPurchase } = useFinance();
  const { currentUser } = useAuth();

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [query, setQuery] = useState("");
  const [supplierId, setSupplierId] = useState(NONE);
  const [accountId, setAccountId] = useState(NONE);
  // Null until the user picks: the categories arrive after the first render, so
  // the merchandise default has to be derived rather than seeded.
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [dueOn, setDueOn] = useState("");
  const [pending, setPending] = useState(false);
  const [freight, setFreight] = useState("0");
  const [prorate, setProrate] = useState(true);
  const [credit, setCredit] = useState("0");
  const [invoice, setInvoice] = useState("");
  const [notes, setNotes] = useState("");
  const [paidIn, setPaidIn] = useState<"USD" | "BS">("USD");
  const [saving, setSaving] = useState(false);

  const suppliers = payees.filter((p) => p.active);
  // Only categories the shop marked as merchandise, defaulting to the first,
  // so the P&L keeps treating stock as inventory rather than as an expense -
  // the same goods already reach it as cost of goods sold when they sell.
  const merchandiseCategories = categories.filter(
    (c) => !c.archived && c.kind === "expense" && c.nature === "cogs",
  );
  const effectiveCategoryId =
    categoryId ?? merchandiseCategories[0]?.id ?? NONE;

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          item.barcode.toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [items, query]);

  const goods = lines.reduce((s, l) => s + l.quantity * l.unitCostUsd, 0);
  const freightUsd = Math.max(parseFloat(freight) || 0, 0);
  const creditUsd = Math.max(parseFloat(credit) || 0, 0);
  const total = Math.max(goods + freightUsd - creditUsd, 0);

  const addLine = (
    itemId: string | null,
    name: string,
    cost: number,
    newProduct?: NewProductInput,
  ) => {
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        itemId,
        name,
        quantity: 1,
        unitCostUsd: cost,
        newProduct,
      },
    ]);
    setQuery("");
  };

  // A product nobody catalogued yet, most often the reason the supplier came at
  // all. It is described here and created by the same call that posts the
  // purchase, so abandoning this dialog leaves no empty product behind.
  const [newProduct, setNewProduct] = useState<NewProductInput | null>(null);

  const confirmNewProduct = () => {
    if (!newProduct) return;
    if (!newProduct.name.trim()) {
      toast.error("El producto necesita un nombre");
      return;
    }
    const duplicate = items.find(
      (item) =>
        item.barcode &&
        newProduct.barcode.trim() &&
        item.barcode.toUpperCase() === newProduct.barcode.trim().toUpperCase(),
    );
    if (duplicate) {
      toast.error(`Ese código ya lo tiene «${duplicate.name}». Búscalo arriba.`);
      return;
    }
    addLine(null, newProduct.name.trim().toUpperCase(), 0, {
      ...newProduct,
      name: newProduct.name.trim(),
    });
    setNewProduct(null);
  };

  const patchLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const reset = () => {
    setLines([]);
    setQuery("");
    setSupplierId(NONE);
    setAccountId(NONE);
    setCategoryId(null);
    setOccurredOn(todayIso());
    setDueOn("");
    setPending(false);
    setFreight("0");
    setProrate(true);
    setCredit("0");
    setInvoice("");
    setNotes("");
    setPaidIn("USD");
    setNewProduct(null);
  };

  const handleSave = async () => {
    if (!currentUser) return;
    if (lines.length === 0) {
      toast.error("Agrega al menos un producto");
      return;
    }
    if (lines.some((l) => l.quantity <= 0 || l.unitCostUsd < 0)) {
      toast.error("Revisa cantidades y costos");
      return;
    }

    setSaving(true);
    try {
      await createPurchase(
        {
          supplierId: supplierId === NONE ? null : supplierId,
          accountId: accountId === NONE ? null : accountId,
          categoryId: effectiveCategoryId === NONE ? null : effectiveCategoryId,
          occurredOn,
          dueOn: pending ? dueOn || null : null,
          paymentStatus: pending ? "pending" : "paid",
          freightUsd,
          prorateFreight: prorate,
          creditAppliedUsd: creditUsd,
          paidIn,
          invoiceNumber: invoice.trim(),
          notes: notes.trim(),
        },
        lines.map(({ itemId, name, quantity, unitCostUsd, newProduct: product }) => ({
          itemId,
          name,
          quantity,
          unitCostUsd,
          newProduct: product,
        })),
        currentUser.name,
      );
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Registrar compra</DialogTitle>
          <DialogDescription>
            Sube el stock, actualiza el costo de cada producto y registra la
            salida de dinero, todo en una sola operación.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Product search */}
          <div className="space-y-2">
            <Label htmlFor="purchase-search">Agregar producto</Label>
            <div className="relative">
              <Search
                className="size-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="purchase-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o código"
                className="pl-11"
              />
            </div>
            {results.length > 0 && (
              <ul className="mt-2 border border-border rounded-xl divide-y divide-border max-h-56 overflow-y-auto">
                {results.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => addLine(item.id, item.name, item.buyingPrice)}
                      className="w-full text-left px-3.5 py-3 hover:bg-canvas flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-base font-semibold text-foreground truncate">
                          {item.name}
                        </span>
                        <span className="block text-sm text-muted-foreground" data-money>
                          Stock {item.quantity} · último costo{" "}
                          {formatPrice(item.buyingPrice)}
                        </span>
                      </span>
                      <Plus className="size-5 text-primary shrink-0" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length > 1 && !newProduct && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewProduct(emptyProduct(query.trim()))}
                >
                  <PackagePlus aria-hidden="true" />
                  Crear «{query.trim()}» como producto nuevo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addLine(null, query.trim().toUpperCase(), 0)}
                >
                  Agregar sin inventario
                </Button>
              </div>
            )}
            {query.trim().length > 1 && !newProduct && (
              <p className="text-sm text-muted-foreground mt-1.5">
                «Sin inventario» es para lo que no se pone en estante: flete,
                empaques, un servicio de la misma factura.
              </p>
            )}
          </div>

          {/* New product */}
          {newProduct && (
            <div className="border border-primary/30 bg-primary-soft/50 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-base font-bold text-foreground">Producto nuevo</p>
                <button
                  type="button"
                  onClick={() => setNewProduct(null)}
                  aria-label="Cancelar producto nuevo"
                  className="tap-target inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-white hover:text-foreground"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-product-name">Nombre</Label>
                  <Input
                    id="new-product-name"
                    value={newProduct.name}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-product-barcode">Código de barras</Label>
                  <Input
                    id="new-product-barcode"
                    value={newProduct.barcode}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, barcode: e.target.value })
                    }
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-product-price">Precio de venta $</Label>
                  <Input
                    id="new-product-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={newProduct.sellingPriceUsd}
                    onChange={(e) =>
                      setNewProduct({
                        ...newProduct,
                        sellingPriceUsd: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-product-unit">Unidad</Label>
                  <Select
                    value={newProduct.unit}
                    onValueChange={(value) =>
                      setNewProduct({ ...newProduct, unit: value as UnitType })
                    }
                  >
                    <SelectTrigger id="new-product-unit" className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="units">Unidades</SelectItem>
                      <SelectItem value="kg">Kilos</SelectItem>
                      <SelectItem value="liters">Litros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-product-brand">Marca</Label>
                  <Input
                    id="new-product-brand"
                    value={newProduct.brand}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, brand: e.target.value })
                    }
                    placeholder="GENERICO"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-product-type">Categoría del producto</Label>
                  <Input
                    id="new-product-type"
                    value={newProduct.type}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, type: e.target.value })
                    }
                    placeholder="N/A"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2.5 text-base font-semibold text-foreground min-h-12">
                    <input
                      type="checkbox"
                      checked={newProduct.includesTaxes}
                      onChange={(e) =>
                        setNewProduct({
                          ...newProduct,
                          includesTaxes: e.target.checked,
                        })
                      }
                      className="size-5 accent-[var(--primary)]"
                    />
                    Aplica impuesto
                  </label>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                El costo lo pone la línea de la compra. El producto se crea
                cuando registres la compra, no antes: si cancelas, no queda nada
                a medias en el catálogo.
              </p>

              <Button type="button" onClick={confirmNewProduct}>
                <Plus aria-hidden="true" />
                Agregar a la compra
              </Button>
            </div>
          )}

          {/* Lines */}
          {lines.length > 0 && (
            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-canvas">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">
                      Producto
                    </th>
                    <th className="text-right px-2 py-2.5 font-semibold text-muted-foreground w-24">
                      Cant.
                    </th>
                    <th className="text-right px-2 py-2.5 font-semibold text-muted-foreground w-32">
                      Costo unit. $
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground w-28">
                      Subtotal
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key} className="border-t border-border">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-foreground truncate">
                          {line.name}
                        </p>
                        {line.newProduct ? (
                          <p className="text-meta font-semibold text-primary">
                            Producto nuevo · se crea al registrar
                          </p>
                        ) : (
                          !line.itemId && (
                            <p className="text-meta text-muted-foreground">
                              No afecta inventario
                            </p>
                          )
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            patchLine(line.key, {
                              quantity: Math.max(
                                1,
                                Math.round(Number(e.target.value) || 1),
                              ),
                            })
                          }
                          className="h-11 text-right"
                          data-money
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitCostUsd}
                          onChange={(e) =>
                            patchLine(line.key, {
                              unitCostUsd: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="h-11 text-right"
                          data-money
                        />
                      </td>
                      <td
                        className="px-3 py-2 text-right font-semibold text-foreground"
                        data-money
                      >
                        {formatPrice(line.quantity * line.unitCostUsd)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          aria-label={`Quitar ${line.name}`}
                          onClick={() =>
                            setLines((prev) => prev.filter((l) => l.key !== line.key))
                          }
                          className="tap-target inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Header fields */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchase-supplier">Proveedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="purchase-supplier">
                  <SelectValue placeholder="Sin proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin proveedor</SelectItem>
                  {suppliers.map((payee) => (
                    <SelectItem key={payee.id} value={payee.id}>
                      {payee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-account">Pagado desde</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="purchase-account">
                  <SelectValue placeholder="Sin cuenta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin cuenta</SelectItem>
                  {accounts
                    .filter((a) => a.active)
                    .map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-category">Categoría</Label>
              <Select value={effectiveCategoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="purchase-category">
                  <SelectValue placeholder="Compra de mercancía" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin categoría</SelectItem>
                  {merchandiseCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchase-date">Fecha</Label>
              <Input
                id="purchase-date"
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-invoice">Factura</Label>
              <Input
                id="purchase-invoice"
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                placeholder="0001234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-freight">Flete $</Label>
              <Input
                id="purchase-freight"
                type="number"
                min={0}
                step="0.01"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-credit">Crédito usado $</Label>
              <Input
                id="purchase-credit"
                type="number"
                min={0}
                step="0.01"
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-base text-foreground">
            <input
              type="checkbox"
              checked={prorate}
              onChange={(e) => setProrate(e.target.checked)}
              className="size-5 mt-0.5 accent-[var(--primary)]"
            />
            <span>
              <span className="font-semibold">
                Repartir el flete entre los productos según su valor.
              </span>
              <span className="block text-sm text-muted-foreground">
                Así el costo que queda guardado es lo que la mercancía realmente
                costó puesta en la tienda, no lo que decía la factura.
              </span>
            </span>
          </label>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchase-paidin">Pagado en</Label>
              <Select
                value={paidIn}
                onValueChange={(value) => setPaidIn(value === "BS" ? "BS" : "USD")}
              >
                <SelectTrigger id="purchase-paidin">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">Dólares</SelectItem>
                  <SelectItem value="BS">Bolívares</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2.5 text-base font-semibold text-foreground min-h-12">
                <input
                  type="checkbox"
                  checked={pending}
                  onChange={(e) => setPending(e.target.checked)}
                  className="size-5 accent-[var(--primary)]"
                />
                Queda a crédito (aún no se paga)
              </label>
              {pending && (
                <Input
                  type="date"
                  value={dueOn}
                  onChange={(e) => setDueOn(e.target.value)}
                  aria-label="Fecha de vencimiento"
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase-notes">Notas</Label>
            <Textarea
              id="purchase-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Totals */}
          <div className="rounded-xl bg-canvas p-4 space-y-1.5 text-base" data-money>
            <Row label="Mercancía" value={formatPrice(goods)} />
            {freightUsd > 0 && <Row label="Flete" value={formatPrice(freightUsd)} />}
            {creditUsd > 0 && (
              <Row label="Crédito del proveedor" value={`− ${formatPrice(creditUsd)}`} />
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-base font-bold text-foreground">Total a pagar</span>
              <span className="text-xl font-bold text-foreground">
                {formatPrice(total)}
              </span>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={lines.length === 0 || saving}
              onClick={handleSave}
            >
              <Truck aria-hidden="true" />
              Registrar compra
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
