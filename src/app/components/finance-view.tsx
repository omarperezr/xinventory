// Finance dashboard.
//
// One date filter scopes the panels below it, exactly like the reports screen.
// Everything is computed in the browser from the ledger window it holds, the
// sales history and the catalogue; the database is asked one question only -
// how many ledger rows really exist in the range - so the screen can say out
// loud when it is looking at a partial window instead of under-reporting.

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Banknote,
  CalendarRange,
  Download,
  Info,
  Landmark,
  Loader2,
  Plus,
  Receipt,
  Settings2,
  Target,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "./ui/button";
import { useApp } from "../context/app-context";
import { useAuth } from "../context/auth-context";
import { useFinance } from "../context/finance-context";
import { useHistory } from "../context/history-context";
import { supabase } from "../services/supabase";
import {
  PERIOD_OPTIONS,
  resolveRange,
  type PeriodKey,
} from "../services/report-analytics";
import { buildFinanceReport } from "../services/finance-analytics";
import { compact } from "./reports/report-ui";
import { EntryDialog } from "./finance/entry-dialog";
import { PurchaseDialog } from "./finance/purchase-dialog";
import { SetupDialog } from "./finance/setup-dialog";

// Each panel is its own chunk: opening "Resumen" should not pay for the
// purchase tables or the supplier comparison.
const FinanceOverviewPanel = lazy(() =>
  import("./finance/overview-panel").then((m) => ({
    default: m.FinanceOverviewPanel,
  })),
);
const LedgerPanel = lazy(() =>
  import("./finance/ledger-panel").then((m) => ({ default: m.LedgerPanel })),
);
const ObligationsPanel = lazy(() =>
  import("./finance/obligations-panel").then((m) => ({
    default: m.ObligationsPanel,
  })),
);
const BudgetPanel = lazy(() =>
  import("./finance/budget-panel").then((m) => ({ default: m.BudgetPanel })),
);
const AccountsPanel = lazy(() =>
  import("./finance/accounts-panel").then((m) => ({ default: m.AccountsPanel })),
);
const PurchasesPanel = lazy(() =>
  import("./finance/purchases-panel").then((m) => ({
    default: m.PurchasesPanel,
  })),
);
const SuppliersPanel = lazy(() =>
  import("./finance/suppliers-panel").then((m) => ({
    default: m.SuppliersPanel,
  })),
);

type TabKey =
  | "resumen"
  | "movimientos"
  | "obligaciones"
  | "presupuesto"
  | "cuentas"
  | "compras"
  | "proveedores";

const TABS: {
  key: TabKey;
  label: string;
  icon: typeof Wallet;
  hint: string;
  adminOnly?: boolean;
}[] = [
  { key: "resumen", label: "Resumen", icon: Banknote, hint: "Si el negocio ganó o perdió" },
  { key: "movimientos", label: "Movimientos", icon: Receipt, hint: "Todo lo que entró y salió" },
  { key: "obligaciones", label: "Obligaciones", icon: Landmark, hint: "Lo que se debe y se cobra" },
  { key: "presupuesto", label: "Presupuesto", icon: Target, hint: "En qué se va el dinero" },
  { key: "cuentas", label: "Cuentas", icon: Wallet, hint: "Dónde está la plata" },
  { key: "compras", label: "Compras", icon: Truck, hint: "Mercancía que entró", adminOnly: true },
  { key: "proveedores", label: "Proveedores", icon: Users, hint: "Quién surte y a qué precio", adminOnly: true },
];

/** The finance_summary RPC answers with an untyped JSON document. Read the one
 *  number we need through checks instead of asserting a shape. */
function readEntryCount(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const value = (data as { entries?: unknown }).entries;
  return typeof value === "number" ? value : undefined;
}

export function FinanceView() {
  const {
    items,
    formatPrice,
    convertPrice,
    currencySymbol,
    honestRate,
  } = useApp();
  const { transactions } = useHistory();
  const { currentUser } = useAuth();
  const finance = useFinance();

  const isAdmin = currentUser?.role === "admin";

  const [tab, setTab] = useState<TabKey>("resumen");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [entryOpen, setEntryOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const range = useMemo(
    () => resolveRange(period, transactions, custom),
    [period, transactions, custom],
  );

  const report = useMemo(
    () =>
      buildFinanceReport({
        entries: finance.entries,
        categories: finance.categories,
        accounts: finance.accounts,
        payees: finance.payees,
        allocations: finance.allocations,
        recurring: finance.recurring,
        purchases: finance.purchases,
        purchaseLines: finance.purchaseLines,
        purchaseReturns: finance.purchaseReturns,
        transactions,
        items,
        range,
        honestRate,
      }),
    [
      finance.entries,
      finance.categories,
      finance.accounts,
      finance.payees,
      finance.allocations,
      finance.recurring,
      finance.purchases,
      finance.purchaseLines,
      finance.purchaseReturns,
      transactions,
      items,
      range,
      honestRate,
    ],
  );

  // How many ledger rows the database holds for this range, regardless of how
  // many the browser has. A completeness check only - every figure on screen
  // still comes from the local pipeline.
  const [serverCount, setServerCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("finance_summary", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        const total = readEntryCount(data);
        setServerCount(!error && total !== undefined ? total : null);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from.getTime(), range.to.getTime(), finance.entries.length]);

  const isPartial = serverCount !== null && serverCount > report.entryCount;

  const money = (usd: number) => formatPrice(usd);
  const moneyCompact = (usd: number) =>
    `${currencySymbol} ${compact(convertPrice(usd))}`;

  const panelProps = {
    report,
    money,
    moneyCompact,
    convert: convertPrice,
    symbol: currencySymbol,
    accounts: finance.accounts,
    categories: finance.categories,
    payees: finance.payees,
    isAdmin: !!isAdmin,
  };

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  if (finance.loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando finanzas…
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5 pb-8">
      {/* Filter row */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Banknote className="w-5 h-5 text-primary" />
              Finanzas
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {format(range.from, "dd/MM/yyyy")} — {format(range.to, "dd/MM/yyyy")} ·{" "}
              {range.days} día(s) · {report.entryCount} movimiento(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-0.5">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPeriod(option.key)}
                  title={option.label}
                  className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                    period === option.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {option.short}
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

            <Button size="sm" className="text-xs" onClick={() => setEntryOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Movimiento
            </Button>
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setPurchaseOpen(true)}
                >
                  <Truck className="w-4 h-4 mr-1.5" />
                  Compra
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setSetupOpen(true)}
                  aria-label="Configuración de finanzas"
                >
                  <Settings2 className="w-4 h-4" />
                </Button>
              </>
            )}
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
          </div>
        )}

        {finance.offline && (
          <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            Sin conexión: se muestra la última copia guardada en este dispositivo.
            Lo que registres se enviará al reconectar.
          </div>
        )}

        {isPartial && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              El período tiene {serverCount} movimientos registrados y el
              navegador tiene {report.entryCount}. Los cálculos usan solo los
              cargados.
            </span>
            {finance.hasMore && (
              <Button
                variant="outline"
                size="sm"
                className="text-meta h-9 ml-auto"
                disabled={finance.loadingMore}
                onClick={finance.loadMore}
              >
                {finance.loadingMore ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 mr-1" />
                )}
                Cargar más
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Panel navigation */}
      <nav className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <ul className="flex gap-2 min-w-max md:min-w-0">
          {visibleTabs.map((option) => {
            const Icon = option.icon;
            const active = tab === option.key;
            return (
              <li key={option.key}>
                <button
                  type="button"
                  onClick={() => setTab(option.key)}
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
                      {option.label}
                    </span>
                    <span className="hidden md:block text-meta text-gray-500 leading-tight">
                      {option.hint}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16 text-gray-500 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Calculando…
          </div>
        }
      >
        {tab === "resumen" && <FinanceOverviewPanel {...panelProps} />}
        {tab === "movimientos" && <LedgerPanel {...panelProps} />}
        {tab === "obligaciones" && <ObligationsPanel {...panelProps} />}
        {tab === "presupuesto" && <BudgetPanel {...panelProps} />}
        {tab === "cuentas" && (
          <AccountsPanel {...panelProps} onManage={() => setSetupOpen(true)} />
        )}
        {tab === "compras" && isAdmin && (
          <PurchasesPanel
            {...panelProps}
            onNewPurchase={() => setPurchaseOpen(true)}
          />
        )}
        {tab === "proveedores" && isAdmin && <SuppliersPanel {...panelProps} />}
      </Suspense>

      <EntryDialog open={entryOpen} onOpenChange={setEntryOpen} />
      {isAdmin && (
        <>
          <PurchaseDialog open={purchaseOpen} onOpenChange={setPurchaseOpen} />
          <SetupDialog open={setupOpen} onOpenChange={setSetupOpen} />
        </>
      )}
    </div>
  );
}
