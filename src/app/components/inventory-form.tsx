import { useState, useEffect } from "react";
import { Barcode, Plus, Minus, Edit, X, FileText } from "lucide-react";
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
import { InventoryItem, UnitType } from "../context/app-context";

interface InventoryFormProps {
  onSubmit: (
    item: Omit<InventoryItem, "id" | "history">,
    notes?: string,
  ) => void;
  editItem?: InventoryItem;
  onCancelEdit?: () => void;
  rates: { USD: number; EUR: number };
}

type InputCurrency = "BS" | "USD" | "EUR";

export function InventoryForm({
  onSubmit,
  editItem,
  onCancelEdit,
  rates,
}: InventoryFormProps) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");

  // Prices are stored as strings to allow empty input
  const [buyingPrice, setBuyingPrice] = useState("");
  const [buyingCurrency, setBuyingCurrency] = useState<InputCurrency>("BS");

  const [sellingPrice, setSellingPrice] = useState("");
  const [sellingCurrency, setSellingCurrency] = useState<InputCurrency>("BS");

  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<UnitType>("units");
  const [includesTaxes, setIncludesTaxes] = useState(false);
  const [discount, setDiscount] = useState("0"); // Discount percentage

  // Notes for history (only for edits/adds)
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setBarcode(editItem.barcode);
      // Edit item prices are always in BS
      setBuyingPrice(editItem.buyingPrice.toString());
      setBuyingCurrency("BS");
      setSellingPrice(editItem.sellingPrice.toString());
      setSellingCurrency("BS");

      setQuantity(editItem.quantity);
      setUnit(editItem.unit);
      setIncludesTaxes(editItem.includesTaxes);
      setDiscount(editItem.discount ? editItem.discount.toString() : "0");
    }
  }, [editItem]);

  // Helper to convert any input to BS
  const toBS = (amount: number, currency: InputCurrency): number => {
    if (currency === "BS") return amount;
    if (currency === "USD") return amount * rates.USD;
    if (currency === "EUR") return amount * rates.EUR;
    return amount;
  };

  // Helper to display conversions
  const getConversions = (amountStr: string, currency: InputCurrency) => {
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return null;

    const amountInBs = toBS(amount, currency);

    const inUSD = amountInBs / rates.USD;
    const inEUR = amountInBs / rates.EUR;
    const inBS = amountInBs;

    return (
      <div className="text-xs text-gray-500 mt-1 flex gap-2">
        <span className={currency === "BS" ? "font-bold text-[#2196F3]" : ""}>
          Bs {inBS.toFixed(2)}
        </span>
        <span className="text-gray-300">|</span>
        <span className={currency === "USD" ? "font-bold text-[#2196F3]" : ""}>
          $ {inUSD.toFixed(2)}
        </span>
        <span className="text-gray-300">|</span>
        <span className={currency === "EUR" ? "font-bold text-[#2196F3]" : ""}>
          € {inEUR.toFixed(2)}
        </span>
      </div>
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !barcode || !sellingPrice || !buyingPrice) return;

    // Convert inputs to BS for storage
    const finalBuyingPrice = toBS(parseFloat(buyingPrice), buyingCurrency);
    const finalSellingPrice = toBS(parseFloat(sellingPrice), sellingCurrency);

    onSubmit(
      {
        name,
        barcode,
        buyingPrice: finalBuyingPrice,
        sellingPrice: finalSellingPrice,
        quantity,
        unit,
        includesTaxes,
        currency: "BS", // System base currency
        discount: parseFloat(discount) || 0,
      },
      notes,
    );

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
      setNotes("");
      // Keep currencies as is for convenience? Or reset?
      // Resetting to BS is safer
      setBuyingCurrency("BS");
      setSellingCurrency("BS");
    }
  };

  const incrementQuantity = () => setQuantity((prev) => prev + 1);
  const decrementQuantity = () => setQuantity((prev) => Math.max(0, prev - 1));

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[#1A1A1A] flex items-center gap-2 font-medium text-lg">
          {editItem ? (
            <>
              <Edit className="w-5 h-5 text-[#2196F3]" strokeWidth={1.5} />
              Editar Producto
            </>
          ) : (
            "Agregar Nuevo Producto"
          )}
        </h2>
        {editItem && onCancelEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </Button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Product Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm text-gray-700 font-normal">
              Nombre del Producto
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Harina Pan"
              className="border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
              required
            />
          </div>

          {/* Barcode */}
          <div className="space-y-2">
            <Label
              htmlFor="barcode"
              className="text-sm text-gray-700 font-normal"
            >
              <span className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-[#2196F3]" strokeWidth={1.5} />
                Código de Barras
              </span>
            </Label>
            <Input
              id="barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Escanear o ingresar código"
              className="border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
              required
            />
          </div>

          {/* Buying Price */}
          <div className="space-y-2">
            <Label
              htmlFor="buyingPrice"
              className="text-sm text-gray-700 font-normal"
            >
              Precio de Compra
            </Label>
            <div className="flex gap-2">
              <Select
                value={buyingCurrency}
                onValueChange={(v: InputCurrency) => setBuyingCurrency(v)}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BS">Bs</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="buyingPrice"
                type="number"
                step="0.01"
                min="0"
                value={buyingPrice}
                onChange={(e) => setBuyingPrice(e.target.value)}
                placeholder="0.00"
                className="flex-1 border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
                required
              />
            </div>
            {getConversions(buyingPrice, buyingCurrency)}
          </div>

          {/* Selling Price */}
          <div className="space-y-2">
            <Label
              htmlFor="sellingPrice"
              className="text-sm text-gray-700 font-normal"
            >
              Precio de Venta
            </Label>
            <div className="flex gap-2">
              <Select
                value={sellingCurrency}
                onValueChange={(v: InputCurrency) => setSellingCurrency(v)}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BS">Bs</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="sellingPrice"
                type="number"
                step="0.01"
                min="0"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0.00"
                className="flex-1 border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
                required
              />
            </div>
            {getConversions(sellingPrice, sellingCurrency)}
          </div>

          {/* Discount */}
          <div className="space-y-2">
            <Label
              htmlFor="discount"
              className="text-sm text-gray-700 font-normal"
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
                className="border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                %
              </span>
            </div>
          </div>

          {/* Stock Quantity */}
          <div className="space-y-2">
            <Label className="text-sm text-gray-700 font-normal">
              Cantidad en Stock
            </Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={decrementQuantity}
                className="h-10 w-10 rounded-lg border-gray-300 hover:bg-gray-50 hover:border-[#2196F3]"
              >
                <Minus className="h-4 w-4" strokeWidth={1.5} />
              </Button>
              <Input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(0, parseInt(e.target.value) || 0))
                }
                className="flex-1 text-center border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={incrementQuantity}
                className="h-10 w-10 rounded-lg border-gray-300 hover:bg-gray-50 hover:border-[#2196F3]"
              >
                <Plus className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          </div>

          {/* Unit Type */}
          <div className="space-y-2">
            <Label htmlFor="unit" className="text-sm text-gray-700 font-normal">
              Unidad de Medida
            </Label>
            <Select
              value={unit}
              onValueChange={(val: UnitType) => setUnit(val)}
            >
              <SelectTrigger className="w-full border-gray-300 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="units">Unidades (Items)</SelectItem>
                <SelectItem value="kg">Kilogramos (Kg)</SelectItem>
                <SelectItem value="liters">Litros (L)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Includes Taxes Checkbox */}
          <div className="flex items-center space-x-2 pt-8">
            <Checkbox
              id="includesTaxes"
              checked={includesTaxes}
              onCheckedChange={(checked) =>
                setIncludesTaxes(checked as boolean)
              }
            />
            <Label
              htmlFor="includesTaxes"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Incluye Impuestos
            </Label>
          </div>
        </div>

        {/* Notes Section */}
        <div className="space-y-2 pt-2">
          <Label
            htmlFor="notes"
            className="text-sm text-gray-700 font-normal flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Notas del cambio (Historial)
          </Label>
          <Textarea
            id="notes"
            placeholder="Explique la razón del cambio de stock o modificación..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="resize-none"
          />
        </div>

        <div className="flex justify-end pt-4">
          <Button
            type="submit"
            className="bg-[#2196F3] hover:bg-[#1976D2] text-white rounded-lg px-8 shadow-sm"
          >
            {editItem ? "Actualizar Producto" : "Agregar Producto"}
          </Button>
        </div>
      </form>
    </div>
  );
}
