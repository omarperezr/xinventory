import { useState } from "react";
import {
  Plus,
  Package,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { QuantityStepper } from "./quantity-stepper";
import { useApp, InventoryItem } from "../context/app-context";
import { shareImageToWhatsApp, shareProductToWhatsApp } from "../services/whatsapp";

interface ProductCardProps {
  item: InventoryItem;
  onAddToCart?: (item: InventoryItem, qty: number) => void;
}

function stockBadgeClasses(quantity: number) {
  return quantity === 0
    ? "text-red-600 bg-red-50"
    : quantity < 10
      ? "text-amber-600 bg-amber-50"
      : "text-emerald-700 bg-emerald-50";
}

function ImageSurface({
  onOpen,
  alt,
  children,
}: {
  onOpen?: () => void;
  alt: string;
  children: React.ReactNode;
}) {
  if (!onOpen) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Ver detalles de ${alt}`}
      className="block w-full h-full cursor-pointer"
    >
      {children}
    </button>
  );
}

// Shared image carousel used both as the card preview and inside the
// product detail dialog. Tracks the active index so the share button can
// send exactly the photo currently being displayed.
function ImageCarousel({
  images,
  alt,
  activeIndex,
  setActiveIndex,
  onShare,
  onOpen,
  size = "preview",
}: {
  images: string[];
  alt: string;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onShare: (index: number) => void;
  /** When given, the photo itself opens the detail dialog. The arrows and the
      share button stay siblings of it: nesting them inside one big button is
      invalid markup and leaves a keyboard user unable to reach them. */
  onOpen?: () => void;
  size?: "preview" | "full";
}) {
  const hasImages = images.length > 0;
  const heightClass = size === "full" ? "aspect-square" : "aspect-square";

  const go = (delta: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (images.length === 0) return;
    setActiveIndex((activeIndex + delta + images.length) % images.length);
  };

  return (
    <div className={`relative ${heightClass} bg-gray-100 overflow-hidden`}>
      <ImageSurface onOpen={onOpen} alt={alt}>
        {hasImages ? (
          <img
            src={images[activeIndex]}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package
              className="w-10 h-10 text-gray-500"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
        )}
      </ImageSurface>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => go(-1, e)}
            aria-label="Foto anterior"
            className="tap-target absolute left-1.5 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => go(1, e)}
            aria-label="Foto siguiente"
            className="tap-target absolute right-1.5 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-sm"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <div
            aria-hidden="true"
            className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1"
          >
            {images.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${i === activeIndex ? "bg-white" : "bg-white/60"}`}
              />
            ))}
          </div>
        </>
      )}

      {hasImages && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShare(activeIndex);
          }}
          title="Compartir esta foto por WhatsApp"
          aria-label={`Compartir foto de ${alt} por WhatsApp`}
          className="tap-target absolute top-2 right-2 bg-white/90 backdrop-blur rounded-full p-2 shadow-sm hover:bg-emerald-500 hover:text-white transition-colors"
        >
          <MessageCircle className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function ProductCard({ item, onAddToCart }: ProductCardProps) {
  const { formatPrice } = useApp();
  const [qty, setQty] = useState(1);
  const [cardImageIndex, setCardImageIndex] = useState(0);
  const [dialogImageIndex, setDialogImageIndex] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);

  const unitLabel = { units: "u", kg: "kg", liters: "L" }[item.unit || "units"];
  const images = item.images || [];

  const handleShareImage = (index: number) => {
    if (!images[index]) {
      shareProductToWhatsApp(item);
      return;
    }
    shareImageToWhatsApp(item, images[index]);
  };

  const openDetail = () => {
    setDialogImageIndex(cardImageIndex);
    setDetailOpen(true);
  };

  return (
    <>
      <div className="group flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden transition-shadow hover:shadow-lg">
        <ImageCarousel
          images={images}
          alt={item.name}
          activeIndex={cardImageIndex}
          setActiveIndex={setCardImageIndex}
          onShare={handleShareImage}
          onOpen={openDetail}
        />

        <div className="flex flex-col gap-1.5 p-3 flex-1">
          <button
            type="button"
            onClick={openDetail}
            className="text-left"
          >
            <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">
              {item.name}
            </p>
          </button>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-meta uppercase tracking-wide bg-gray-900 text-white px-1.5 py-0.5 rounded">
              {item.brand}
            </span>
            <span className="text-meta uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {item.type}
            </span>
            {item.includesTaxes && (
              <span className="text-meta uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                +IVA
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-1">
            <span className="text-base font-bold text-gray-900">
              {formatPrice(item.sellingPrice)}
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${stockBadgeClasses(item.quantity)}`}
            >
              {item.quantity} {unitLabel}
            </span>
          </div>

          {/* Quantity and the action it feeds sit in one block, and the
              primary action spans the card so it is unmistakably the thing
              to press. Stacked rather than side by side because a two-column
              card on a phone has no room for both on one line. */}
          {onAddToCart && (
            <div className="flex flex-col gap-2 mt-2">
              <QuantityStepper
                value={qty}
                onChange={setQty}
                min={1}
                max={item.quantity || undefined}
                size="sm"
                block
                label={`Cantidad de ${item.name}`}
              />
              <Button
                onClick={() => onAddToCart(item, qty)}
                disabled={item.quantity === 0}
                className="w-full h-10 text-sm"
              >
                <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
                Agregar
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{item.name}</DialogTitle>
          </DialogHeader>

          <ImageCarousel
            images={images}
            alt={item.name}
            activeIndex={dialogImageIndex}
            setActiveIndex={setDialogImageIndex}
            onShare={handleShareImage}
            size="full"
          />

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-meta uppercase tracking-wide bg-gray-900 text-white px-1.5 py-0.5 rounded">
                {item.brand}
              </span>
              <span className="text-meta uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {item.type}
              </span>
              {item.includesTaxes && (
                <span className="text-meta uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                  +IVA
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <p className="text-xs text-gray-500">Precio</p>
                <p className="font-semibold text-gray-900">
                  {formatPrice(item.sellingPrice)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Stock</p>
                <p
                  className={`font-semibold inline-flex px-2 py-0.5 rounded-full text-xs ${stockBadgeClasses(item.quantity)}`}
                >
                  {item.quantity} {unitLabel}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Código</p>
                <p className="font-mono text-gray-700">{item.barcode}</p>
              </div>
              {item.discount > 0 && (
                <div>
                  <p className="text-xs text-gray-500">Descuento</p>
                  <p className="font-semibold text-orange-600">
                    -{item.discount}%
                  </p>
                </div>
              )}
            </div>

            {item.notes && item.notes.trim() && (
              <div className="pt-1">
                <p className="text-xs text-gray-500">Notas</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded-md p-2 mt-0.5">
                  {item.notes}
                </p>
              </div>
            )}
          </div>

          {onAddToCart && (
            <div className="flex items-center gap-2 pt-2">
              <QuantityStepper
                value={qty}
                onChange={setQty}
                min={1}
                max={item.quantity || undefined}
                label={`Cantidad de ${item.name}`}
              />
              <Button
                onClick={() => {
                  onAddToCart(item, qty);
                  setDetailOpen(false);
                }}
                disabled={item.quantity === 0}
                className="flex-1 h-11 text-sm"
              >
                <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
                Agregar al Total
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
