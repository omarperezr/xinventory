import { Edit2, Trash2, Package, Plus, Clock } from "lucide-react";
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

  const unitLabel = {
    units: "u",
    kg: "kg",
    liters: "L",
  }[item.unit || "units"];

  const stockColor =
    item.quantity === 0
      ? "bg-red-50 text-red-700"
      : item.quantity < 10
        ? "bg-yellow-50 text-yellow-700"
        : "bg-green-50 text-green-700";

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Product name — always visible */}
      <td className="px-3 md:px-6 py-2 md:py-4">
        <div className="text-[#1A1A1A] font-medium text-xs md:text-sm leading-tight">
          {item.name}
        </div>
        {item.includesTaxes && (
          <span className="text-[9px] md:text-[10px] uppercase bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
            +IVA
          </span>
        )}
        {/* On mobile, show barcode inline under name */}
        <div className="md:hidden text-[10px] text-gray-400 font-mono mt-0.5 truncate max-w-[100px]">
          {item.barcode}
        </div>
      </td>

      {/* Barcode — desktop only */}
      <td className="hidden md:table-cell px-6 py-4">
        <div className="text-gray-600 font-mono text-sm">{item.barcode}</div>
      </td>

      {/* Selling price — always visible */}
      <td className="px-3 md:px-6 py-2 md:py-4">
        <div className="text-[#1A1A1A] font-medium text-xs md:text-sm">
          {formatPrice(item.sellingPrice)}
        </div>
        {/* On mobile: show discount inline */}
        {item.discount > 0 && (
          <div className="text-[10px] text-orange-600 md:hidden">
            -{item.discount}%
          </div>
        )}
      </td>

      {/* Buying price — desktop only, admin only */}
      {showBuyingPrice && (
        <td className="hidden md:table-cell px-6 py-4">
          <div className="text-gray-500 text-sm">
            {formatPrice(item.buyingPrice)}
          </div>
        </td>
      )}

      {/* Date created — desktop only */}
      <td className="hidden md:table-cell px-6 py-4">
        <div className="text-gray-600 text-sm">
          {item.history?.[0]?.date
            ? format(new Date(item.history[0].date), "dd MMM yyyy")
            : "N/A"}
        </div>
      </td>

      {/* Stock — always visible, compact on mobile */}
      <td className="px-3 md:px-6 py-2 md:py-4">
        <span
          className={`inline-flex items-center px-1.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-sm font-medium ${stockColor}`}
        >
          {item.quantity}
          <span className="ml-0.5 md:ml-1 opacity-70">{unitLabel}</span>
        </span>
      </td>

      {/* Actions */}
      <td className="px-2 md:px-6 py-2 md:py-4">
        <div className="flex items-center justify-end gap-1 md:gap-2">
          {/* Add to cart — always visible, compact on mobile */}
          {onAddToCart && (
            <div className="flex items-center bg-gray-50 rounded-md border border-gray-200">
              {/* Hide qty input on mobile, show only + button */}
              <Input
                type="number"
                min="1"
                value={quantityToAdd}
                onChange={(e) =>
                  setQuantityToAdd(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="hidden md:block w-14 h-7 text-xs border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-right pr-1"
              />
              <Button
                size="sm"
                onClick={() => onAddToCart(item, quantityToAdd)}
                className="bg-[#2196F3] hover:bg-[#1976D2] text-white h-7 w-7 p-0 rounded-md"
                title="Agregar al Total"
                disabled={item.quantity === 0}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* History — desktop only */}
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

          {/* Edit */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(item)}
            className="text-[#2196F3] hover:text-[#1976D2] hover:bg-blue-50 h-7 w-7 p-0"
            title="Editar"
          >
            <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Button>

          {/* Delete — desktop only */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(item.id)}
            className="hidden md:flex text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
            title="Eliminar"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Button>
        </div>
      </td>
    </tr>
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
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-10 md:p-16 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-100 rounded-full flex items-center justify-center">
            <Package
              className="w-6 h-6 md:w-8 md:h-8 text-gray-400"
              strokeWidth={1.5}
            />
          </div>
          <div>
            <h3 className="text-gray-900 text-sm md:text-base mb-1">
              No hay productos encontrados
            </h3>
            <p className="text-xs md:text-sm text-gray-500 font-light">
              Agrega productos o ajusta tu búsqueda
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {/* Product — always */}
              <th className="text-left px-3 md:px-6 py-2 md:py-4 text-xs md:text-sm text-gray-600 font-normal">
                Producto
              </th>
              {/* Barcode — desktop */}
              <th className="hidden md:table-cell text-left px-6 py-4 text-sm text-gray-600 font-normal">
                Código
              </th>
              {/* Selling price — always */}
              <th className="text-left px-3 md:px-6 py-2 md:py-4 text-xs md:text-sm text-gray-600 font-normal">
                P. Venta
              </th>
              {/* Buying price — desktop + admin only */}
              {showBuyingPrice && (
                <th className="hidden md:table-cell text-left px-6 py-4 text-sm text-gray-600 font-normal">
                  P. Compra
                </th>
              )}
              {/* Date — desktop */}
              <th className="hidden md:table-cell text-left px-6 py-4 text-sm text-gray-600 font-normal">
                Creación
              </th>
              {/* Stock — always */}
              <th className="text-left px-3 md:px-6 py-2 md:py-4 text-xs md:text-sm text-gray-600 font-normal">
                Stock
              </th>
              {/* Actions — always */}
              <th className="text-right px-2 md:px-6 py-2 md:py-4 text-xs md:text-sm text-gray-600 font-normal">
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

      {/* Summary Footer */}
      <div className="border-t border-gray-200 bg-gray-50 px-3 md:px-6 py-2 md:py-4">
        <div className="flex items-center justify-between text-xs md:text-sm">
          <div className="text-gray-600">
            Productos:{" "}
            <span className="text-[#1A1A1A] font-medium">{items.length}</span>
          </div>
          <div className="text-gray-600">
            Stock Total:{" "}
            <span className="text-[#1A1A1A] font-medium">
              {items.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
