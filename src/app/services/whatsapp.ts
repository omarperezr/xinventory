import { InventoryItem } from "../context/app-context";

function buildCaption(
  item: InventoryItem,
  formatPrice: (priceInBs: number) => string,
) {
  return [
    `*${item.name}*`,
    `Marca: ${item.brand}`,
    `Tipo: ${item.type}`,
    `Precio: ${formatPrice(item.sellingPrice)}`,
    `Stock: ${item.quantity} ${item.unit}`,
    `Código: ${item.barcode}`,
  ].join("\n");
}

export function shareProductToWhatsApp(
  item: InventoryItem,
  formatPrice: (priceInBs: number) => string,
) {
  const text = encodeURIComponent(buildCaption(item, formatPrice));
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
}

// Shares the currently displayed product photo to WhatsApp. Uses the Web
// Share API (with file attachment) when available, since wa.me links can
// only carry text. Falls back to opening WhatsApp with the caption only.
export async function shareImageToWhatsApp(
  item: InventoryItem,
  imageDataUrl: string,
  formatPrice: (priceInBs: number) => string,
) {
  const caption = buildCaption(item, formatPrice);

  try {
    const res = await fetch(imageDataUrl);
    const blob = await res.blob();
    const file = new File([blob], `${item.name || "producto"}.jpg`, {
      type: blob.type || "image/jpeg",
    });

    if (
      typeof navigator !== "undefined" &&
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file], text: caption, title: item.name });
      return;
    }
  } catch {
    // Fall through to text-only share
  }

  shareProductToWhatsApp(item, formatPrice);
}
