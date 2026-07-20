import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { Transaction } from "../context/history-context";
import {
  reorderPlan,
  type Alert,
  type Forecast,
  type GroupStat,
  type InventoryReport,
  type PaymentStat,
  type PeriodMetrics,
  type ProductStat,
  type SellerStat,
} from "./report-analytics";

// All figures here are in USD (the canonical currency). The caller passes a
// `convert` function and a `symbol` so the report can be rendered in whatever
// display currency the user currently has selected.
//
// Everything is pre-computed by the reports dashboard, so a downloaded file and
// the screen it came from can never disagree.
export interface ReportData {
  transactions: Transaction[];
  symbol: string;
  convert: (usd: number) => number;
  periodLabel: string;
  metrics: PeriodMetrics;
  previousMetrics: PeriodMetrics;
  products: ProductStat[];
  categories: GroupStat[];
  brands: GroupStat[];
  sellers: SellerStat[];
  payments: PaymentStat[];
  inventory: InventoryReport;
  forecast: Forecast;
  alerts: Alert[];
}

const BRAND: [number, number, number] = [33, 150, 243];

function money(symbol: string, convert: (n: number) => number, usd: number) {
  return `${symbol} ${convert(usd).toFixed(2)}`;
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function change(current: number, previous: number): string {
  if (previous === 0) return "—";
  const d = ((current - previous) / Math.abs(previous)) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

const ALERT_LABEL: Record<Alert["level"], string> = {
  critical: "Crítico",
  warning: "Atención",
  info: "Información",
  good: "Buena señal",
};

export function exportReportPdf(data: ReportData) {
  const { symbol, convert, metrics: m, previousMetrics: p, inventory } = data;
  const money_ = (usd: number) => money(symbol, convert, usd);
  const doc = new jsPDF();
  const generatedAt = format(new Date(), "PPP p");
  const next = () => (doc as any).lastAutoTable.finalY + 8;

  doc.setFontSize(18);
  doc.text("Reporte de gestión", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Período: ${data.periodLabel}`, 14, 25);
  doc.text(`Generado: ${generatedAt}`, 14, 30);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 37,
    head: [["Indicador", "Período", "Anterior", "Variación"]],
    body: [
      ["Ingresos", money_(m.revenue), money_(p.revenue), change(m.revenue, p.revenue)],
      ["Costo de la mercancía", money_(m.cost), money_(p.cost), change(m.cost, p.cost)],
      ["Ganancia neta", money_(m.profit), money_(p.profit), change(m.profit, p.profit)],
      ["Margen", pct(m.margin), pct(p.margin), `${(m.margin - p.margin).toFixed(1)} pts`],
      [
        "Transacciones",
        String(m.transactions),
        String(p.transactions),
        change(m.transactions, p.transactions),
      ],
      ["Ticket promedio", money_(m.avgTicket), money_(p.avgTicket), change(m.avgTicket, p.avgTicket)],
      ["Unidades vendidas", String(m.units), String(p.units), change(m.units, p.units)],
      ["Devoluciones", `${m.returnedUnits} u (${pct(m.returnRate)})`, `${p.returnedUnits} u`, "—"],
      ["Descuentos otorgados", money_(m.discountGiven), money_(p.discountGiven), pct(m.discountRate)],
    ],
    theme: "striped",
    headStyles: { fillColor: BRAND },
    styles: { fontSize: 9 },
  });

  if (data.alerts.length) {
    autoTable(doc, {
      startY: next(),
      head: [["Prioridad", "Hallazgo", "Detalle"]],
      body: data.alerts.map((a) => [ALERT_LABEL[a.level], a.title, a.detail]),
      theme: "striped",
      headStyles: { fillColor: BRAND },
      styles: { fontSize: 8, cellWidth: "wrap" },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 65 } },
    });
  }

  if (data.products.length) {
    autoTable(doc, {
      startY: next(),
      head: [["ABC", "Producto", "Unid.", "Ingresos", "Costo", "Ganancia", "Margen", "% lista", "Devol."]],
      body: data.products.map((it) => [
        it.abc,
        it.name,
        String(it.units),
        money_(it.revenue),
        money_(it.cost),
        money_(it.profit),
        pct(it.margin),
        `${it.priceRealization.toFixed(0)}%`,
        it.returnedUnits ? String(it.returnedUnits) : "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: BRAND },
      styles: { fontSize: 7.5 },
    });
  }

  const groupBody = (rows: GroupStat[]) =>
    rows.map((g) => [g.key, String(g.units), money_(g.revenue), money_(g.profit), pct(g.margin), pct(g.share)]);

  if (data.categories.length) {
    autoTable(doc, {
      startY: next(),
      head: [["Categoría", "Unid.", "Ingresos", "Ganancia", "Margen", "Peso"]],
      body: groupBody(data.categories),
      theme: "striped",
      headStyles: { fillColor: BRAND },
      styles: { fontSize: 8 },
    });
  }

  if (data.brands.length) {
    autoTable(doc, {
      startY: next(),
      head: [["Marca", "Unid.", "Ingresos", "Ganancia", "Margen", "Peso"]],
      body: groupBody(data.brands),
      theme: "striped",
      headStyles: { fillColor: BRAND },
      styles: { fontSize: 8 },
    });
  }

  if (data.sellers.length) {
    autoTable(doc, {
      startY: next(),
      head: [["Vendedor", "Ventas", "Ingresos", "Ticket prom.", "Margen", "Descuentos"]],
      body: data.sellers.map((s) => [
        s.seller,
        String(s.transactions),
        money_(s.revenue),
        money_(s.avgTicket),
        pct(s.margin),
        money_(s.discountGiven),
      ]),
      theme: "striped",
      headStyles: { fillColor: BRAND },
      styles: { fontSize: 8 },
    });
  }

  if (data.payments.length) {
    autoTable(doc, {
      startY: next(),
      head: [["Método de pago", "Ingresos", "Peso", "Ticket prom."]],
      body: data.payments.map((pm) => [
        pm.method,
        money_(pm.total),
        pct(pm.share),
        money_(pm.avgTicket),
      ]),
      theme: "striped",
      headStyles: { fillColor: BRAND },
      styles: { fontSize: 8 },
    });
  }

  autoTable(doc, {
    startY: next(),
    head: [["Inventario actual", "Valor"]],
    body: [
      ["Productos en catálogo", String(inventory.skus)],
      ["Unidades en stock", String(inventory.units)],
      ["Valor al costo", money_(inventory.costValue)],
      ["Valor a precio de venta", money_(inventory.retailValue)],
      ["Ganancia potencial", money_(inventory.potentialProfit)],
      ["Rotación del período", `${inventory.turnover.toFixed(2)}x`],
      [
        "Días de inventario",
        Number.isFinite(inventory.daysOfInventory)
          ? `${Math.round(inventory.daysOfInventory)} días`
          : "—",
      ],
      ["Agotados", String(inventory.outOfStock.length)],
      ["Agotados que sí se venden", String(inventory.lostSales.length)],
      ["Por agotarse (<7 días)", String(inventory.urgent.length)],
      ["Sin rotación", String(inventory.deadStock.length)],
      ["Nunca vendidos", String(inventory.neverSold.length)],
    ],
    theme: "striped",
    headStyles: { fillColor: BRAND },
    styles: { fontSize: 8 },
  });

  const plan = reorderPlan(inventory.rows, 30);
  if (plan.rows.length) {
    autoTable(doc, {
      startY: next(),
      head: [["Reponer (30 días)", "Stock", "Ritmo u/día", "Comprar", "Inversión", "Ganancia esperada"]],
      body: plan.rows.map((r) => [
        r.name,
        String(r.quantity),
        r.velocity.toFixed(2),
        String(r.suggestedQty),
        money_(r.purchaseCost),
        money_(r.expectedProfit),
      ]),
      foot: [
        ["Total", "", "", "", money_(plan.totalCost), money_(plan.expectedProfit)],
      ],
      theme: "striped",
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [240, 240, 240], textColor: 20 },
      styles: { fontSize: 8 },
    });
  }

  autoTable(doc, {
    startY: next(),
    head: [["Proyección", "Valor"]],
    body: [
      ["Próximos 7 días", money_(data.forecast.next7)],
      ["Próximos 30 días", money_(data.forecast.next30)],
      ["Ganancia esperada 30 días", money_(data.forecast.expectedProfit30)],
      [
        "Método",
        data.forecast.method === "trend"
          ? `Ajuste de tendencia (${(data.forecast.fit * 100).toFixed(0)}% de ajuste, ${data.forecast.sampleSize} días)`
          : `Promedio diario (${data.forecast.sampleSize} días, sin tendencia clara)`,
      ],
    ],
    theme: "striped",
    headStyles: { fillColor: BRAND },
    styles: { fontSize: 8 },
  });

  if (data.transactions.length) {
    autoTable(doc, {
      startY: next(),
      head: [["Fecha", "ID", "Vendedor", "Items", "Total"]],
      body: data.transactions.map((t) => [
        format(new Date(t.date), "dd/MM/yy HH:mm"),
        `#${t.id.slice(-8)}`,
        t.userId || "—",
        String(t.items.length),
        money_(t.total),
      ]),
      theme: "grid",
      headStyles: { fillColor: BRAND },
      styles: { fontSize: 8 },
    });
  }

  doc.save(`reporte-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}

export function exportReportExcel(data: ReportData) {
  const { convert, metrics: m, previousMetrics: p, inventory } = data;
  const c = (usd: number) => Number(convert(usd).toFixed(2));
  const wb = XLSX.utils.book_new();
  const sheet = (name: string, rows: (string | number)[][]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);

  sheet("Resumen", [
    ["Reporte de gestión"],
    ["Período", data.periodLabel],
    ["Generado", format(new Date(), "PPP p")],
    [],
    ["Indicador", "Período", "Anterior", "Variación %"],
    ["Ingresos", c(m.revenue), c(p.revenue), Number(change(m.revenue, p.revenue).replace("%", "")) || 0],
    ["Costo de la mercancía", c(m.cost), c(p.cost), Number(change(m.cost, p.cost).replace("%", "")) || 0],
    ["Ganancia neta", c(m.profit), c(p.profit), Number(change(m.profit, p.profit).replace("%", "")) || 0],
    ["Margen %", Number(m.margin.toFixed(1)), Number(p.margin.toFixed(1)), Number((m.margin - p.margin).toFixed(1))],
    ["Transacciones", m.transactions, p.transactions, Number(change(m.transactions, p.transactions).replace("%", "")) || 0],
    ["Ticket promedio", c(m.avgTicket), c(p.avgTicket), Number(change(m.avgTicket, p.avgTicket).replace("%", "")) || 0],
    ["Unidades", m.units, p.units, Number(change(m.units, p.units).replace("%", "")) || 0],
    ["Unidades devueltas", m.returnedUnits, p.returnedUnits, ""],
    ["Tasa de devolución %", Number(m.returnRate.toFixed(1)), Number(p.returnRate.toFixed(1)), ""],
    ["Descuentos otorgados", c(m.discountGiven), c(p.discountGiven), ""],
    ["Días con ventas", m.activeDays, p.activeDays, ""],
    [],
    ["Proyección 7 días", c(data.forecast.next7)],
    ["Proyección 30 días", c(data.forecast.next30)],
    ["Ganancia esperada 30 días", c(data.forecast.expectedProfit30)],
    ["Método de proyección", data.forecast.method === "trend" ? "Tendencia" : "Promedio"],
  ]);

  sheet("Alertas", [
    ["Prioridad", "Hallazgo", "Detalle", "Impacto estimado", "Productos"],
    ...data.alerts.map((a) => [
      ALERT_LABEL[a.level],
      a.title,
      a.detail,
      c(a.impact),
      (a.items || []).join(", "),
    ]),
  ]);

  sheet("Productos", [
    [
      "ABC",
      "Producto",
      "Categoría",
      "Marca",
      "Unidades",
      "Ingresos",
      "Costo",
      "Ganancia",
      "Margen %",
      "Precio promedio",
      "Precio lista",
      "% de lista",
      "Descuento cedido",
      "Devueltas",
      "Tasa devolución %",
      "Ventas",
      "Ritmo u/día",
      "Stock actual",
      "Última venta",
    ],
    ...data.products.map((it) => [
      it.abc,
      it.name,
      it.type,
      it.brand,
      it.units,
      c(it.revenue),
      c(it.cost),
      c(it.profit),
      Number(it.margin.toFixed(1)),
      c(it.avgPrice),
      c(it.listPrice),
      Number(it.priceRealization.toFixed(0)),
      c(it.discountGiven),
      it.returnedUnits,
      Number(it.returnRate.toFixed(1)),
      it.ticketCount,
      Number(it.velocity.toFixed(3)),
      it.inStock,
      it.lastSold ? format(it.lastSold, "yyyy-MM-dd") : "",
    ]),
  ]);

  const groupRows = (rows: GroupStat[], label: string) => [
    [label, "Productos", "Unidades", "Ingresos", "Costo", "Ganancia", "Margen %", "Peso %"],
    ...rows.map((g) => [
      g.key,
      g.products,
      g.units,
      c(g.revenue),
      c(g.cost),
      c(g.profit),
      Number(g.margin.toFixed(1)),
      Number(g.share.toFixed(1)),
    ]),
  ];
  sheet("Categorías", groupRows(data.categories, "Categoría"));
  sheet("Marcas", groupRows(data.brands, "Marca"));

  sheet("Vendedores", [
    ["Vendedor", "Ventas", "Ingresos", "Costo", "Ganancia", "Margen %", "Ticket promedio", "Unidades", "U/venta", "Descuentos", "Peso %"],
    ...data.sellers.map((s) => [
      s.seller,
      s.transactions,
      c(s.revenue),
      c(s.cost),
      c(s.profit),
      Number(s.margin.toFixed(1)),
      c(s.avgTicket),
      s.units,
      Number(s.unitsPerTicket.toFixed(2)),
      c(s.discountGiven),
      Number(s.share.toFixed(1)),
    ]),
  ]);

  sheet("Pagos", [
    ["Método", "Ingresos atribuidos", "Peso %", "Ventas", "Ticket promedio"],
    ...data.payments.map((pm) => [
      pm.method,
      c(pm.total),
      Number(pm.share.toFixed(1)),
      pm.transactions,
      c(pm.avgTicket),
    ]),
    [],
    ["Nota", "El total de cada venta se reparte entre sus métodos, para que el vuelto entregado no infle el efectivo."],
  ]);

  sheet("Inventario", [
    [
      "Producto",
      "Categoría",
      "Marca",
      "Stock",
      "Costo unitario",
      "Precio venta",
      "Capital al costo",
      "Valor a venta",
      "Ritmo u/día",
      "Cobertura días",
      "Días sin vender",
      "Vendidas en período",
    ],
    ...inventory.rows.map((r) => [
      r.name,
      r.type,
      r.brand,
      r.quantity,
      c(r.buyingPrice),
      c(r.sellingPrice),
      c(r.costValue),
      c(r.retailValue),
      Number(r.velocity.toFixed(3)),
      Number.isFinite(r.daysOfStock) ? Number(r.daysOfStock.toFixed(1)) : "",
      r.daysSinceLastSale ?? "",
      r.unitsSold,
    ]),
  ]);

  const plan = reorderPlan(inventory.rows, 30);
  sheet("Reposición", [
    ["Plan de compra para cubrir 30 días"],
    [],
    ["Producto", "Stock actual", "Ritmo u/día", "Cobertura días", "Comprar", "Inversión", "Ingreso esperado", "Ganancia esperada", "Se agota"],
    ...plan.rows.map((r) => [
      r.name,
      r.quantity,
      Number(r.velocity.toFixed(3)),
      Number.isFinite(r.daysOfStock) ? Number(r.daysOfStock.toFixed(1)) : "",
      r.suggestedQty,
      c(r.purchaseCost),
      c(r.expectedRevenue),
      c(r.expectedProfit),
      r.stockoutDate ? format(r.stockoutDate, "yyyy-MM-dd") : "",
    ]),
    [],
    ["Total", "", "", "", "", c(plan.totalCost), "", c(plan.expectedProfit), ""],
  ]);

  sheet("Transacciones", [
    ["Fecha", "ID", "Vendedor", "Items", "Unidades", "Subtotal", "Impuestos", "Total", "Notas"],
    ...data.transactions.map((t) => [
      format(new Date(t.date), "yyyy-MM-dd HH:mm"),
      t.id,
      t.userId || "",
      t.items.length,
      t.items.reduce((s, i) => s + (i.cartQuantity - (i.quantityReturned || 0)), 0),
      c(t.subtotal),
      c(t.tax),
      c(t.total),
      t.notes || "",
    ]),
  ]);

  XLSX.writeFile(wb, `reporte-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}
