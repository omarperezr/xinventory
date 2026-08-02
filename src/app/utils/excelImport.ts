import type { UnitType } from "../context/app-context";

// Parses a product-list .xlsx into rows matching xinventory's InventoryItem
// fields. No image extraction - xinventory stores image URLs uploaded
// separately through the admin form, not embedded spreadsheet pictures.
/** One cell as SheetJS hands it over, before we narrow it. */
type Cell = string | number | boolean | Date | null | undefined;

export interface ExcelItem {
  name: string;
  barcode: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  unit: UnitType;
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

function normalize(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isEmptyCell(v: unknown): boolean {
  return v === undefined || v === null || String(v).trim() === "";
}

// Venezuelan sheets write "1.234,56" or "Bs 12,50"; exported ones write
// "1234.56". Strips anything that isn't a digit or separator, then takes the
// LAST separator as the decimal point; a separator that repeats is grouping
// only ("1.234.567"). Returns null when the cell has content we can't read,
// so a caller can tell garbage from a real 0; an empty cell is a real 0.
export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (isEmptyCell(v)) return 0;
  const s = String(v).replace(/[^\d.,-]/g, "");
  const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
  let at = s.split(dec).length === 2 ? s.lastIndexOf(dec) : -1;
  // A lone separator trailed by exactly three digits is a thousands mark, not
  // a decimal point: "12.500" is twelve thousand five hundred on a Venezuelan
  // sheet, and no price is quoted to three decimals. "0,750" is the exception
  // that proves it - nothing costs zero thousand.
  const tail = at >= 0 ? s.slice(at + 1) : "";
  if (at > 0 && tail.length === 3 && !/[.,]/.test(s.slice(0, at)) && s.slice(0, at) !== "0") {
    at = -1;
  }
  const n = parseFloat(
    at < 0
      ? s.replace(/[.,]/g, "")
      : `${s.slice(0, at).replace(/[.,]/g, "")}.${tail}`,
  );
  return isNaN(n) ? null : n;
}

function parseBoolean(v: unknown): boolean {
  const s = normalize(v);
  return s === "si" || s === "sí" || s === "true" || s === "1" || s === "x";
}

function parseUnit(v: unknown): UnitType {
  const s = normalize(v);
  if (s.startsWith("kg") || s.includes("kilo")) return "kg";
  if (s.startsWith("l") || s.includes("litro")) return "liters";
  return "units";
}

// Finds the header row (within the first 10 rows) by matching column names
// against HEADER_ALIASES, and returns its column index map.
function detectHeader(rawRows: Cell[][]): { headerRow: number; columns: ColumnMap } | null {
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
export async function parseItemsFromExcel(
  file: File,
): Promise<{ items: ExcelItem[]; skipped: number }> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  const rawRows = XLSX.utils.sheet_to_json<Cell[]>(worksheet, {
    header: 1,
    defval: "",
  });

  const detected = detectHeader(rawRows);
  if (!detected) return { items: [], skipped: 0 };
  const { headerRow, columns } = detected;

  const items: ExcelItem[] = [];
  // Rows dropped for a reason the admin needs to hear about: a name or barcode
  // missing, or a price we could not read. Counted rather than swallowed, so a
  // 500-row sheet cannot report "420 creados" and leave the rest unexplained.
  let skipped = 0;

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
    // Mostly-empty rows are noise (section dividers, blank lines), not a loss.
    if (missing.filter(Boolean).length > 3) continue;

    const barcodeStr = String(barcode ?? "").trim();
    const nameStr = String(name ?? "").trim();
    if (!barcodeStr || !nameStr) {
      skipped++;
      continue;
    }

    // An unreadable price would land as 0 and create or update the product as
    // free; skip the row instead of importing it wrong.
    const buying = parseNumber(buyingPrice);
    const selling = parseNumber(sellingPrice);
    if (buying === null || selling === null) {
      console.warn(`Fila ${r + 1} (${nameStr}): precio ilegible, omitida`);
      skipped++;
      continue;
    }

    items.push({
      name: nameStr,
      barcode: barcodeStr,
      buyingPrice: buying,
      sellingPrice: selling,
      quantity: Math.max(0, Math.round(parseNumber(quantity) ?? 0)),
      unit: parseUnit(get("unit")),
      brand: String(get("brand") ?? "").trim() || "GENERICO",
      type: String(get("type") ?? "").trim() || "N/A",
      includesTaxes: parseBoolean(get("includesTaxes")),
      discount: parseNumber(get("discount")) ?? 0,
      notes: String(get("notes") ?? "").trim(),
    });
  }

  return { items, skipped };
}
