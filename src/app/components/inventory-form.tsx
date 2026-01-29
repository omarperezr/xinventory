import { useState, useEffect } from "react";
import { Barcode, Edit, X } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { format } from "date-fns";

export interface InventoryItem {
  id: string;
  name: string;
  barcode: string;
  currency: string;
  sellingPrice: number;
  buyingPrice: number;
  dateAdded: Date;
  quantity: number;
  quantityUnit: string;
  includesTax: boolean;
}

interface InventoryFormProps {
  onSubmit: (item: Omit<InventoryItem, "id">) => void;
  defaultCurrency: string;
  editItem?: InventoryItem;
  onCancelEdit?: () => void;
}

export function InventoryForm({
  onSubmit,
  defaultCurrency,
  editItem,
  onCancelEdit,
}: InventoryFormProps) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [sellingPrice, setSellingPrice] = useState("");
  const [buyingPrice, setBuyingPrice] = useState("");
  const [dateAdded, setDateAdded] = useState<Date>(new Date());
  const [quantity, setQuantity] = useState(1);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [includesTax, setIncludesTax] = useState(false);
  const [quantityUnit, setQuantityUnit] = useState("ITEM");

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setBarcode(editItem.barcode);
      setCurrency(editItem.currency);
      setSellingPrice(editItem.sellingPrice.toString());
      setBuyingPrice(editItem.buyingPrice.toString());
      setDateAdded(new Date(editItem.dateAdded));
      setQuantity(editItem.quantity);
      setQuantityUnit(editItem.quantityUnit);
      setIncludesTax(editItem.includesTax);
    }
  }, [editItem]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !barcode || !sellingPrice || !buyingPrice) return;

    onSubmit({
      name,
      barcode,
      currency,
      sellingPrice: parseFloat(sellingPrice),
      buyingPrice: parseFloat(buyingPrice),
      dateAdded,
      quantity,
      includesTax,
      quantityUnit,
    });

    // Reset form
    if (!editItem) {
      setName("");
      setBarcode("");
      setCurrency(defaultCurrency);
      setSellingPrice("");
      setBuyingPrice("");
      setDateAdded(new Date());
      setQuantityUnit("ITEM");
      setQuantity(1);
      setIncludesTax(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[#1A1A1A] flex items-center gap-2">
          {editItem ? (
            <>
              <Edit className="w-5 h-5 text-[#2196F3]" strokeWidth={1.5} />
              Editar Producto
            </>
          ) : (
            "Agrega un Nuevo Producto"
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
              placeholder="Ingresa el nombre del producto"
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
                Codigo de Barra
              </span>
            </Label>
            <Input
              id="barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Ingresa o escanea el codigo de barra"
              className="border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
              required
            />
          </div>

          {/* Entry Price */}
          <div className="space-y-2">
            <Label
              htmlFor="price"
              className="text-sm text-gray-700 font-normal"
            >
              Precio de Compra
            </Label>
            <div className="flex gap-2">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-[110px] border-gray-300 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BS">BS (Bs)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
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
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label
              htmlFor="price"
              className="text-sm text-gray-700 font-normal"
            >
              Precio de Venta
            </Label>
            <div className="flex gap-2">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-[110px] border-gray-300 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BS">BS (Bs)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
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
          </div>

          {/* Date Added */}
          <div className="space-y-2">
            <Label className="text-sm text-gray-700 font-normal">
              Fecha de Adicion
            </Label>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-start text-left font-normal border border-gray-300 rounded-lg hover:bg-gray-50 px-3 py-2 bg-white"
                >
                  {dateAdded ? (
                    format(dateAdded, "PPP")
                  ) : (
                    <span>Selecciona una fecha</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 bg-white rounded-lg border border-gray-200"
                align="start"
              >
                <Calendar
                  mode="single"
                  selected={dateAdded}
                  onSelect={(date) => {
                    if (date) {
                      setDateAdded(date);
                      setIsCalendarOpen(false);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Stock Quantity */}

          <div className="space-y-2">
            <Label className="text-sm text-gray-700 font-normal">
              Cantidad en Stock
            </Label>

            <div className="flex gap-2">
              <Select value={quantityUnit} onValueChange={setQuantityUnit}>
                <SelectTrigger className="w-[110px] border-gray-300 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ITEM">unidad</SelectItem>
                  <SelectItem value="KG">Kg</SelectItem>
                  <SelectItem value="L">L</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-3">
                {quantityUnit === "ITEM" ? (
                  // setting quantity to integer for "ITEM" unit
                  <Input
                    id="quantity"
                    type="number"
                    step="1"
                    min="0"
                    value={Math.trunc(quantity)}
                    onChange={(e) => setQuantity(parseInt(e.target.value))}
                    placeholder="0"
                    className="flex-1 border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
                    required
                  />
                ) : (
                  <Input
                    id="quantity"
                    type="number"
                    step="0.1"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(parseFloat(e.target.value))}
                    placeholder="0"
                    className="flex-1 border-gray-300 rounded-lg focus:border-[#2196F3] focus:ring-[#2196F3]"
                    required
                  />
                )}
              </div>
            </div>
          </div>

          {/* Includes taxes */}
          <div className="space-y-2">
            <Label className="text-sm text-gray-700 font-normal">
              Incluye IVA
              <Checkbox
                checked={includesTax}
                onCheckedChange={(checked) =>
                  setIncludesTax(checked as boolean)
                }
                className="ml-2"
              />
            </Label>
          </div>
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
