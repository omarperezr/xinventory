import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { Transaction } from "../context/history-context";

// All figures here are in USD (the canonical currency). The caller passes a
// `convert` function and a `symbol` so the report can be rendered in whatever
// display currency the user currently has selected.
export interface ReportData {
  transactions: Transaction[];
  symbol: string;
  convert: (usd: number) => number;
  // Pre-computed aggregates from the reports view so the export matches exactly
  // what is shown on screen (net of returns, effective prices).
  itemSales: { name: string; quantity: number; total: number; cost: number }[];
  userSales: { user: string; total: number; count: number }[];
  paymentMethodTotals: { method: string; total: number }[];
  totals: {
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
    transactions: number;
    avgTicket: number;
  };
}

function money(symbol: string, convert: (n: number) => number, usd: number) {
  return `${symbol} ${convert(usd).toFixed(2)}`;
}

export function exportReportPdf(data: ReportData) {
  const { symbol, convert, totals } = data;
  const m = (usd: number) => money(symbol, convert, usd);
  const doc = new jsPDF();
  const generatedAt = format(new Date(), "PPP p");

  doc.setFontSize(18);
  doc.text("Reporte General de Ventas", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Generado: ${generatedAt}`, 14, 25);
  doc.setTextColor(0);

  // Summary KPIs
  autoTable(doc, {
    startY: 32,
    head: [["Indicador", "Valor"]],
    body: [
      ["Ingresos Totales", m(totals.revenue)],
      ["Costo de Ventas", m(totals.cost)],
      ["Ganancia Neta", m(totals.profit)],
      ["Margen", `${totals.margin.toFixed(1)}%`],
      ["Transacciones", String(totals.transactions)],
      ["Ticket Promedio", m(totals.avgTicket)],
    ],
    theme: "striped",
    headStyles: { fillColor: [33, 150, 243] },
    styles: { fontSize: 9 },
  });

  // Sales by seller
  if (data.userSales.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Vendedor", "Ventas", "Total"]],
      body: data.userSales.map((u) => [u.user, String(u.count), m(u.total)]),
      theme: "striped",
      headStyles: { fillColor: [33, 150, 243] },
      styles: { fontSize: 9 },
    });
  }

  // Payment methods
  if (data.paymentMethodTotals.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Método de Pago", "Total"]],
      body: data.paymentMethodTotals.map((p) => [p.method, m(p.total)]),
      theme: "striped",
      headStyles: { fillColor: [33, 150, 243] },
      styles: { fontSize: 9 },
    });
  }

  // Products
  if (data.itemSales.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Producto", "Unidades", "Ingresos", "Costo", "Ganancia"]],
      body: data.itemSales.map((it) => [
        it.name,
        String(it.quantity),
        m(it.total),
        m(it.cost),
        m(it.total - it.cost),
      ]),
      theme: "striped",
      headStyles: { fillColor: [33, 150, 243] },
      styles: { fontSize: 8 },
    });
  }

  // Transactions detail
  if (data.transactions.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Fecha", "ID", "Vendedor", "Items", "Total"]],
      body: data.transactions.map((t) => [
        format(new Date(t.date), "dd/MM/yy HH:mm"),
        `#${t.id.slice(-8)}`,
        t.userId || "—",
        String(t.items.length),
        m(t.total),
      ]),
      theme: "grid",
      headStyles: { fillColor: [33, 150, 243] },
      styles: { fontSize: 8 },
    });
  }

  doc.save(`reporte-ventas-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}

export function exportReportExcel(data: ReportData) {
  const { convert, totals } = data;
  const c = (usd: number) => Number(convert(usd).toFixed(2));
  const wb = XLSX.utils.book_new();

  // Resumen
  const summary = [
    ["Reporte General de Ventas"],
    ["Generado", format(new Date(), "PPP p")],
    [],
    ["Indicador", "Valor"],
    ["Ingresos Totales", c(totals.revenue)],
    ["Costo de Ventas", c(totals.cost)],
    ["Ganancia Neta", c(totals.profit)],
    ["Margen (%)", Number(totals.margin.toFixed(1))],
    ["Transacciones", totals.transactions],
    ["Ticket Promedio", c(totals.avgTicket)],
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(summary),
    "Resumen",
  );

  // Vendedores
  const sellers = [
    ["Vendedor", "Ventas", "Total"],
    ...data.userSales.map((u) => [u.user, u.count, c(u.total)]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(sellers),
    "Vendedores",
  );

  // Metodos de pago
  const payments = [
    ["Método de Pago", "Total"],
    ...data.paymentMethodTotals.map((p) => [p.method, c(p.total)]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(payments),
    "Pagos",
  );

  // Productos
  const products = [
    ["Producto", "Unidades", "Ingresos", "Costo", "Ganancia"],
    ...data.itemSales.map((it) => [
      it.name,
      it.quantity,
      c(it.total),
      c(it.cost),
      c(it.total - it.cost),
    ]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(products),
    "Productos",
  );

  // Transacciones
  const txs = [
    ["Fecha", "ID", "Vendedor", "Items", "Unidades", "Subtotal", "Impuestos", "Total"],
    ...data.transactions.map((t) => [
      format(new Date(t.date), "yyyy-MM-dd HH:mm"),
      t.id,
      t.userId || "",
      t.items.length,
      t.items.reduce((s, i) => s + (i.cartQuantity - (i.quantityReturned || 0)), 0),
      c(t.subtotal),
      c(t.tax),
      c(t.total),
    ]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(txs),
    "Transacciones",
  );

  XLSX.writeFile(wb, `reporte-ventas-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}
