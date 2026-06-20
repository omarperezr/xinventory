import { useState } from "react";
import { Plus, Minus, Package, MessageCircle } from "lucide-react";
import { Button } from "./ui/button";
import { useApp, InventoryItem } from "../context/app-context";
import { shareProductToWhatsApp } from "../services/whatsapp";

interface ProductCardProps {
  item: InventoryItem;
  onAddToCart?: (item: InventoryItem, qty: number) => void;
}

export function ProductCard({ item, onAddToCart }: ProductCardProps) {
  const { formatPrice } = useApp();
  const [qty, setQty] = useState(1);

  const unitLabel = { units: "u", kg: "kg", liters: "L" }[item.unit || "units"];

  const stockColor =
    item.quantity === 0
      ? "text-red-600 bg-red-50"
      : item.quantity < 10
        ? "text-amber-600 bg-amber-50"
        : "text-emerald-700 bg-emerald-50";

  const cover = item.images?.[0];

  return (
    <div className="group flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden transition-shadow hover:shadow-lg">
      <div className="relative aspect-square bg-gray-100 overflow-hidden">
        {cover ? (
          <img
            src={cover}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
          </div>
        )}
        <button
          type="button"
          onClick={() => shareProductToWhatsApp(item, formatPrice)}
          title="Compartir por WhatsApp"
          className="absolute top-2 right-2 bg-white/90 backdrop-blur rounded-full p-2 shadow-sm hover:bg-emerald-500 hover:text-white transition-colors"
        >
          <MessageCircle className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 p-3 flex-1">
        <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">
          {item.name}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide bg-gray-900 text-white px-1.5 py-0.5 rounded">
            {item.brand}
          </span>
          <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
            {item.type}
          </span>
          {item.includesTaxes && (
            <span className="text-[10px] uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
              +IVA
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-1">
          <span className="text-base font-bold text-gray-900">
            {formatPrice(item.sellingPrice)}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stockColor}`}>
            {item.quantity} {unitLabel}
          </span>
        </div>

        {onAddToCart && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="px-2.5 text-sm font-medium min-w-[1.75rem] text-center">
                {qty}
              </span>
              <button
                onClick={() => setQty((q) => q + 1)}
                className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
            <Button
              size="sm"
              onClick={() => onAddToCart(item, qty)}
              disabled={item.quantity === 0}
              className="flex-1 bg-gray-900 hover:bg-gray-700 text-white h-8 text-xs rounded-lg"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Agregar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
