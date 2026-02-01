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
}

export function InventoryForm({
  onSubmit,
  editItem,
  onCancelEdit,
}: InventoryFormProps) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [buyingPrice, setBuyingPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState(""); // Formerly 'price'
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<UnitType>("units");
  const [includesTaxes, setIncludesTaxes] = useState(false);
  const [, setDateAdded] = useState<Date>(new Date());

  // Notes for history (only for edits/adds)
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setBarcode(editItem.barcode);
      setBuyingPrice(editItem.buyingPrice.toString());
      setSellingPrice(editItem.sellingPrice.toString());
      setQuantity(editItem.quantity);
      setUnit(editItem.unit);
      setIncludesTaxes(editItem.includesTaxes);
      // We don't set dateAdded from editItem because that's "creation date",
      // but maybe we want to preserve it?
      // The prompt says "on the day x new product was brought into the system".
      // Usually dateAdded is immutable.
      // I'll leave it as "Date Added" for new items, but hide/disable for edits?
      // For now, I'll keep it simple.
    }
  }, [editItem]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !barcode || !sellingPrice || !buyingPrice) return;

    onSubmit(
      {
        name,
        barcode,
        buyingPrice: parseFloat(buyingPrice),
        sellingPrice: parseFloat(sellingPrice),
        quantity,
        unit,
        includesTaxes,
        currency: "BS", // Always BS as base
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
      setDateAdded(new Date());
      setNotes("");
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
              Precio de Compra (Bs)
            </Label>
            <Input
              id="buyingPrice"
              type="number"
              step="0.01"
              min="0"
              value={buyingPrice}
              onChange={(e) => setBuyingPrice(e.target.value)}
              placeholder="0.00"
              className="border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
              required
            />
          </div>

          {/* Selling Price */}
          <div className="space-y-2">
            <Label
              htmlFor="sellingPrice"
              className="text-sm text-gray-700 font-normal"
            >
              Precio de Venta (Bs)
            </Label>
            <Input
              id="sellingPrice"
              type="number"
              step="0.01"
              min="0"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="0.00"
              className="border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
              required
            />
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
