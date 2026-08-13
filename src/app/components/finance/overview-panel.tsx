// "Resumen" - did the business actually make money, and can it keep paying for
// itself. Everything else in the module is a drill-down of something here.
//
// The profit statement is the centrepiece and it is deliberately not a list of
// payments: buying stock is missing from it on purpose, because that money
// became inventory rather than being consumed. It reappears in the cash flow.

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  PiggyBank,
  Scale,
  Target,
} from "lucide-react";
import {
  ChartTooltip,
  Kpi,
  KpiRow,
  MeterBar,
  SectionCard,
  EmptyNote,
} from "../reports/report-ui";
import { AlertList, FinancePanelProps, PnlRow } from "./finance-ui";
import { formatMoneyValue } from "../../context/app-context";

// Rule of the palette: money green for the one accent, red only for state.
const CHART = { income: "#0f7b4d", expense: "#c05252" } as const;
const GRID = "#e3e8e6";
const TICK = { fontSize: 12, fill: "#55625c" } as const;

export function FinanceOverviewPanel({
  report,
  money,
  moneyCompact,
  convert,
  symbol,
}: FinancePanelProps) {
  const { pnl, previousPnl, breakEven, runway, cashFlow, obligations } = report;

  const delta = (current: number, previous: number): number | null => {
    if (previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  const trendData = report.trend.map((point) => ({
    month: point.month.slice(5),
    ingresos: convert(point.income),
    gastos: convert(point.expense),
    neto: convert(point.net),
  }));

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Headline: the four figures the owner opens this screen for. */}
      <KpiRow>
        <Kpi
          label="Utilidad neta"
          value={money(pnl.netProfit)}
          delta={delta(pnl.netProfit, previousPnl.netProfit)}
          tone={pnl.netProfit >= 0 ? "good" : "critical"}
          hint={`${pnl.netMarginPct.toFixed(1).replace(".", ",")}% de las ventas`}
        />
        <Kpi
          label="Efectivo disponible"
          value={money(runway.cashUsd)}
          hint={
            runway.months === null
              ? "sin gastos registrados"
              : `alcanza ${runway.months.toFixed(1).replace(".", ",")} mes(es)`
          }
          tone={runway.months !== null && runway.months < 2 ? "critical" : "default"}
        />
        <Kpi
          label="Gastos del período"
          value={money(pnl.operatingExpenses)}
          delta={delta(pnl.operatingExpenses, previousPnl.operatingExpenses)}
          higherIsBetter={false}
          hint={`${money(pnl.fixedExpenses)} fijos`}
        />
        <Kpi
          label="Por pagar"
          value={money(obligations.payablesUsd)}
          hint={
            obligations.overdueCount > 0
              ? `${obligations.overdueCount} vencida(s)`
              : `${money(obligations.next30Usd)} en 30 días`
          }
          tone={obligations.overdueCount > 0 ? "critical" : "default"}
        />
      </KpiRow>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-5">
        {/* Profit statement */}
        <SectionCard
          title="Estado de resultados"
          subtitle="Lo que quedó después de todo, no lo que entró en caja"
          icon={<Scale className="size-5 text-primary" aria-hidden="true" />}
        >
          <PnlRow label="Ventas" value={money(pnl.salesRevenue)} />
          <PnlRow
            label="Costo de la mercancía vendida"
            value={`− ${money(pnl.costOfGoodsSold)}`}
            hint="Lo que costó comprar exactamente lo que se vendió"
            indent
          />
          <PnlRow
            label="Utilidad bruta"
            value={money(pnl.grossProfit)}
            hint={`Margen ${pnl.grossMarginPct.toFixed(1).replace(".", ",")}%`}
            emphasis
          />
          <PnlRow
            label="Gastos fijos"
            value={`− ${money(pnl.fixedExpenses)}`}
            indent
          />
          <PnlRow
            label="Gastos variables"
            value={`− ${money(pnl.variableExpenses)}`}
            indent
          />
          {pnl.taxExpenses > 0 && (
            <PnlRow
              label="Impuestos"
              value={`− ${money(pnl.taxExpenses)}`}
              indent
            />
          )}
          <PnlRow
            label="Utilidad operativa"
            value={money(pnl.operatingProfit)}
            negative={pnl.operatingProfit < 0}
            emphasis
          />
          {pnl.otherIncome > 0 && (
            <PnlRow
              label="Otros ingresos"
              value={`+ ${money(pnl.otherIncome)}`}
              indent
            />
          )}
          <PnlRow
            label="Utilidad neta"
            value={money(pnl.netProfit)}
            negative={pnl.netProfit < 0}
            emphasis
          />

          {(pnl.investments > 0 || pnl.ownerDraws > 0) && (
            <div className="mt-3 pt-3 border-t border-dashed border-border">
              <p className="text-sm text-muted-foreground mb-1">
                Debajo de la línea: no son costos del negocio, pero se llevan la
                utilidad.
              </p>
              {pnl.investments > 0 && (
                <PnlRow
                  label="Apartado para inversión"
                  value={`− ${money(pnl.investments)}`}
                  indent
                />
              )}
              {pnl.ownerDraws > 0 && (
                <PnlRow
                  label="Retiros del dueño"
                  value={`− ${money(pnl.ownerDraws)}`}
                  indent
                />
              )}
              <PnlRow
                label="Queda en el negocio"
                value={money(pnl.retained)}
                negative={pnl.retained < 0}
                emphasis
              />
            </div>
          )}

          {pnl.merchandisePurchases > 0 && (
            <p className="text-sm text-muted-foreground mt-3 leading-snug">
              Se compraron {money(pnl.merchandisePurchases)} en mercancía este
              período. No aparece arriba porque ese dinero se convirtió en
              inventario: entra al resultado cuando se venda.
            </p>
          )}
        </SectionCard>

        <div className="space-y-4 md:space-y-5">
          {/* Break-even */}
          <SectionCard
            title="Punto de equilibrio"
            subtitle="Cuánto hay que vender solo para no perder"
            icon={<Target className="size-5 text-primary" aria-hidden="true" />}
          >
            {breakEven.reachable ? (
              <div className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Ventas necesarias al día</p>
                    <p className="text-2xl font-bold text-foreground" data-money>
                      {money(breakEven.dailySalesNeeded)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Vas en</p>
                    <p
                      data-money
                      className={`text-2xl font-bold ${
                        breakEven.coveragePct >= 100
                          ? "text-primary-soft-foreground"
                          : "text-destructive"
                      }`}
                    >
                      {money(breakEven.currentDailySales)}
                    </p>
                  </div>
                </div>
                <MeterBar
                  pct={Math.min(breakEven.coveragePct, 100)}
                  color={
                    breakEven.coveragePct >= 100 ? "#0f7b4d" : "#c05252"
                  }
                />
                <p className="text-sm text-muted-foreground leading-snug">
                  Con {money(breakEven.fixedMonthly)} de gastos fijos al mes y un
                  margen bruto de {(breakEven.grossMarginRatio * 100).toFixed(1).replace(".", ",")}%,
                  el negocio necesita {money(breakEven.monthlySalesNeeded)} de venta
                  mensual para quedar en cero.
                </p>
              </div>
            ) : (
              <EmptyNote>
                Sin margen bruto positivo no hay punto de equilibrio: vender más
                aumentaría la pérdida. Revisa precios y costos primero.
              </EmptyNote>
            )}
          </SectionCard>

          {/* Cash flow */}
          <SectionCard
            title="Flujo de caja"
            subtitle="El dinero que entró y salió de verdad"
            icon={<Banknote className="size-5 text-primary" aria-hidden="true" />}
          >
            <PnlRow label="Cobros por ventas" value={`+ ${money(cashFlow.salesInflow)}`} />
            {cashFlow.otherInflow > 0 && (
              <PnlRow label="Otros ingresos" value={`+ ${money(cashFlow.otherInflow)}`} />
            )}
            <PnlRow label="Gastos operativos" value={`− ${money(cashFlow.operatingOutflow)}`} />
            {cashFlow.merchandiseOutflow > 0 && (
              <PnlRow
                label="Compra de mercancía"
                value={`− ${money(cashFlow.merchandiseOutflow)}`}
                hint="Se volvió inventario"
              />
            )}
            {cashFlow.investmentOutflow > 0 && (
              <PnlRow label="Inversiones" value={`− ${money(cashFlow.investmentOutflow)}`} />
            )}
            {cashFlow.ownerOutflow > 0 && (
              <PnlRow label="Retiros del dueño" value={`− ${money(cashFlow.ownerOutflow)}`} />
            )}
            <PnlRow
              label="Movimiento neto"
              value={money(cashFlow.netUsd)}
              negative={cashFlow.netUsd < 0}
              emphasis
            />
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground" data-money>
              {cashFlow.netUsd >= 0 ? (
                <ArrowUpRight className="size-4 text-primary" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="size-4 text-destructive" aria-hidden="true" />
              )}
              Saldo actual en todas las cuentas: {money(cashFlow.closingUsd)}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Trend */}
      <SectionCard
        title="Ingresos contra gastos"
        subtitle="Mes a mes, dentro del período elegido"
        icon={<PiggyBank className="size-5 text-primary" aria-hidden="true" />}
      >
        {trendData.length === 0 ? (
          <EmptyNote>Sin movimientos en el período</EmptyNote>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={trendData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="month" tick={TICK} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis
                  tick={TICK}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                  tickFormatter={(value: number) => `${symbol} ${Math.round(value)}`}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      format={(value) => `${symbol} ${formatMoneyValue(value)}`}
                    />
                  }
                />
                <Bar dataKey="ingresos" name="Ingresos" fill={CHART.income} radius={[3, 3, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill={CHART.expense} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* Alerts */}
      <SectionCard
        title="Qué atender"
        subtitle="Ordenado por gravedad"
        icon={<AlertTriangle className="size-5 text-primary" aria-hidden="true" />}
      >
        <AlertList alerts={report.alerts} />
      </SectionCard>

      <p className="text-sm text-muted-foreground text-center">
        Cifras en {symbol === "$" ? "dólares" : "bolívares"} ·{" "}
        {moneyCompact(pnl.salesRevenue)} vendidos en el período
      </p>
    </div>
  );
}
