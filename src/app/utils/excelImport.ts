// Parses a product-list .xlsx into rows matching xinventory's InventoryItem
// fields. No image extraction - xinventory stores image URLs uploaded
// separately through the admin form, not embedded spreadsheet pictures.
export interface ExcelItem {
  name: string;
  barcode: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  unit: "units" | "kg" | "liters";
  brand: string;
  type: string;
  includesTaxes: boolean;
  discount: number;
  notes: string;
}

// Column keys recognized in the header row, after normalizing (trim, lower,
// strip accents).
const HEADER_ALIASES: Record<string, keyof ColumnMap> = {
  nombre: "name",
  producto: "name",
  codigo: "barcode",
  barcode: "barcode",
  "codigo de barras": "barcode",
  "precio compra": "buyingPrice",
  "precio de compra": "buyingPrice",
  compra: "buyingPrice",
  "precio venta": "sellingPrice",
  "precio de venta": "sellingPrice",
  venta: "sellingPrice",
  precio: "sellingPrice",
  cantidad: "quantity",
  stock: "quantity",
  unidad: "unit",
  marca: "brand",
  tipo: "type",
  categoria: "type",
  impuestos: "includesTaxes",
  iva: "includesTaxes",
  descuento: "discount",
  notas: "notes",
};

interface ColumnMap {
  name?: number;
  barcode?: number;
  buyingPrice?: number;
  sellingPrice?: number;
  quantity?: number;
  unit?: number;
  brand?: number;
  type?: number;
  includesTaxes?: number;
  discount?: number;
  notes?: number;
}

function normalize(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isEmptyCell(v: any): boolean {
  return v === undefined || v === null || String(v).trim() === "";
}

function parseNumber(v: any): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function parseBoolean(v: any): boolean {
  const s = normalize(v);
  return s === "si" || s === "sí" || s === "true" || s === "1" || s === "x";
}

function parseUnit(v: any): "units" | "kg" | "liters" {
  const s = normalize(v);
  if (s.startsWith("kg") || s.includes("kilo")) return "kg";
  if (s.startsWith("l") || s.includes("litro")) return "liters";
  return "units";
}

// Finds the header row (within the first 10 rows) by matching column names
// against HEADER_ALIASES, and returns its column index map.
function detectHeader(rawRows: any[][]): { headerRow: number; columns: ColumnMap } | null {
  const limit = Math.min(rawRows.length, 10);
  for (let r = 0; r < limit; r++) {
    const row = rawRows[r] || [];
    const columns: ColumnMap = {};
    let matches = 0;
    row.forEach((cell, i) => {
      const key = HEADER_ALIASES[normalize(cell)];
      if (key && columns[key] === undefined) {
        columns[key] = i;
        matches++;
      }
    });
    if (matches >= 2) return { headerRow: r, columns };
  }
  return null;
}

/**
 * Extracts products from a .xlsx file. Requires at least a name and a
 * barcode per row; rows missing most fields are treated as noise (section
 * dividers, blank rows) and skipped.
 */
export async function parseItemsFromExcel(file: File): Promise<ExcelItem[]> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });

  const detected = detectHeader(rawRows);
  if (!detected) return [];
  const { headerRow, columns } = detected;

  const items: ExcelItem[] = [];

  for (let r = headerRow + 1; r < rawRows.length; r++) {
    const row = rawRows[r] || [];
    const get = (key: keyof ColumnMap) =>
      columns[key] !== undefined ? row[columns[key]!] : undefined;

    const name = get("name");
    const barcode = get("barcode");
    const sellingPrice = get("sellingPrice");
    const buyingPrice = get("buyingPrice");
    const quantity = get("quantity");

    const missing = [
      isEmptyCell(name),
      isEmptyCell(barcode),
      isEmptyCell(sellingPrice),
      isEmptyCell(buyingPrice),
      isEmptyCell(quantity),
    ];
    if (missing.filter(Boolean).length > 3) continue;

    const barcodeStr = String(barcode ?? "").trim();
    const nameStr = String(name ?? "").trim();
    if (!barcodeStr || !nameStr) continue;

    items.push({
      name: nameStr,
      barcode: barcodeStr,
      buyingPrice: parseNumber(buyingPrice),
      sellingPrice: parseNumber(sellingPrice),
      quantity: Math.max(0, Math.round(parseNumber(quantity))),
      unit: parseUnit(get("unit")),
      brand: String(get("brand") ?? "").trim() || "GENERICO",
      type: String(get("type") ?? "").trim() || "N/A",
      includesTaxes: parseBoolean(get("includesTaxes")),
      discount: parseNumber(get("discount")),
      notes: String(get("notes") ?? "").trim(),
    });
  }

  return items;
}
