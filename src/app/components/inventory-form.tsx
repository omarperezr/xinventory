import { useState, useEffect, ComponentType, ReactNode } from "react";
import {
  Barcode,
  Plus,
  Minus,
  X,
  FileText,
  ImagePlus,
  Loader2,
  Tag,
  Boxes,
  ChevronDown,
} from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  ADJUSTMENT_REASONS,
  InventoryItem,
  UnitType,
  formatMoneyValue,
  isReferenceLens,
  useApp,
} from "../context/app-context";
import { uploadImages } from "../services/image-utils";
import { toast } from "sonner";

interface InventoryFormProps {
  onSubmit: (
    item: Omit<InventoryItem, "id" | "history">,
    notes?: string,
    /** Why the stock number changed. Only sent when it actually did. */
    adjustmentReason?: string,
  ) => void | Promise<void>;
  editItem?: InventoryItem;
  onCancelEdit?: () => void;
}

// Prices for a product can only be entered in USD or bolivares.
type InputCurrency = "USD" | "BS";

export function InventoryForm({
  onSubmit,
  editItem,
  onCancelEdit,
}: InventoryFormProps) {
  const { bsToUsd, usdToBs, currency } = useApp();
  // Reference lenses (BCV/EUR) restate prices at a rate we do not treat as
  // the real worth of a bolivar. An admin reading a lens figure and retyping
  // it here would store a different price at the honest rate, so price entry
  // is disabled - same rule as the price edits in total-view and history-view.
  // Stock, notes and categorization stay editable: they move no money.
  const referenceLens = isReferenceLens(currency);
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");

  // Prices are stored as strings to allow empty input
  const [buyingPrice, setBuyingPrice] = useState("");
  const [buyingCurrency, setBuyingCurrency] = useState<InputCurrency>("USD");

  const [sellingPrice, setSellingPrice] = useState("");
  const [sellingCurrency, setSellingCurrency] = useState<InputCurrency>("USD");

  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<UnitType>("units");
  const [includesTaxes, setIncludesTaxes] = useState(false);
  const [discount, setDiscount] = useState("0"); // Discount percentage

  const [type, setType] = useState("N/A");
  const [brand, setBrand] = useState("GENERICO");
  const [images, setImages] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Persistent product notes (stored on the item, shown in detail view)
  const [itemNotes, setItemNotes] = useState("");

  // Notes for history (only for edits/adds)
  const [notes, setNotes] = useState("");

  // Editing the stock number here is an adjustment, never a purchase: no money
  // moves. It must say why, so write-offs, counts and thefts stay separable
  // from goods that were actually bought.
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const stockChanged = !!editItem && quantity !== editItem.quantity;

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setBarcode(editItem.barcode);
      // Canonical prices are always stored in USD
      setBuyingPrice(editItem.buyingPrice.toString());
      setBuyingCurrency("USD");
      setSellingPrice(editItem.sellingPrice.toString());
      setSellingCurrency("USD");

      setQuantity(editItem.quantity);
      setUnit(editItem.unit);
      setIncludesTaxes(editItem.includesTaxes);
      setDiscount(editItem.discount ? editItem.discount.toString() : "0");
      setType(editItem.type || "N/A");
      setBrand(editItem.brand || "GENERICO");
      setImages(editItem.images || []);
      setItemNotes(editItem.notes || "");
    }
  }, [editItem]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setCompressing(true);
    try {
      const uploaded = await uploadImages(files);
      setImages((prev) => [...prev, ...uploaded]);
    } catch (err) {
      console.error(err);
      toast.error("Error al subir imágenes");
    } finally {
      setCompressing(false);
      e.target.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Converts the entered price back to the canonical USD base. Prices can only
  // be entered in USD or bolivares; bolivares convert at the honest rate
  // (configurable in the admin panel), which is what those bolivares are
  // really worth regardless of the rate the supplier quoted at.
  const toUSD = (amount: number, currency: InputCurrency): number => {
    if (currency === "BS") return bsToUsd(amount);
    return amount; // USD
  };

  // Preview: the entered amount shown both in USD and its bolivar equivalent,
  // at the same honest rate used for storage.
  const getConversions = (amountStr: string, currency: InputCurrency) => {
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return null;

    const inUSD = toUSD(amount, currency);
    const inBS = usdToBs(inUSD);

    return (
      <div
        data-money
        className="text-sm text-muted-foreground mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
      >
        <span className={currency === "USD" ? "font-bold text-primary" : ""}>
          $ {formatMoneyValue(inUSD)}
        </span>
        <span aria-hidden="true" className="text-border-strong">
          ·
        </span>
        <span className={currency === "BS" ? "font-bold text-primary" : ""}>
          Bs {formatMoneyValue(inBS)}
        </span>
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !barcode || !sellingPrice || !buyingPrice) {
      // Disabled fields skip the browser's `required` check, so under a
      // reference lens an empty price lands here - say why instead of
      // ignoring the click.
      if (referenceLens && (!sellingPrice || !buyingPrice)) {
        toast.error(
          "Estás viendo una tasa de referencia. Cambia a USD o Bs para editar precios.",
        );
      }
      return;
    }
    if (submitting) return;

    // Convert inputs to USD for storage - the canonical base price.
    // Allow more than two decimals on input but round to cents for storage.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const rawBuying = toUSD(parseFloat(buyingPrice), buyingCurrency);
    const rawSelling = toUSD(parseFloat(sellingPrice), sellingCurrency);

    // A non-numeric entry, or a zero/absent exchange rate, would otherwise
    // store NaN/Infinity as the canonical price.
    if (!Number.isFinite(rawBuying) || !Number.isFinite(rawSelling)) {
      toast.error(
        "Precio inválido. Verifica los montos y las tasas de cambio.",
      );
      return;
    }
    if (rawBuying < 0 || rawSelling < 0) {
      toast.error("Los precios no pueden ser negativos");
      return;
    }

    // Belt over the disabled fields: the lens can be switched while the form
    // is open, and a pending Bs amount would then be booked from a figure the
    // admin read at a reference rate. Typed dollars are unambiguous.
    if (referenceLens && (buyingCurrency === "BS" || sellingCurrency === "BS")) {
      toast.error(
        "Estás viendo una tasa de referencia. Cambia a USD o Bs para editar precios.",
      );
      return;
    }

    const finalBuyingPrice = round2(rawBuying);
    const finalSellingPrice = round2(rawSelling);

    if (stockChanged && !adjustmentReason) {
      toast.error(
        "Indica el motivo del ajuste de stock. Si llegó mercancía comprada, regístrala como compra en Finanzas.",
      );
      return;
    }

    setSubmitting(true);
    let succeeded = false;
    try {
      await onSubmit(
        {
          name,
          barcode,
          buyingPrice: finalBuyingPrice,
          sellingPrice: finalSellingPrice,
          quantity,
          unit,
          includesTaxes,
          currency: "USD", // System base currency
          discount: parseFloat(discount) || 0,
          type: type || "N/A",
          brand: brand || "GENERICO",
          images,
          notes: itemNotes,
        },
        notes,
        stockChanged ? adjustmentReason : undefined,
      );
      succeeded = true;
    } catch (err) {
      // Without this the rejection was swallowed and the seller was told
      // nothing - on flaky mobile data that is the common path.
      console.error("Error al guardar el producto", err);
      toast.error("No se pudo guardar el producto. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }

    // Keep the entered values on failure so nothing has to be retyped.
    if (!succeeded) return;

    // Reset form
    if (!editItem) {
      setName("");
      setBarcode("");
      setBuyingPrice("");
      setSellingPrice("");
      setQuantity(1);
      setUnit("units");
      setIncludesTaxes(false);
      setDiscount("0");
      setType("N/A");
      setBrand("GENERICO");
      setImages([]);
      setItemNotes("");
      setNotes("");
      setBuyingCurrency("USD");
      setSellingCurrency("USD");
    }
  };

  const incrementQuantity = () => setQuantity((prev) => prev + 1);
  const decrementQuantity = () => setQuantity((prev) => Math.max(0, prev - 1));

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <FormSection icon={Tag} title="Identificación">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label htmlFor="name">
              Nombre del producto
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Harina Pan"
              required
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="barcode"
            >
              <span className="flex items-center gap-2">
                <Barcode
                  className="size-4 text-primary"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                Código de barras
              </span>
            </Label>
            <Input
              id="barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Escanear o ingresar código"
              required
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        icon={() => (
          <span
            aria-hidden="true"
            className="text-primary font-bold size-4 flex items-center justify-center"
          >
            $
          </span>
        )}
        title="Precios"
      >
        {referenceLens && (
          <p className="rounded-lg bg-pending-soft px-3.5 py-2.5 text-sm text-pending">
            Estás viendo una tasa de referencia. Cambia a USD o Bs para editar
            precios.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label
              htmlFor="buyingPrice"
            >
              Precio de compra
            </Label>
            <div className="flex gap-2">
              <Select
                value={buyingCurrency}
                onValueChange={(v: InputCurrency) => setBuyingCurrency(v)}
                disabled={referenceLens}
              >
                <SelectTrigger aria-label="Moneda del precio de compra" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="BS">Bs</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="buyingPrice"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={buyingPrice}
                onChange={(e) => setBuyingPrice(e.target.value)}
                placeholder="0.00"
                className="flex-1 font-semibold"
                data-money
                disabled={referenceLens}
                required
              />
            </div>
            {getConversions(buyingPrice, buyingCurrency)}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="sellingPrice"
            >
              Precio de venta
            </Label>
            <div className="flex gap-2">
              <Select
                value={sellingCurrency}
                onValueChange={(v: InputCurrency) => setSellingCurrency(v)}
                disabled={referenceLens}
              >
                <SelectTrigger aria-label="Moneda del precio de venta" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="BS">Bs</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="sellingPrice"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0.00"
                className="flex-1 font-semibold"
                data-money
                disabled={referenceLens}
                required
              />
            </div>
            {getConversions(sellingPrice, sellingCurrency)}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="discount"
            >
              Descuento (%)
            </Label>
            <div className="relative">
              <Input
                id="discount"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                className="pr-9"
                data-money
              />
              <span
                aria-hidden="true"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold"
              >
                %
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 md:pt-8">
            <Checkbox
              id="includesTaxes"
              checked={includesTaxes}
              onCheckedChange={(checked) =>
                setIncludesTaxes(checked as boolean)
              }
            />
            <Label
              htmlFor="includesTaxes"
            >
              Incluye impuestos
            </Label>
          </div>
        </div>
      </FormSection>

      <FormSection icon={Boxes} title="Inventario y categorización">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label htmlFor="quantity">
              Cantidad en stock
            </Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={decrementQuantity}
                aria-label="Disminuir cantidad en stock"
                className="hover:border-primary"
              >
                <Minus className="size-5" strokeWidth={1.5} aria-hidden="true" />
              </Button>
              <Input
                id="quantity"
                type="number"
                inputMode="numeric"
                min="0"
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(0, parseInt(e.target.value) || 0))
                }
                className="flex-1 text-center font-semibold"
                data-money
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={incrementQuantity}
                aria-label="Aumentar cantidad en stock"
                className="hover:border-primary"
              >
                <Plus className="size-5" strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </div>
            {stockChanged && (
              <div className="space-y-2 rounded-lg border border-pending-strong bg-pending-soft p-3.5">
                <Label htmlFor="adjustment-reason">
                  Motivo del ajuste
                </Label>
                <Select
                  value={adjustmentReason}
                  onValueChange={setAdjustmentReason}
                >
                  <SelectTrigger id="adjustment-reason">
                    <SelectValue placeholder="¿Por qué cambia el stock?" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADJUSTMENT_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-pending leading-snug">
                  Esto es un ajuste: cambia el stock sin mover dinero. Si llegó
                  mercancía que compraste, regístrala como <strong>compra</strong>{" "}
                  en Finanzas para que quede el costo, el proveedor y el pago.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit">
              Unidad de medida
            </Label>
            <Select
              value={unit}
              onValueChange={(val: UnitType) => setUnit(val)}
            >
              <SelectTrigger id="unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="units">Unidades</SelectItem>
                <SelectItem value="kg">Kilogramos (kg)</SelectItem>
                <SelectItem value="liters">Litros (L)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="brand"
            >
              Marca
            </Label>
            <Input
              id="brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="GENERICO"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">
              Tipo o categoría
            </Label>
            <Input
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="N/A"
            />
          </div>
        </div>
      </FormSection>

      <CollapsibleFormSection
        icon={ImagePlus}
        title="Imágenes del producto"
        summary={images.length > 0 ? `${images.length} foto(s)` : "Ninguna"}
        defaultOpen={images.length > 0}
      >
        <div className="flex flex-wrap gap-3">
          {images.map((img, i) => (
            <div
              key={i}
              className="relative w-20 h-20 rounded-lg overflow-hidden border border-border"
            >
              <img
                src={img}
                alt={`Imagen ${i + 1}`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label={`Eliminar imagen ${i + 1}`}
                className="tap-target absolute top-0.5 right-0.5 inline-flex items-center justify-center h-7 w-7 bg-black/60 text-white rounded-full"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <label className="w-20 h-20 rounded-lg border border-dashed border-border-strong flex items-center justify-center cursor-pointer text-muted-foreground hover:border-primary hover:text-primary">
            <input
              type="file"
              accept="image/*"
              multiple
              aria-label="Agregar imágenes del producto"
              onChange={handleImageSelect}
              className="hidden"
            />
            {compressing ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-5" aria-hidden="true" />
            )}
          </label>
        </div>
      </CollapsibleFormSection>

      <CollapsibleFormSection
        icon={FileText}
        title="Notas"
        summary={itemNotes.trim() ? "Con notas" : "Ninguna"}
        defaultOpen={Boolean(itemNotes.trim())}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <Label
              htmlFor="itemNotes"
            >
              Notas del producto
            </Label>
            <Textarea
              id="itemNotes"
              placeholder="Información adicional del producto (se muestra en los detalles)..."
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value)}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="notes"
            >
              Notas del cambio (historial)
            </Label>
            <Textarea
              id="notes"
              placeholder="Explique la razón del cambio de stock o modificación..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
            />
          </div>
        </div>
      </CollapsibleFormSection>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-border -mx-5 px-5 sm:-mx-6 sm:px-6 sticky bottom-0 bg-white pb-1">
        {editItem && onCancelEdit && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancelEdit}
          >
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          disabled={submitting || compressing}
          className="px-8 disabled:opacity-60"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              Guardando…
            </span>
          ) : editItem ? (
            "Actualizar producto"
          ) : (
            "Agregar producto"
          )}
        </Button>
      </div>
    </form>
  );
}

function FormSection({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * A section the seller opens only if they need it.
 *
 * Photos and notes are optional on every product, but they used to sit open
 * below the required fields, so the common case - name, price, stock, save -
 * meant scrolling past two blocks nobody was filling in. They start open when
 * the product already has content in them, because then they are not optional
 * detail any more, they are data the seller came to edit.
 */
function CollapsibleFormSection({
  icon: Icon,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = `section-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full min-h-11 items-center gap-2 text-base font-bold text-foreground hover:text-primary"
      >
        <Icon className="size-4 text-primary" aria-hidden="true" />
        {title}
        <span className="ml-auto flex items-center gap-1.5 text-sm font-normal text-muted-foreground">
          {!open && summary}
          <ChevronDown
            className={`size-5 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>
      <div id={contentId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
