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
import { PriceTag, StockChip } from "./price-tag";
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
        className={`${className} rounded-lg bg-secondary flex items-center justify-center flex-shrink-0`}
      >
        <Package
          className="size-5 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onView(item)}
      aria-label={`Ver fotos de ${item.name}`}
      className={`${className} relative rounded-lg overflow-hidden flex-shrink-0 border border-border focus-visible:ring-2 focus-visible:ring-primary`}
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

  const margin =
    item.sellingPrice > 0
      ? ((item.sellingPrice - item.buyingPrice) / item.sellingPrice) * 100
      : 0;
  const marginColor =
    margin <= 0
      ? "text-destructive"
      : margin < 15
        ? "text-pending"
        : "text-primary";

  return (
    <tr className="hover:bg-canvas transition-colors">
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
            <div className="text-sm font-semibold text-foreground leading-tight">
              {item.name}
            </div>
            {item.includesTaxes && (
              <span className="mt-0.5 inline-block text-meta font-semibold uppercase bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                +IVA
              </span>
            )}
          </div>
        </div>
      </td>

      <td className="hidden md:table-cell px-6 py-4">
        <span className="text-muted-foreground font-mono text-sm" data-money>
          {item.barcode}
        </span>
      </td>

      <td className="hidden md:table-cell px-6 py-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground truncate max-w-[110px]">
            {item.brand}
          </span>
          <span className="text-meta text-muted-foreground uppercase truncate max-w-[110px]">
            {item.type}
          </span>
        </div>
      </td>

      <td className="px-3 md:px-6 py-2 md:py-4">
        <PriceTag usd={item.sellingPrice} size="sm" />
        {item.discount > 0 && (
          <div className="text-meta font-semibold text-pending">
            -{item.discount}%
          </div>
        )}
      </td>

      {showBuyingPrice && (
        <td className="hidden md:table-cell px-6 py-4">
          <span className="text-muted-foreground text-sm" data-money>
            {formatPrice(item.buyingPrice)}
          </span>
        </td>
      )}

      {showBuyingPrice && (
        <td className="hidden md:table-cell px-6 py-4">
          <span className={`text-sm font-semibold ${marginColor}`} data-money>
            {margin.toFixed(0)}%
          </span>
        </td>
      )}

      <td className="hidden md:table-cell px-6 py-4">
        <span className="text-muted-foreground text-sm" data-money>
          {item.updatedAt
            ? format(new Date(item.updatedAt), "dd MMM yyyy")
            : "N/A"}
        </span>
      </td>

      <td className="px-3 md:px-6 py-2 md:py-4">
        <StockChip quantity={item.quantity} unit={item.unit || "units"} size="sm" />
      </td>

      <td className="px-2 md:px-6 py-2 md:py-4">
        <div className="flex items-center gap-1 md:gap-2">
          {!selectMode && onViewHistory && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onViewHistory(item)}
              className="tap-target text-muted-foreground hover:text-foreground"
              title="Ver historial"
              aria-label={`Ver historial de ${item.name}`}
            >
              <Clock className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}

          {!selectMode && onViewHistory && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEdit(item)}
              className="tap-target text-primary hover:text-primary hover:bg-primary-soft"
              title="Editar"
              aria-label={`Editar ${item.name}`}
            >
              <Edit2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}

          {!selectMode && onViewHistory && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleDelete}
              disabled={deleting}
              className="tap-target text-muted-foreground hover:text-destructive hover:bg-destructive-soft disabled:opacity-60"
              title="Eliminar"
              aria-label={`Eliminar ${item.name}`}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
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

  const margin =
    item.sellingPrice > 0
      ? ((item.sellingPrice - item.buyingPrice) / item.sellingPrice) * 100
      : 0;
  const marginColor =
    margin <= 0
      ? "text-destructive"
      : margin < 15
        ? "text-pending"
        : "text-primary";

  return (
    <div className="p-3.5 border-b border-border last:border-0">
      <div className="flex items-start gap-2.5">
        {selectMode && (
          <Checkbox
            checked={!!selected}
            onCheckedChange={() => onToggleSelect?.(item.id)}
            className="mt-0.5 flex-shrink-0"
          />
        )}
        <ProductThumb item={item} onView={onViewPhotos} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-foreground leading-tight break-words">
            {item.name}
          </p>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {item.includesTaxes && (
              <span className="text-meta font-semibold uppercase bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                +IVA
              </span>
            )}
            <span className="text-meta font-semibold uppercase bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded truncate max-w-[100px]">
              {item.brand}
            </span>
          </div>
          <p className="text-meta text-muted-foreground font-mono mt-1 truncate" data-money>
            {item.barcode}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <PriceTag usd={item.sellingPrice} size="sm" className="justify-end" />
          {item.discount > 0 && (
            <p className="text-meta font-semibold text-pending">-{item.discount}%</p>
          )}
          <StockChip quantity={item.quantity} unit={item.unit || "units"} size="sm" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-border">
        <div className="flex items-center gap-3 text-sm min-w-0" data-money>
          {showBuyingPrice && (
            <span className="text-muted-foreground truncate">
              P. compra:{" "}
              <span className="font-semibold text-foreground">
                {formatPrice(item.buyingPrice)}
              </span>
            </span>
          )}
          {showBuyingPrice && (
            <span className="text-muted-foreground flex-shrink-0">
              Margen:{" "}
              <span className={`font-semibold ${marginColor}`}>
                {margin.toFixed(0)}%
              </span>
            </span>
          )}
        </div>

        {!selectMode && onViewHistory && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onViewHistory(item)}
              className="text-muted-foreground hover:text-foreground"
              title="Ver historial"
              aria-label={`Ver historial de ${item.name}`}
            >
              <Clock className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(item)}
              className="text-primary hover:text-primary hover:bg-primary-soft"
              title="Editar"
              aria-label={`Editar ${item.name}`}
            >
              <Edit2 className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={deleting}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive-soft disabled:opacity-60"
              title="Eliminar"
              aria-label={`Eliminar ${item.name}`}
            >
              {deleting ? (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-5" strokeWidth={1.5} aria-hidden="true" />
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
      <div className="bg-white rounded-xl border border-border shadow-card p-10 md:p-14 text-center">
        <Package
          className="mx-auto mb-3 size-10 text-muted-foreground/50"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h3 className="text-base font-bold text-foreground mb-1">
          No hay productos
        </h3>
        <p className="text-sm text-muted-foreground">
          Agrega un producto o cambia lo que buscaste.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden shadow-card">
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
            <tr className="border-b border-border bg-canvas">
              {selectMode && (
                <th className="px-2 md:px-4 py-3.5 w-10" />
              )}
              <th className="text-left px-3 md:px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                Producto
              </th>
              <th className="hidden md:table-cell text-left px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                Código
              </th>
              <th className="hidden md:table-cell text-left px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                Marca / tipo
              </th>
              <th className="text-left px-3 md:px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                P. venta
              </th>
              {showBuyingPrice && (
                <th className="hidden md:table-cell text-left px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                  P. compra
                </th>
              )}
              {showBuyingPrice && (
                <th className="hidden md:table-cell text-left px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                  Margen
                </th>
              )}
              <th className="hidden md:table-cell text-left px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                Creación
              </th>
              <th className="text-left px-3 md:px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                Stock
              </th>
              <th className="text-left px-2 md:px-6 py-3.5 text-sm text-muted-foreground font-semibold">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
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
        <DialogContent className="sm:max-w-md">
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
      <div className="border-t border-border bg-canvas px-3 md:px-6 py-3">
        <div className="flex items-center justify-between text-sm" data-money>
          <span className="text-muted-foreground">
            Productos:{" "}
            <span className="font-bold text-foreground">{items.length}</span>
          </span>
          <span className="text-muted-foreground">
            Stock:{" "}
            <span className="font-bold text-foreground">
              {items.reduce((s, i) => s + i.quantity, 0)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
