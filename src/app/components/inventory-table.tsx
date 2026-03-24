import { Edit2, Trash2, Package, Plus, Clock, Minus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { format } from "date-fns";
import { useState } from "react";
import { useApp, InventoryItem } from "../context/app-context";

interface InventoryTableProps {
  items: InventoryItem[];
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onAddToCart?: (item: InventoryItem, quantity: number) => void;
  onViewHistory?: (item: InventoryItem) => void;
  showBuyingPrice?: boolean;
}

function InventoryTableRow({
  item,
  onEdit,
  onDelete,
  onAddToCart,
  onViewHistory,
  showBuyingPrice,
}: {
  item: InventoryItem;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onAddToCart?: (item: InventoryItem, quantity: number) => void;
  onViewHistory?: (item: InventoryItem) => void;
  showBuyingPrice?: boolean;
}) {
  const { formatPrice } = useApp();
  const [quantityToAdd, setQuantityToAdd] = useState(1);

  const unitLabel = { units: "u", kg: "kg", liters: "L" }[item.unit || "units"];

  const stockColor =
    item.quantity === 0
      ? "bg-red-50 text-red-700"
      : item.quantity < 10
        ? "bg-yellow-50 text-yellow-700"
        : "bg-green-50 text-green-700";

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-3 md:px-6 py-2 md:py-4">
        <div className="text-xs md:text-sm font-medium text-[#1A1A1A] leading-tight">
          {item.name}
        </div>
        {item.includesTaxes && (
          <span className="text-[9px] uppercase bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
            +IVA
          </span>
        )}
        <div className="md:hidden text-[10px] text-gray-400 font-mono mt-0.5 truncate max-w-[90px]">
          {item.barcode}
        </div>
      </td>

      <td className="hidden md:table-cell px-6 py-4">
        <span className="text-gray-600 font-mono text-sm">{item.barcode}</span>
      </td>

      <td className="px-3 md:px-6 py-2 md:py-4">
        <div className="text-xs md:text-sm font-medium text-[#1A1A1A]">
          {formatPrice(item.sellingPrice)}
        </div>
        {item.discount > 0 && (
          <div className="text-[10px] text-orange-600">-{item.discount}%</div>
        )}
      </td>

      {showBuyingPrice && (
        <td className="hidden md:table-cell px-6 py-4">
          <span className="text-gray-500 text-sm">
            {formatPrice(item.buyingPrice)}
          </span>
        </td>
      )}

      <td className="hidden md:table-cell px-6 py-4">
        <span className="text-gray-600 text-sm">
          {item.history?.[0]?.date
            ? format(new Date(item.history[0].date), "dd MMM yyyy")
            : "N/A"}
        </span>
      </td>

      <td className="px-3 md:px-6 py-2 md:py-4">
        <span
          className={`inline-flex items-center px-1.5 md:px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-medium ${stockColor}`}
        >
          {item.quantity}
          <span className="ml-0.5 opacity-70">{unitLabel}</span>
        </span>
      </td>

      <td className="px-2 md:px-6 py-2 md:py-4">
        <div className="flex items-center gap-1 md:gap-2">
          {onAddToCart && (
            <div className="flex items-center bg-gray-50 rounded-md border border-gray-200">
              <Input
                type="number"
                min="1"
                value={quantityToAdd}
                onChange={(e) =>
                  setQuantityToAdd(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="hidden md:block w-12 h-7 text-xs border-0 focus-visible:ring-0 bg-transparent text-right pr-1"
              />
              <Button
                size="sm"
                onClick={() => onAddToCart(item, quantityToAdd)}
                className="bg-[#2196F3] hover:bg-[#1976D2] text-white h-7 w-7 md:h-7 md:w-auto md:px-2 p-0 rounded-md"
                title="Agregar al Total"
                disabled={item.quantity === 0}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {onViewHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewHistory(item)}
              className="hidden md:flex text-gray-500 hover:text-gray-700 hover:bg-gray-100 h-7 w-7 p-0"
              title="Ver Historial"
            >
              <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Button>
          )}

          {onViewHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(item)}
              className="text-[#2196F3] hover:text-[#1976D2] hover:bg-blue-50 h-7 w-7 p-0"
              title="Editar"
            >
              <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Button>
          )}

          {onViewHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(item.id)}
              className="hidden md:flex text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Mobile card for search view (no edit/delete, just add to cart) ─────────────
function MobileSearchCard({
  item,
  onAddToCart,
}: {
  item: InventoryItem;
  onAddToCart: (item: InventoryItem, qty: number) => void;
}) {
  const { formatPrice } = useApp();
  const [qty, setQty] = useState(1);

  const stockColor =
    item.quantity === 0
      ? "text-red-600"
      : item.quantity < 10
        ? "text-yellow-600"
        : "text-green-600";

  const unitLabel = { units: "u", kg: "kg", liters: "L" }[item.unit || "units"];

  return (
    <div className="p-3 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#1A1A1A] leading-tight">
            {item.name}
          </p>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
            {item.barcode}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {item.includesTaxes && (
              <span className="text-[9px] uppercase bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
                +IVA
              </span>
            )}
            {item.discount > 0 && (
              <span className="text-[9px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded">
                -{item.discount}%
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-[#2196F3]">
            {formatPrice(item.sellingPrice)}
          </p>
          <p className={`text-xs font-medium ${stockColor}`}>
            {item.quantity} {unitLabel}
          </p>
        </div>
      </div>
      {/* Add to cart controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="px-3 py-1 text-sm font-medium min-w-[2rem] text-center">
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
          className="flex-1 bg-[#2196F3] hover:bg-[#1976D2] text-white h-8 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Agregar al Total
        </Button>
      </div>
    </div>
  );
}

export function InventoryTable({
  items,
  onEdit,
  onDelete,
  onAddToCart,
  onViewHistory,
  showBuyingPrice,
}: InventoryTableProps) {
  const isSearchMode = !!onAddToCart && !onViewHistory;

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-10 md:p-14 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
            <Package className="w-6 h-6 text-gray-400" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-gray-900 text-sm mb-1">
              No hay productos encontrados
            </h3>
            <p className="text-xs text-gray-500">
              Agrega productos o ajusta tu búsqueda
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
      {/* ── Mobile card list (search mode only) ── */}
      {isSearchMode && (
        <div className="md:hidden">
          {items.map((item) => (
            <MobileSearchCard
              key={item.id}
              item={item}
              onAddToCart={onAddToCart!}
            />
          ))}
        </div>
      )}

      {/* ── Desktop table (always) / mobile table for admin view ── */}
      <div
        className={`${isSearchMode ? "hidden md:block" : "block"} overflow-x-auto`}
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-3 md:px-6 py-2 md:py-4 text-xs md:text-sm text-gray-600 font-normal">
                Producto
              </th>
              <th className="hidden md:table-cell text-left px-6 py-4 text-sm text-gray-600 font-normal">
                Código
              </th>
              <th className="text-left px-3 md:px-6 py-2 md:py-4 text-xs md:text-sm text-gray-600 font-normal">
                P. Venta
              </th>
              {showBuyingPrice && (
                <th className="hidden md:table-cell text-left px-6 py-4 text-sm text-gray-600 font-normal">
                  P. Compra
                </th>
              )}
              <th className="hidden md:table-cell text-left px-6 py-4 text-sm text-gray-600 font-normal">
                Creación
              </th>
              <th className="text-left px-3 md:px-6 py-2 md:py-4 text-xs md:text-sm text-gray-600 font-normal">
                Stock
              </th>
              <th className="text-left px-2 md:px-6 py-2 md:py-4 text-xs md:text-sm text-gray-600 font-normal">
                Acc.
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((item) => (
              <InventoryTableRow
                key={item.id}
                item={item}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddToCart={onAddToCart}
                onViewHistory={onViewHistory}
                showBuyingPrice={showBuyingPrice}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      <div className="border-t border-gray-200 bg-gray-50 px-3 md:px-6 py-2 md:py-3">
        <div className="flex items-center justify-between text-xs md:text-sm">
          <span className="text-gray-600">
            Productos:{" "}
            <span className="font-medium text-[#1A1A1A]">{items.length}</span>
          </span>
          <span className="text-gray-600">
            Stock:{" "}
            <span className="font-medium text-[#1A1A1A]">
              {items.reduce((s, i) => s + i.quantity, 0)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
