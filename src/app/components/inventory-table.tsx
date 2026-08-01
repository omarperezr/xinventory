import { Edit2, Trash2, Package, Clock, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { format } from "date-fns";
import { useState } from "react";
import { ImageCarousel } from "./product-card";
import { shareImageToWhatsApp } from "../services/whatsapp";
import { useApp, InventoryItem } from "../context/app-context";

// First photo as a tappable thumbnail; opens the swipeable photo viewer.
// Items without photos keep a placeholder so rows stay aligned.
function ProductThumb({
  item,
  onView,
  className = "w-14 h-14",
}: {
  item: InventoryItem;
  onView?: (item: InventoryItem) => void;
  className?: string;
}) {
  const images = item.images || [];
  if (images.length === 0 || !onView) {
    return (
      <div
        className={`${className} rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0`}
      >
        <Package className="w-5 h-5 text-gray-400" strokeWidth={1.5} aria-hidden="true" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onView(item)}
      aria-label={`Ver fotos de ${item.name}`}
      className={`${className} relative rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 focus-visible:ring-2 focus-visible:ring-primary`}
    >
      <img
        src={images[0]}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
      />
      {images.length > 1 && (
        <span className="absolute bottom-0.5 right-0.5 text-meta font-medium bg-black/60 text-white px-1 rounded">
          {images.length}
        </span>
      )}
    </button>
  );
}

interface InventoryTableProps {
  items: InventoryItem[];
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void | Promise<void>;
  onViewHistory?: (item: InventoryItem) => void;
  showBuyingPrice?: boolean;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

function InventoryTableRow({
  item,
  onEdit,
  onDelete,
  onViewHistory,
  onViewPhotos,
  showBuyingPrice,
  selectMode,
  selected,
  onToggleSelect,
}: {
  item: InventoryItem;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void | Promise<void>;
  onViewHistory?: (item: InventoryItem) => void;
  onViewPhotos?: (item: InventoryItem) => void;
  showBuyingPrice?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const { formatPrice } = useApp();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  };

  const unitLabel = { units: "u", kg: "kg", liters: "L" }[item.unit || "units"];

  const stockColor =
    item.quantity === 0
      ? "bg-red-50 text-red-700"
      : item.quantity < 10
        ? "bg-yellow-50 text-yellow-700"
        : "bg-green-50 text-green-700";

  const margin =
    item.sellingPrice > 0
      ? ((item.sellingPrice - item.buyingPrice) / item.sellingPrice) * 100
      : 0;
  const marginColor =
    margin <= 0
      ? "text-red-600"
      : margin < 15
        ? "text-yellow-600"
        : "text-green-600";

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {selectMode && (
        <td className="px-2 md:px-4 py-2 md:py-4">
          <Checkbox
            checked={!!selected}
            onCheckedChange={() => onToggleSelect?.(item.id)}
          />
        </td>
      )}
      <td className="px-3 md:px-6 py-2 md:py-4">
        <div className="flex items-center gap-3">
          <ProductThumb item={item} onView={onViewPhotos} className="w-10 h-10" />
          <div className="min-w-0">
            <div className="text-xs md:text-sm font-medium text-gray-900 leading-tight">
              {item.name}
            </div>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {item.includesTaxes && (
                <span className="text-meta uppercase bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
                  +IVA
                </span>
              )}
              <span className="md:hidden text-meta uppercase bg-gray-100 text-gray-600 px-1 py-0.5 rounded truncate max-w-[80px]">
                {item.brand}
              </span>
            </div>
            <div className="md:hidden text-meta text-gray-500 font-mono mt-0.5 truncate max-w-[90px]">
              {item.barcode}
            </div>
          </div>
        </div>
      </td>

      <td className="hidden md:table-cell px-6 py-4">
        <span className="text-gray-600 font-mono text-sm">{item.barcode}</span>
      </td>

      <td className="hidden md:table-cell px-6 py-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-gray-700 truncate max-w-[110px]">
            {item.brand}
          </span>
          <span className="text-meta text-gray-500 uppercase truncate max-w-[110px]">
            {item.type}
          </span>
        </div>
      </td>

      <td className="px-3 md:px-6 py-2 md:py-4">
        <div className="text-xs md:text-sm font-medium text-gray-900">
          {formatPrice(item.sellingPrice)}
        </div>
        {item.discount > 0 && (
          <div className="text-meta text-orange-600">-{item.discount}%</div>
        )}
      </td>

      {showBuyingPrice && (
        <td className="hidden md:table-cell px-6 py-4">
          <span className="text-gray-500 text-sm">
            {formatPrice(item.buyingPrice)}
          </span>
        </td>
      )}

      {showBuyingPrice && (
        <td className="hidden md:table-cell px-6 py-4">
          <span className={`text-sm font-medium ${marginColor}`}>
            {margin.toFixed(0)}%
          </span>
        </td>
      )}

      <td className="hidden md:table-cell px-6 py-4">
        <span className="text-gray-600 text-sm">
          {item.updatedAt
            ? format(new Date(item.updatedAt), "dd MMM yyyy")
            : "N/A"}
        </span>
      </td>

      <td className="px-3 md:px-6 py-2 md:py-4">
        <span
          className={`inline-flex items-center px-1.5 md:px-2.5 py-0.5 rounded-full text-xs font-medium ${stockColor}`}
        >
          {item.quantity}
          <span className="ml-0.5 opacity-70">{unitLabel}</span>
        </span>
      </td>

      <td className="px-2 md:px-6 py-2 md:py-4">
        <div className="flex items-center gap-1 md:gap-2">
          {!selectMode && onViewHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewHistory(item)}
              className="tap-target hidden md:flex text-gray-500 hover:text-gray-700 hover:bg-gray-100 h-9 w-9 p-0"
              title="Ver Historial"
              aria-label={`Ver historial de ${item.name}`}
            >
              <Clock className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}

          {!selectMode && onViewHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(item)}
              className="tap-target text-primary hover:text-primary hover:bg-blue-50 h-9 w-9 p-0"
              title="Editar"
              aria-label={`Editar ${item.name}`}
            >
              <Edit2 className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}

          {!selectMode && onViewHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="tap-target hidden md:flex text-red-500 hover:text-red-700 hover:bg-red-50 h-9 w-9 p-0 disabled:opacity-60"
              title="Eliminar"
              aria-label={`Eliminar ${item.name}`}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
              )}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// Mobile card for the admin view (buying price, margin, edit/delete/history)
function MobileAdminCard({
  item,
  onEdit,
  onDelete,
  onViewHistory,
  onViewPhotos,
  showBuyingPrice,
  selectMode,
  selected,
  onToggleSelect,
}: {
  item: InventoryItem;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void | Promise<void>;
  onViewHistory?: (item: InventoryItem) => void;
  onViewPhotos?: (item: InventoryItem) => void;
  showBuyingPrice?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const { formatPrice } = useApp();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  };

  const unitLabel = { units: "u", kg: "kg", liters: "L" }[item.unit || "units"];

  const stockColor =
    item.quantity === 0
      ? "text-red-600"
      : item.quantity < 10
        ? "text-yellow-600"
        : "text-green-600";

  const margin =
    item.sellingPrice > 0
      ? ((item.sellingPrice - item.buyingPrice) / item.sellingPrice) * 100
      : 0;
  const marginColor =
    margin <= 0
      ? "text-red-600"
      : margin < 15
        ? "text-yellow-600"
        : "text-green-600";

  return (
    <div className="p-3 border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-2">
        {selectMode && (
          <Checkbox
            checked={!!selected}
            onCheckedChange={() => onToggleSelect?.(item.id)}
            className="mt-0.5 flex-shrink-0"
          />
        )}
        <ProductThumb item={item} onView={onViewPhotos} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 leading-tight">
            {item.name}
          </p>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {item.includesTaxes && (
              <span className="text-meta uppercase bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
                +IVA
              </span>
            )}
            <span className="text-meta uppercase bg-gray-100 text-gray-600 px-1 py-0.5 rounded truncate max-w-[100px]">
              {item.brand}
            </span>
          </div>
          <p className="text-meta text-gray-500 font-mono mt-0.5 truncate">
            {item.barcode}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900">
            {formatPrice(item.sellingPrice)}
          </p>
          {item.discount > 0 && (
            <p className="text-meta text-orange-600">-{item.discount}%</p>
          )}
          <p className={`text-xs font-medium ${stockColor}`}>
            {item.quantity} {unitLabel}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-50">
        <div className="flex items-center gap-3 text-xs min-w-0">
          {showBuyingPrice && (
            <span className="text-gray-500 truncate">
              P. Compra:{" "}
              <span className="font-medium text-gray-700">
                {formatPrice(item.buyingPrice)}
              </span>
            </span>
          )}
          {showBuyingPrice && (
            <span className="text-gray-500 flex-shrink-0">
              Margen:{" "}
              <span className={`font-medium ${marginColor}`}>
                {margin.toFixed(0)}%
              </span>
            </span>
          )}
        </div>

        {!selectMode && onViewHistory && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewHistory(item)}
              className="tap-target text-gray-500 hover:text-gray-700 hover:bg-gray-100 h-10 w-10 p-0"
              title="Ver Historial"
              aria-label={`Ver historial de ${item.name}`}
            >
              <Clock className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(item)}
              className="tap-target text-primary hover:text-primary hover:bg-blue-50 h-10 w-10 p-0"
              title="Editar"
              aria-label={`Editar ${item.name}`}
            >
              <Edit2 className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="tap-target text-red-500 hover:text-red-700 hover:bg-red-50 h-10 w-10 p-0 disabled:opacity-60"
              title="Eliminar"
              aria-label={`Eliminar ${item.name}`}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function InventoryTable({
  items,
  onEdit,
  onDelete,
  onViewHistory,
  showBuyingPrice,
  selectMode,
  selectedIds,
  onToggleSelect,
}: InventoryTableProps) {
  // One shared photo viewer for the whole table: a swipeable carousel in a
  // dialog, opened from any row's thumbnail.
  const [photoItem, setPhotoItem] = useState<InventoryItem | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const openPhotos = (item: InventoryItem) => {
    setPhotoIndex(0);
    setPhotoItem(item);
  };

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 md:p-14 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
            <Package className="w-6 h-6 text-gray-500" strokeWidth={1.5} />
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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Mobile card list - no horizontal scroll on phones */}
      <div className="md:hidden">
        {items.map((item) => (
          <MobileAdminCard
            key={item.id}
            item={item}
            onEdit={onEdit}
            onDelete={onDelete}
            onViewHistory={onViewHistory}
            onViewPhotos={openPhotos}
            showBuyingPrice={showBuyingPrice}
            selectMode={selectMode}
            selected={selectedIds?.has(item.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {selectMode && (
                <th className="px-2 md:px-4 py-2 md:py-4 w-10" />
              )}
              <th className="text-left px-3 md:px-6 py-2 md:py-4 text-xs md:text-sm text-gray-600 font-normal">
                Producto
              </th>
              <th className="hidden md:table-cell text-left px-6 py-4 text-sm text-gray-600 font-normal">
                Código
              </th>
              <th className="hidden md:table-cell text-left px-6 py-4 text-sm text-gray-600 font-normal">
                Marca/Tipo
              </th>
              <th className="text-left px-3 md:px-6 py-2 md:py-4 text-xs md:text-sm text-gray-600 font-normal">
                P. Venta
              </th>
              {showBuyingPrice && (
                <th className="hidden md:table-cell text-left px-6 py-4 text-sm text-gray-600 font-normal">
                  P. Compra
                </th>
              )}
              {showBuyingPrice && (
                <th className="hidden md:table-cell text-left px-6 py-4 text-sm text-gray-600 font-normal">
                  Margen
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
                onViewHistory={onViewHistory}
                onViewPhotos={openPhotos}
                showBuyingPrice={showBuyingPrice}
                selectMode={selectMode}
                selected={selectedIds?.has(item.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Photo viewer */}
      <Dialog
        open={!!photoItem}
        onOpenChange={(open) => !open && setPhotoItem(null)}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug">
              {photoItem?.name}
            </DialogTitle>
          </DialogHeader>
          {photoItem && (
            <div className="rounded-lg overflow-hidden">
              <ImageCarousel
                images={photoItem.images || []}
                alt={photoItem.name}
                activeIndex={photoIndex}
                setActiveIndex={setPhotoIndex}
                onShare={(i) => {
                  const img = photoItem.images?.[i];
                  if (img) shareImageToWhatsApp(photoItem, img);
                }}
                size="full"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Summary footer */}
      <div className="border-t border-gray-200 bg-gray-50 px-3 md:px-6 py-2 md:py-3">
        <div className="flex items-center justify-between text-xs md:text-sm">
          <span className="text-gray-600">
            Productos:{" "}
            <span className="font-medium text-gray-900">{items.length}</span>
          </span>
          <span className="text-gray-600">
            Stock:{" "}
            <span className="font-medium text-gray-900">
              {items.reduce((s, i) => s + i.quantity, 0)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
