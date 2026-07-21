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
  Landmark,
  PiggyBank,
  Scale,
  Target,
  Wallet,
} from "lucide-react";
import {
  AXIS_TICK,
  ChartTooltip,
  INK,
  MeterBar,
  SectionCard,
  StatTile,
  STATUS,
  SERIES,
  EmptyNote,
} from "../reports/report-ui";
import { AlertList, FinancePanelProps, PnlRow } from "./finance-ui";

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
      {/* Headline */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Utilidad neta"
          value={money(pnl.netProfit)}
          delta={delta(pnl.netProfit, previousPnl.netProfit)}
          tone={pnl.netProfit >= 0 ? "good" : "critical"}
          hint={`${pnl.netMarginPct.toFixed(1)}% de las ventas`}
          icon={<Scale className="w-4 h-4 text-gray-400" />}
        />
        <StatTile
          label="Efectivo disponible"
          value={money(runway.cashUsd)}
          hint={
            runway.months === null
              ? "sin gastos registrados"
              : `alcanza ${runway.months.toFixed(1)} mes(es)`
          }
          tone={
            runway.months !== null && runway.months < 2 ? "critical" : "default"
          }
          icon={<Wallet className="w-4 h-4 text-gray-400" />}
        />
        <StatTile
          label="Gastos del período"
          value={money(pnl.operatingExpenses)}
          delta={delta(pnl.operatingExpenses, previousPnl.operatingExpenses)}
          higherIsBetter={false}
          hint={`${money(pnl.fixedExpenses)} fijos`}
          icon={<ArrowDownRight className="w-4 h-4 text-gray-400" />}
        />
        <StatTile
          label="Por pagar"
          value={money(obligations.payablesUsd)}
          hint={
            obligations.overdueCount > 0
              ? `${obligations.overdueCount} vencida(s)`
              : `${money(obligations.next30Usd)} en 30 días`
          }
          tone={obligations.overdueCount > 0 ? "critical" : "default"}
          icon={<Landmark className="w-4 h-4 text-gray-400" />}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-5">
        {/* Profit statement */}
        <SectionCard
          title="Estado de resultados"
          subtitle="Lo que quedó después de todo, no lo que entró en caja"
          icon={<Scale className="w-4 h-4 text-primary" />}
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
            hint={`Margen ${pnl.grossMarginPct.toFixed(1)}%`}
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
            <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
              <p className="text-meta text-gray-500 mb-1">
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
            <p className="text-meta text-gray-500 mt-3 leading-snug">
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
            icon={<Target className="w-4 h-4 text-primary" />}
          >
            {breakEven.reachable ? (
              <div className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-meta text-gray-500">Ventas necesarias al día</p>
                    <p className="text-xl md:text-2xl font-semibold text-gray-900">
                      {money(breakEven.dailySalesNeeded)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-meta text-gray-500">Vas en</p>
                    <p
                      className={`text-xl md:text-2xl font-semibold ${
                        breakEven.coveragePct >= 100
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {money(breakEven.currentDailySales)}
                    </p>
                  </div>
                </div>
                <MeterBar
                  pct={Math.min(breakEven.coveragePct, 100)}
                  color={
                    breakEven.coveragePct >= 100 ? STATUS.good : STATUS.critical
                  }
                />
                <p className="text-meta text-gray-500 leading-snug">
                  Con {money(breakEven.fixedMonthly)} de gastos fijos al mes y un
                  margen bruto de {(breakEven.grossMarginRatio * 100).toFixed(1)}%,
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
            icon={<Banknote className="w-4 h-4 text-primary" />}
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
            <div className="flex items-center gap-2 mt-2 text-meta text-gray-500">
              {cashFlow.netUsd >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-green-600" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-red-600" />
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
        icon={<PiggyBank className="w-4 h-4 text-primary" />}
      >
        {trendData.length === 0 ? (
          <EmptyNote>Sin movimientos en el período</EmptyNote>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={trendData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={INK.grid} vertical={false} />
                <XAxis dataKey="month" tick={AXIS_TICK} axisLine={{ stroke: INK.axis }} />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                  tickFormatter={(value: number) => `${symbol} ${Math.round(value)}`}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      format={(value) => `${symbol} ${value.toFixed(2)}`}
                    />
                  }
                />
                <Bar dataKey="ingresos" name="Ingresos" fill={SERIES[1]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill={SERIES[5]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* Alerts */}
      <SectionCard
        title="Qué atender"
        subtitle="Ordenado por gravedad"
        icon={<AlertTriangle className="w-4 h-4 text-primary" />}
      >
        <AlertList alerts={report.alerts} />
      </SectionCard>

      <p className="text-meta text-gray-400 text-center">
        Cifras en {symbol === "$" ? "dólares" : "bolívares"} ·{" "}
        {moneyCompact(pnl.salesRevenue)} vendidos en el período
      </p>
    </div>
  );
}
