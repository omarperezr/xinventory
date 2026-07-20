// Reports dashboard.
//
// One filter row scopes everything below it, then five panels answer five
// different questions:
//
//   Resumen     - how is the business doing, and what needs attention today
//   Ventas      - when demand happens, who closes it, how customers pay
//   Productos   - which items carry the business (past)
//   Inventario  - what is on the shelf and what it costs to keep it (present)
//   Proyección  - where sales are heading and what to buy (future)
//
// Every figure on screen is derived from the sales history the browser holds
// plus the live catalogue. The database is asked for one thing only: how many
// sales really exist in the selected range, so the screen can say out loud when
// it is looking at an incomplete window instead of quietly under-reporting.

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useHistory } from "../context/history-context";
import { useApp } from "../context/app-context";
import { supabase } from "../services/supabase";
import {
  BarChart2,
  Boxes,
  CalendarRange,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  LayoutDashboard,
  Loader2,
  Package,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "./ui/button";
import { format } from "date-fns";
import {
  buildReport,
  PERIOD_OPTIONS,
  resolveRange,
  type PeriodKey,
} from "../services/report-analytics";
import { compact } from "./reports/report-ui";
import type { ReportData } from "../services/report-export";

// jspdf + xlsx are heavy; load them only when an export button is clicked.
const exportReportPdf = async (data: ReportData) =>
  (await import("../services/report-export")).exportReportPdf(data);
const exportReportExcel = async (data: ReportData) =>
  (await import("../services/report-export")).exportReportExcel(data);

// Only the active panel is mounted, and each one is its own chunk: opening
// "Resumen" should not pay for the product table or the forecast.
const OverviewPanel = lazy(() =>
  import("./reports/overview-panel").then((m) => ({ default: m.OverviewPanel })),
);
const SalesPanel = lazy(() =>
  import("./reports/sales-panel").then((m) => ({ default: m.SalesPanel })),
);
const ProductsPanel = lazy(() =>
  import("./reports/products-panel").then((m) => ({ default: m.ProductsPanel })),
);
const InventoryPanel = lazy(() =>
  import("./reports/inventory-panel").then((m) => ({ default: m.InventoryPanel })),
);
const ForecastPanel = lazy(() =>
  import("./reports/forecast-panel").then((m) => ({ default: m.ForecastPanel })),
);

type TabKey = "resumen" | "ventas" | "productos" | "inventario" | "proyeccion";

const TABS: { key: TabKey; label: string; icon: typeof BarChart2; hint: string }[] = [
  { key: "resumen", label: "Resumen", icon: LayoutDashboard, hint: "Cómo va el negocio" },
  { key: "ventas", label: "Ventas", icon: TrendingUp, hint: "Cuándo y quién vende" },
  { key: "productos", label: "Productos", icon: Boxes, hint: "Qué deja dinero" },
  { key: "inventario", label: "Inventario", icon: Package, hint: "Qué hay en estante" },
  { key: "proyeccion", label: "Proyección", icon: Sparkles, hint: "Qué viene y qué comprar" },
];

export function ReportsView() {
  const { transactions, hasMore, loadingMore, loadMore } = useHistory();
  const { formatPrice, items, convertPrice, currencySymbol } = useApp();

  const [tab, setTab] = useState<TabKey>("resumen");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const range = useMemo(
    () => resolveRange(period, transactions, custom),
    [period, transactions, custom],
  );

  // The expensive part: one pass over every loaded sale and line item.
  const report = useMemo(
    () => buildReport(transactions, items, range),
    [transactions, items, range],
  );

  // How many sales the database has in this range, regardless of how many the
  // browser happens to hold. Purely a completeness check - every figure on
  // screen still comes from the local pipeline, so the two can be compared.
  const [serverCount, setServerCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("report_summary", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        const total = (data as any)?.totals?.transactions;
        setServerCount(!error && typeof total === "number" ? total : null);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from.getTime(), range.to.getTime(), transactions.length]);

  const loadedCount = report.metrics.transactions;
  const isPartial = serverCount !== null && serverCount > loadedCount;

  const money = (usd: number) => formatPrice(usd);
  const moneyCompact = (usd: number) => `${currencySymbol} ${compact(convertPrice(usd))}`;

  const panelProps = {
    report,
    money,
    moneyCompact,
    convert: convertPrice,
    symbol: currencySymbol,
  };

  const hasData = loadedCount > 0;

  const buildReportData = (): ReportData => ({
    transactions: report.rangeTransactions,
    symbol: currencySymbol,
    convert: convertPrice,
    periodLabel: `${format(range.from, "dd/MM/yyyy")} — ${format(range.to, "dd/MM/yyyy")}`,
    metrics: report.metrics,
    previousMetrics: report.previousMetrics,
    products: report.products,
    categories: report.categories,
    brands: report.brands,
    sellers: report.sellers,
    payments: report.payments,
    inventory: report.inventory,
    forecast: report.forecast,
    alerts: report.alerts,
  });

  return (
    <div className="space-y-4 md:space-y-5 pb-8">
      {/* Filter row - scopes every panel below it */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-primary" />
              Panel de reportes
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {format(range.from, "dd/MM/yyyy")} — {format(range.to, "dd/MM/yyyy")} ·{" "}
              {range.days} día(s) · {loadedCount} venta(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-0.5">
              {PERIOD_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setPeriod(o.key)}
                  title={o.label}
                  className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                    period === o.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {o.short}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPeriod("custom")}
                title="Rango personalizado"
                className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1 ${
                  period === "custom"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" />
                Rango
              </button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={!hasData}
                onClick={() => exportReportPdf(buildReportData())}
              >
                <FileText className="w-4 h-4 mr-1.5 text-red-500" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={!hasData}
                onClick={() => exportReportExcel(buildReportData())}
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5 text-green-600" />
                Excel
              </Button>
            </div>
          </div>
        </div>

        {period === "custom" && (
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <label className="text-[11px] text-gray-500">
              Desde
              <input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="block mt-0.5 text-xs border border-gray-200 rounded-md px-2 py-1.5"
              />
            </label>
            <label className="text-[11px] text-gray-500">
              Hasta
              <input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="block mt-0.5 text-xs border border-gray-200 rounded-md px-2 py-1.5"
              />
            </label>
            {!custom.from && (
              <p className="text-[11px] text-gray-500 pb-1.5">
                Elige una fecha inicial para aplicar el rango.
              </p>
            )}
          </div>
        )}

        {/* Say it out loud when the local window does not cover the range. */}
        {isPartial && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              El período tiene {serverCount} ventas registradas y el navegador
              tiene {loadedCount}. Los reportes muestran solo las cargadas.
            </span>
            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                className="text-meta h-9 ml-auto"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 mr-1" />
                )}
                Cargar más historial
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Panel navigation */}
      <nav className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <ul className="flex gap-2 min-w-max md:min-w-0">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? "bg-white border-primary/40 shadow-sm"
                      : "bg-white/60 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      active ? "text-primary" : "text-gray-500"
                    }`}
                  />
                  <span>
                    <span
                      className={`block text-xs md:text-sm font-medium ${
                        active ? "text-gray-900" : "text-gray-600"
                      }`}
                    >
                      {t.label}
                    </span>
                    <span className="hidden md:block text-meta text-gray-500 leading-tight">
                      {t.hint}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {!hasData ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BarChart2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 text-sm font-medium">
            No hay ventas en el período seleccionado
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Prueba con un rango más amplio, por ejemplo «Todo».
          </p>
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16 text-gray-500 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Calculando…
            </div>
          }
        >
          {tab === "resumen" && <OverviewPanel {...panelProps} />}
          {tab === "ventas" && <SalesPanel {...panelProps} />}
          {tab === "productos" && <ProductsPanel {...panelProps} />}
          {tab === "inventario" && <InventoryPanel {...panelProps} />}
          {tab === "proyeccion" && <ForecastPanel {...panelProps} />}
        </Suspense>
      )}
    </div>
  );
}
