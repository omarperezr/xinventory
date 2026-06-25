// Multi-field sort helper for the inventory search/admin views.
import { InventoryItem } from "../context/app-context";

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "barcode-asc"
  | "barcode-desc"
  | "brand-asc"
  | "brand-desc"
  | "type-asc"
  | "type-desc"
  | "sellingPrice-asc"
  | "sellingPrice-desc"
  | "quantity-asc"
  | "quantity-desc";

export type SortField =
  | "name"
  | "barcode"
  | "brand"
  | "type"
  | "sellingPrice"
  | "quantity";

export const SORT_FIELDS: {
  field: SortField;
  label: string;
  ascLabel: string;
  descLabel: string;
}[] = [
  { field: "name", label: "Nombre", ascLabel: "A-Z", descLabel: "Z-A" },
  { field: "barcode", label: "Código", ascLabel: "A-Z", descLabel: "Z-A" },
  { field: "brand", label: "Marca", ascLabel: "A-Z", descLabel: "Z-A" },
  { field: "type", label: "Tipo", ascLabel: "A-Z", descLabel: "Z-A" },
  {
    field: "sellingPrice",
    label: "Precio",
    ascLabel: "menor a mayor",
    descLabel: "mayor a menor",
  },
  {
    field: "quantity",
    label: "Stock",
    ascLabel: "menor a mayor",
    descLabel: "mayor a menor",
  },
];

export const fieldOf = (o: SortOption) => o.split("-")[0] as SortField;
export const dirOf = (o: SortOption) => o.split("-")[1] as "asc" | "desc";

function compareBy(a: InventoryItem, b: InventoryItem, sort: SortOption): number {
  const field = fieldOf(sort);
  const factor = dirOf(sort) === "asc" ? 1 : -1;
  if (field === "sellingPrice" || field === "quantity") {
    return (a[field] - b[field]) * factor;
  }
  return (
    String(a[field]).localeCompare(String(b[field]), "es", { sensitivity: "base" }) *
    factor
  );
}

/**
 * Sorts by one or more criteria in priority order: the first option is the
 * primary sort, the next ones break ties, and so on.
 */
export function sortInventory(
  items: InventoryItem[],
  sort: SortOption | SortOption[],
): InventoryItem[] {
  const criteria = Array.isArray(sort) ? sort : [sort];
  if (criteria.length === 0) return [...items];
  return [...items].sort((a, b) => {
    for (const c of criteria) {
      const r = compareBy(a, b, c);
      if (r !== 0) return r;
    }
    return 0;
  });
}
