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
        balances: finance.balances,
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
      finance.balances,
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
      <div className="flex items-center justify-center py-20 text-muted-foreground text-base gap-2">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        Cargando finanzas…
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5 pb-8">
      {/* Filter row */}
      <div className="bg-white rounded-xl border border-border shadow-card p-4 md:p-5 space-y-3">
        {/* Two deliberate rows: title + actions, then the period picker on its
            own line — one flex-wrap row orphaned "Configurar" into the title
            block at 1280. */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2">
                <Banknote className="size-5 text-primary" aria-hidden="true" />
                Finanzas
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5" data-money>
                {format(range.from, "dd/MM/yyyy")} — {format(range.to, "dd/MM/yyyy")} ·{" "}
                {range.days} día(s) · {report.entryCount} movimiento(s)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setEntryOpen(true)}>
                <Plus aria-hidden="true" />
                Movimiento
              </Button>
              {isAdmin && (
                <>
                  <Button variant="outline" onClick={() => setPurchaseOpen(true)}>
                    <Truck aria-hidden="true" />
                    Compra
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setSetupOpen(true)}
                    aria-label="Configuración de finanzas"
                  >
                    <Settings2 aria-hidden="true" />
                    Configurar
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1 bg-secondary rounded-xl p-1 max-w-full self-start">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPeriod(option.key)}
                title={option.label}
                className={`h-11 px-4 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  period === option.key
                    ? "bg-white text-primary shadow-card"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.short}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPeriod("custom")}
              title="Rango personalizado"
              className={`h-11 px-4 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                period === "custom"
                  ? "bg-white text-primary shadow-card"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarRange className="size-4" aria-hidden="true" />
              Rango
            </button>
          </div>
        </div>

        {period === "custom" && (
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <label className="text-sm font-semibold text-foreground">
              Desde
              <input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="block mt-1 h-12 text-base border border-input bg-input-background rounded-lg px-3.5"
              />
            </label>
            <label className="text-sm font-semibold text-foreground">
              Hasta
              <input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="block mt-1 h-12 text-base border border-input bg-input-background rounded-lg px-3.5"
              />
            </label>
          </div>
        )}

        {finance.offline && (
          <div className="flex items-center gap-2 text-sm text-pending bg-pending-soft rounded-lg px-3.5 py-2.5">
            <Info className="size-5 shrink-0" aria-hidden="true" />
            Sin conexión: se muestra la última copia guardada en este dispositivo.
            Lo que registres se enviará al reconectar.
          </div>
        )}

        {/* Without the server totals the balances only cover the loaded window,
            which understates every pot. Say it rather than show a wrong saldo. */}
        {!finance.loading && !finance.balances && (
          <div className="flex items-center gap-2 text-sm text-pending bg-pending-soft rounded-lg px-3.5 py-2.5">
            <Info className="size-5 shrink-0" aria-hidden="true" />
            Saldos parciales: no se pudo consultar el acumulado en el servidor,
            así que solo se suman los movimientos y ventas cargados aquí.
          </div>
        )}

        {isPartial && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-pending bg-pending-soft rounded-lg px-3.5 py-2.5">
            <Info className="size-5 shrink-0" aria-hidden="true" />
            <span>
              El período tiene {serverCount} movimientos registrados y el
              navegador tiene {report.entryCount}. Los cálculos usan solo los
              cargados.
            </span>
            {finance.hasMore && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={finance.loadingMore}
                onClick={finance.loadMore}
              >
                {finance.loadingMore ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
                Cargar más
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Panel navigation. Never scrolls: on phones the tabs wrap into a
          grid with the label under the icon, on md+ the usual pill row. */}
      <nav>
        <ul className="grid grid-cols-4 gap-1 rounded-xl bg-secondary p-1 md:flex">
          {visibleTabs.map((option) => {
            const Icon = option.icon;
            const active = tab === option.key;
            return (
              <li key={option.key} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setTab(option.key)}
                  aria-current={active ? "page" : undefined}
                  title={option.hint}
                  className={`w-full flex flex-col items-center gap-0.5 px-1 py-1.5 md:w-auto md:flex-row md:gap-2 md:h-11 md:px-4 md:py-0 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? "bg-white text-primary shadow-card"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-5 md:size-4 shrink-0" aria-hidden="true" />
                  <span className="text-meta md:text-sm max-w-full truncate">
                    {option.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16 text-muted-foreground text-base gap-2">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
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
