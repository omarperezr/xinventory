import { InventoryItem } from "../context/app-context";

export function shareProductToWhatsApp(
  item: InventoryItem,
  formatPrice: (priceInBs: number) => string,
) {
  const lines = [
    `*${item.name}*`,
    `Marca: ${item.brand}`,
    `Tipo: ${item.type}`,
    `Precio: ${formatPrice(item.sellingPrice)}`,
    `Stock: ${item.quantity} ${item.unit}`,
    `Código: ${item.barcode}`,
  ];
  const text = encodeURIComponent(lines.join("\n"));
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
}
