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
  searchView?: boolean;
}

function InventoryTableRow({
  item,
  onEdit,
  onDelete,
  onAddToCart,
  onViewHistory,
  showBuyingPrice,
  searchView = false,
}: {
  item: InventoryItem;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onAddToCart?: (item: InventoryItem, quantity: number) => void;
  onViewHistory?: (item: InventoryItem) => void;
  showBuyingPrice?: boolean;
  searchView?: boolean;
}) {
  const { formatPrice } = useApp();
  const [quantityToAdd, setQuantityToAdd] = useState(1);

  const unitLabel = {
    units: "unidades",
    kg: "kg",
    liters: "L",
  }[item.unit || "units"];

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-4">
        <div className="text-[#1A1A1A] font-medium">{item.name}</div>
        {item.includesTaxes && (
          <span className="text-[10px] uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-2">
            Con Impuestos
          </span>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="text-gray-600 font-mono text-sm">{item.barcode}</div>
      </td>
      <td className="px-6 py-4">
        <div className="text-[#1A1A1A] font-medium">
          {formatPrice(item.sellingPrice)}
        </div>
      </td>
      {showBuyingPrice && (
        <td className="px-6 py-4">
          <div className="text-gray-500">{formatPrice(item.buyingPrice)}</div>
        </td>
      )}
      <td className="px-6 py-4">
        <div className="text-gray-600 text-sm">
          {/* dateAdded is stored as string in JSON but Date in logic, handle safely */}
          {item.history?.[0]?.date
            ? format(new Date(item.history[0].date), "dd MMM yyyy")
            : "N/A"}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="inline-flex items-center gap-2">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
              item.quantity === 0
                ? "bg-red-50 text-red-700"
                : item.quantity < 10
                  ? "bg-yellow-50 text-yellow-700"
                  : "bg-green-50 text-green-700"
            }`}
          >
            {item.quantity} {unitLabel}
          </span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          {onAddToCart && (
            <div className="flex items-center mr-2 bg-gray-50 p-1 rounded-md border border-gray-200">
              <Input
                type="number"
                min="1"
                // Max is item.quantity, but user might want to try adding more to see error
                value={quantityToAdd}
                onChange={(e) =>
                  setQuantityToAdd(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="w-16 h-8 text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-right pr-2"
              />
              <Button
                size="sm"
                onClick={() => onAddToCart(item, quantityToAdd)}
                className="bg-[#2196F3] hover:bg-[#1976D2] text-white h-7 w-7 p-0 rounded-md"
                title="Agregar al Total"
                disabled={item.quantity === 0}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}

          {onViewHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewHistory(item)}
              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              title="Ver Historial"
            >
              <Clock className="w-4 h-4" strokeWidth={1.5} />
            </Button>
          )}

          {!searchView && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(item)}
                className="text-[#2196F3] hover:text-[#1976D2] hover:bg-blue-50"
                title="Editar"
              >
                <Edit2 className="w-4 h-4" strokeWidth={1.5} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(item.id)}
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                title="Eliminar"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </Button>
            </>
          )}
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
  searchView = false,
}: InventoryTableProps) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
            <Package className="w-8 h-8 text-gray-400" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-gray-900 mb-1">No hay productos encontrados</h3>
            <p className="text-sm text-gray-500 font-light">
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
              <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                Producto
              </th>
              <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                Código
              </th>
              <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                Precio Venta
              </th>
              {showBuyingPrice && (
                <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                  Precio Compra
                </th>
              )}
              <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                Fecha Creación
              </th>
              <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                Stock
              </th>
              {!searchView ? (
                <th className="text-left px-6 py-4 text-sm text-gray-600 font-normal">
                  Acciones
                </th>
              ) : (
                <th className="text-left px-4 py-4 text-sm text-gray-600 font-normal">
                  Agregar al Carrito
                </th>
              )}
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
                searchView={searchView}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600">
            Total Productos:{" "}
            <span className="text-[#1A1A1A] font-medium">{items.length}</span>
          </div>
          <div className="text-gray-600">
            Total Stock:{" "}
            <span className="text-[#1A1A1A] font-medium">
              {items.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
