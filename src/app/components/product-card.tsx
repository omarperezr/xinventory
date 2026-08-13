import { useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
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
import { PriceTag, StockChip } from "./price-tag";
import { shareImageToWhatsApp, shareProductToWhatsApp } from "../services/whatsapp";

interface ProductCardProps {
  item: InventoryItem;
  onAddToCart?: (item: InventoryItem, qty: number) => void;
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

// Shared image carousel used as the card preview, inside the product detail
// dialog and by the inventory photo viewer. Swipeable on touch (embla) with
// arrows as the pointer fallback. Tracks the active index so the share button
// can send exactly the photo currently being displayed.
export function ImageCarousel({
  images,
  alt,
  activeIndex,
  setActiveIndex,
  onShare,
  onOpen,
  size = "preview",
  /** "responsive" hides arrows/share below md — the phone list row is too
      small for chrome; the detail dialog keeps everything. */
  controls = "always",
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
  controls?: "always" | "responsive";
}) {
  const hasImages = images.length > 0;
  const chromeVis = controls === "responsive" ? "hidden md:flex" : "flex";

  // startIndex is read once on init; feeding the live index back into the
  // options would re-init embla mid-drag.
  const startIndex = useRef(activeIndex).current;
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, startIndex });

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setActiveIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, setActiveIndex]);

  const go = (delta: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (delta < 0) emblaApi?.scrollPrev();
    else emblaApi?.scrollNext();
  };

  return (
    <div className="relative h-full w-full md:aspect-square bg-secondary overflow-hidden">
      {hasImages ? (
        <div ref={emblaRef} className="h-full overflow-hidden">
          {/* pan-y keeps vertical page scroll working while embla owns the
              horizontal gesture. */}
          <div className="flex h-full touch-pan-y">
            {images.map((src, i) => (
              <div key={i} className="min-w-0 shrink-0 grow-0 basis-full h-full">
                <ImageSurface onOpen={onOpen} alt={alt}>
                  <img
                    src={src}
                    alt={images.length > 1 ? `${alt} — foto ${i + 1}` : alt}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className={`w-full h-full select-none ${
                      size === "full" ? "object-contain" : "object-cover"
                    }`}
                  />
                </ImageSurface>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Package
            className="w-10 h-10 text-muted-foreground/60"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
      )}

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => go(-1, e)}
            aria-label="Foto anterior"
            className={`tap-target absolute left-1.5 top-1/2 -translate-y-1/2 bg-white/85 hover:bg-white rounded-full p-1.5 shadow-card ${chromeVis} items-center justify-center`}
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => go(1, e)}
            aria-label="Foto siguiente"
            className={`tap-target absolute right-1.5 top-1/2 -translate-y-1/2 bg-white/85 hover:bg-white rounded-full p-1.5 shadow-card ${chromeVis} items-center justify-center`}
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <div
            aria-hidden="true"
            className={`absolute bottom-1.5 left-0 right-0 justify-center gap-1 ${chromeVis}`}
          >
            {images.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === activeIndex ? "bg-white" : "bg-white/60"}`}
              />
            ))}
          </div>
          <span className="sr-only" aria-live="polite">
            Foto {activeIndex + 1} de {images.length}
          </span>
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
          className={`tap-target absolute top-2 right-2 bg-white/90 backdrop-blur rounded-full p-2 shadow-card hover:bg-primary hover:text-white transition-colors ${chromeVis} items-center justify-center`}
        >
          <MessageCircle className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * One product, two shapes from one DOM: a horizontal row on phones (photo
 * left, facts middle, one green button right) and a grid card from md up
 * (photo on top, stepper + add below).
 */
export function ProductCard({ item, onAddToCart }: ProductCardProps) {
  const [qty, setQty] = useState(1);
  const [cardImageIndex, setCardImageIndex] = useState(0);
  const [dialogImageIndex, setDialogImageIndex] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);

  const unit = item.unit || "units";
  const images = item.images || [];
  const out = item.quantity === 0;

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
      <div className="group flex flex-row items-stretch md:flex-col bg-white rounded-xl border border-border shadow-card overflow-hidden transition-shadow hover:shadow-raised">
        <div className="w-24 shrink-0 self-stretch md:w-full">
          <ImageCarousel
            images={images}
            alt={item.name}
            activeIndex={cardImageIndex}
            setActiveIndex={setCardImageIndex}
            onShare={handleShareImage}
            onOpen={openDetail}
            controls="responsive"
          />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 p-3 md:flex-col md:items-stretch md:gap-1.5">
          <div className="min-w-0 flex-1 md:flex-none">
            <button type="button" onClick={openDetail} className="block text-left">
              <p className="text-[0.9375rem] md:text-base font-semibold text-foreground leading-snug line-clamp-2">
                {item.name}
              </p>
            </button>

            <div className="mt-0.5 hidden md:flex items-center gap-1.5 flex-wrap">
              <span className="text-meta uppercase tracking-wide bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-semibold">
                {item.brand}
              </span>
              <span className="text-meta uppercase tracking-wide text-muted-foreground px-0.5 py-0.5">
                {item.type}
              </span>
              {item.includesTaxes && (
                <span className="text-meta uppercase bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-semibold">
                  +IVA
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-col gap-1 md:mt-2 md:flex-row md:items-center md:justify-between">
              <PriceTag usd={item.sellingPrice} size="sm" className="md:text-base" />
              <StockChip quantity={item.quantity} unit={unit} size="sm" className="self-start" />
            </div>
          </div>

          {/* Phone: one labeled green button, adds one. Quantity lives in the
              detail sheet a row-tap opens. */}
          {onAddToCart && (
            <Button
              onClick={() => onAddToCart(item, 1)}
              disabled={out}
              aria-label={`Agregar ${item.name}`}
              className="shrink-0 self-center md:hidden px-3.5"
            >
              <Plus aria-hidden="true" />
              Agregar
            </Button>
          )}

          {/* Desktop: stepper + add, stacked so the primary action spans the card. */}
          {onAddToCart && (
            <div className="hidden md:flex md:flex-col gap-2 mt-1">
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
                disabled={out}
                className="w-full"
                size="sm"
              >
                <Plus aria-hidden="true" />
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

          <div className="overflow-hidden rounded-xl">
            <ImageCarousel
              images={images}
              alt={item.name}
              activeIndex={dialogImageIndex}
              setActiveIndex={setDialogImageIndex}
              onShare={handleShareImage}
              size="full"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-meta uppercase tracking-wide bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-semibold">
                {item.brand}
              </span>
              <span className="text-meta uppercase tracking-wide text-muted-foreground px-0.5">
                {item.type}
              </span>
              {item.includesTaxes && (
                <span className="text-meta uppercase bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-semibold">
                  +IVA
                </span>
              )}
            </div>

            <div className="rounded-xl bg-canvas border border-border p-4 flex flex-col gap-2">
              <PriceTag usd={item.sellingPrice} size="lg" />
              <div className="flex items-center justify-between gap-2">
                <StockChip quantity={item.quantity} unit={unit} />
                {item.discount > 0 && (
                  <span className="text-sm font-semibold text-pending" data-money>
                    -{item.discount}% descuento
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Código</span>
              <span className="font-mono text-foreground" data-money>
                {item.barcode}
              </span>
            </div>

            {item.notes && item.notes.trim() && (
              <p className="text-[0.9375rem] text-foreground whitespace-pre-wrap bg-canvas border border-border rounded-lg p-3">
                {item.notes}
              </p>
            )}
          </div>

          {onAddToCart && (
            <div className="flex items-center gap-2.5 pt-1">
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
                disabled={out}
                className="flex-1"
              >
                <Plus aria-hidden="true" />
                Agregar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
