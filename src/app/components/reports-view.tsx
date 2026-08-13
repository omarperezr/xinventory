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
import { useApp, formatMoneyValue } from "../context/app-context";
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

/**
 * The `report_summary` RPC answers with an untyped JSON document. Reach for
 * the one number we need through checks rather than asserting a shape onto
 * the whole payload.
 */
function readTransactionTotal(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const totals = (data as { totals?: unknown }).totals;
  if (!totals || typeof totals !== "object") return undefined;
  const value = (totals as { transactions?: unknown }).transactions;
  return typeof value === "number" ? value : undefined;
}

export function ReportsView() {
  const { transactions, hasMore, loadingMore, loadMore } = useHistory();
  const { formatPrice, items, convertPrice, currencySymbol, currency, honestRate } =
    useApp();

  const [tab, setTab] = useState<TabKey>("resumen");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const range = useMemo(
    () => resolveRange(period, transactions, custom),
    [period, transactions, custom],
  );

  // The expensive part: one pass over every loaded sale and line item.
  // `!hasMore` tells it the browser holds the entire history, which is what
  // separates "the previous period was empty" from "we never loaded it".
  const report = useMemo(
    () => buildReport(transactions, items, range, undefined, !hasMore),
    [transactions, items, range, hasMore],
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
        const total = readTransactionTotal(data);
        setServerCount(!error && total !== undefined ? total : null);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from.getTime(), range.to.getTime(), transactions.length]);

  // What a past sale cost in bolivares was fixed by the rate stamped on it, so
  // today's rate must not restate it. The loaded Transaction drops that column,
  // so read it back for the range.
  const [rateByTx, setRateByTx] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("transactions")
      .select("id, honest_rate")
      .gte("date", range.from.toISOString())
      .lte("date", range.to.toISOString())
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setRateByTx(new Map(data.map((r) => [r.id, Number(r.honest_rate) || 0])));
      });
    return () => {
      cancelled = true;
    };
  }, [range.from.getTime(), range.to.getTime(), transactions.length]);

  // One rate for the period, weighted by what each sale brought in, because the
  // panels convert plain USD aggregates and cannot ask per sale: revenue then
  // converts to exactly the bolivares charged, sale by sale. Sales with no
  // snapshot (history predating the column, sales queued offline) use today's.
  const periodRate = useMemo(() => {
    let usd = 0;
    let bs = 0;
    for (const t of report.rangeTransactions) {
      usd += t.total;
      bs += t.total * (rateByTx.get(t.id) || honestRate);
    }
    return usd > 0 ? bs / usd : honestRate;
  }, [report.rangeTransactions, rateByTx, honestRate]);

  const loadedCount = report.metrics.transactions;
  const isPartial = serverCount !== null && serverCount > loadedCount;

  const money = (usd: number) => formatPrice(usd);
  const moneyCompact = (usd: number) => `${currencySymbol} ${compact(convertPrice(usd))}`;

  // Only the honest bolivar lens is money that was really charged; the BCV, EUR
  // and USDT lenses are "what this looks like at that rate today" by definition.
  const convertPast = (usd: number) =>
    currency === "BS" ? usd * periodRate : convertPrice(usd);
  const moneyPast = (usd: number) => `${currencySymbol} ${formatMoneyValue(convertPast(usd))}`;
  const moneyPastCompact = (usd: number) =>
    `${currencySymbol} ${compact(convertPast(usd))}`;

  // Inventario prices what is on the shelf now and Proyección what has not been
  // sold yet; every other panel prices sales that already happened.
  const past = tab !== "inventario" && tab !== "proyeccion";
  const panelProps = {
    report,
    money: past ? moneyPast : money,
    moneyCompact: past ? moneyPastCompact : moneyCompact,
    convert: past ? convertPast : convertPrice,
    symbol: currencySymbol,
  };

  const hasData = loadedCount > 0;

  const buildReportData = (): ReportData => ({
    transactions: report.rangeTransactions,
    symbol: currencySymbol,
    convert: convertPast,
    convertNow: convertPrice,
    periodLabel: `${format(range.from, "dd/MM/yyyy")} — ${format(range.to, "dd/MM/yyyy")}`,
    metrics: report.metrics,
    previousMetrics: report.previousMetrics,
    previousCovered: report.previousCovered,
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
      <div className="bg-white rounded-xl border border-border shadow-card p-4 md:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-bold text-foreground flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-primary" aria-hidden="true" />
              Panel de reportes
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {format(range.from, "dd/MM/yyyy")} — {format(range.to, "dd/MM/yyyy")} ·{" "}
              {range.days} día(s) · {loadedCount} venta(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 bg-secondary rounded-lg p-0.5">
              {PERIOD_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setPeriod(o.key)}
                  title={o.label}
                  aria-pressed={period === o.key}
                  className={`tap-target text-sm px-3 py-1.5 rounded-md font-semibold transition-colors ${
                    period === o.key
                      ? "bg-white text-primary shadow-card"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {o.short}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPeriod("custom")}
                title="Rango personalizado"
                aria-pressed={period === "custom"}
                className={`tap-target text-sm px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1 ${
                  period === "custom"
                    ? "bg-white text-primary shadow-card"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />
                Rango
              </button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasData}
                onClick={() => exportReportPdf(buildReportData())}
              >
                <FileText aria-hidden="true" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasData}
                onClick={() => exportReportExcel(buildReportData())}
              >
                <FileSpreadsheet aria-hidden="true" />
                Excel
              </Button>
            </div>
          </div>
        </div>

        {period === "custom" && (
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <label className="text-sm text-muted-foreground">
              Desde
              <input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="block mt-1 h-11 text-base border border-input rounded-lg px-3"
              />
            </label>
            <label className="text-sm text-muted-foreground">
              Hasta
              <input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="block mt-1 h-11 text-base border border-input rounded-lg px-3"
              />
            </label>
            {!custom.from && (
              <p className="text-sm text-muted-foreground pb-1.5">
                Elige una fecha inicial para aplicar el rango.
              </p>
            )}
          </div>
        )}

        {/* Say it out loud when the local window does not cover the range, or
            the one before it: the comparison reads from the same loaded page,
            which routinely stops short of the previous window even when the
            selected range is complete. */}
        {(isPartial || !report.previousCovered) && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-pending bg-pending-soft border border-pending-strong/40 rounded-lg px-3 py-2">
            <Info className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span>
              {isPartial && (
                <>
                  El período tiene {serverCount} ventas registradas y el
                  navegador tiene {loadedCount}. Los reportes muestran solo las
                  cargadas.{" "}
                </>
              )}
              {!report.previousCovered && (
                <>
                  El período anterior ({format(report.previous.from, "dd/MM/yyyy")}{" "}
                  — {format(report.previous.to, "dd/MM/yyyy")}) no está cargado
                  completo, así que se omite la comparación contra él.
                </>
              )}
            </span>
            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
                Cargar más historial
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Panel navigation - segmented control, horizontally scrollable on phones */}
      <nav aria-label="Secciones del reporte" className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <ul className="flex gap-1 bg-secondary rounded-xl p-1 min-w-max md:min-w-0">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 h-11 px-4 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? "bg-white text-primary shadow-card"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4.5 flex-shrink-0" aria-hidden="true" />
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {!hasData ? (
        <div className="bg-white rounded-xl border border-border p-10 md:p-14 text-center shadow-card">
          <BarChart2
            className="mx-auto mb-3 size-10 text-muted-foreground/50"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h3 className="text-base font-semibold text-foreground mb-1">
            No hay ventas en el período seleccionado
          </h3>
          <p className="text-sm text-muted-foreground">
            Prueba con un rango más amplio, por ejemplo «Todo».
          </p>
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
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
