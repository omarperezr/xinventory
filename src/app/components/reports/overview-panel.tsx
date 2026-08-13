// "Resumen" - the answer to "how is the business doing right now, and what
// should I do about it?" Everything else in the dashboard is a drill-down of
// something on this screen.

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Layers,
  Lightbulb,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  AXIS_TICK,
  ChartTooltip,
  EmptyNote,
  INK,
  Kpi,
  KpiRow,
  Legend,
  PanelProps,
  RankRow,
  SectionCard,
  SERIES,
  STATUS,
} from "./report-ui";
import { delta, type Alert, type AlertLevel } from "../../services/report-analytics";
import { formatMoneyValue } from "../../context/app-context";

// ok = primary-soft, warn = pending-soft, critical = destructive-soft; info
// (no stock/money verdict either way) falls back to the neutral secondary tone.
const ALERT_STYLE: Record<
  AlertLevel,
  {
    border: string;
    bg: string;
    icon: typeof AlertTriangle;
    color: string;
    chip: string;
    label: string;
  }
> = {
  critical: {
    border: "border-l-destructive",
    bg: "bg-destructive-soft/60",
    icon: XCircle,
    color: STATUS.critical,
    chip: "bg-destructive-soft text-destructive-soft-foreground",
    label: "Crítico",
  },
  warning: {
    border: "border-l-pending-strong",
    bg: "bg-pending-soft/60",
    icon: AlertTriangle,
    color: STATUS.warning,
    chip: "bg-pending-soft text-pending",
    label: "Atención",
  },
  info: {
    border: "border-l-border-strong",
    bg: "bg-secondary/50",
    icon: Info,
    color: INK.muted,
    chip: "bg-secondary text-secondary-foreground",
    label: "Información",
  },
  good: {
    border: "border-l-primary",
    bg: "bg-primary-soft/50",
    icon: CheckCircle2,
    color: STATUS.good,
    chip: "bg-primary-soft text-primary-soft-foreground",
    label: "Buena señal",
  },
};

function AlertCard({ alert }: { alert: Alert }) {
  const style = ALERT_STYLE[alert.level];
  const Icon = style.icon;
  return (
    <li
      className={`border border-border border-l-4 ${style.border} ${style.bg} rounded-lg p-3`}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className="w-4 h-4 mt-0.5 flex-shrink-0"
          style={{ color: style.color }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{alert.title}</p>
            <span
              className={`text-meta font-semibold rounded-full px-2 py-0.5 ${style.chip}`}
            >
              {style.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{alert.detail}</p>
          {alert.items && alert.items.length > 0 && (
            <ul className="flex flex-wrap gap-1 mt-1.5">
              {alert.items.map((name) => (
                <li
                  key={name}
                  className="text-meta bg-white border border-border rounded px-1.5 py-0.5 text-muted-foreground max-w-[180px] truncate"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export function OverviewPanel({
  report,
  money,
  moneyCompact,
  convert,
}: PanelProps) {
  const { metrics: m, previousMetrics: p, series, previousSeries, alerts } = report;

  // Aligned by position, not by date: the point is "day 3 of this period
  // against day 3 of the last one", which is how a shop compares weeks.
  const trend = series.map((point, i) => ({
    label: point.label,
    actual: Number(convert(point.revenue).toFixed(2)),
    anterior:
      previousSeries[i] !== undefined
        ? Number(convert(previousSeries[i].revenue).toFixed(2))
        : null,
  }));

  const topProfit = report.products
    .filter((x) => x.profit !== 0)
    .slice()
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);
  const maxProfit = topProfit[0]?.profit ?? 0;

  const categories = report.categories.slice(0, 5);
  const maxCategory = categories[0]?.revenue ?? 0;

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Headline KPIs, each against the equivalent previous window */}
      <KpiRow>
        <Kpi
          label="Ingresos"
          value={moneyCompact(m.revenue)}
          delta={delta(m.revenue, p.revenue)}
          hint={`${money(m.revenuePerDay)}/día`}
        />
        <Kpi
          label="Ganancia neta"
          value={moneyCompact(m.profit)}
          delta={delta(m.profit, p.profit)}
          tone={m.profit >= 0 ? "good" : "critical"}
          hint={`costo ${moneyCompact(m.cost)}`}
        />
        <Kpi
          label="Margen"
          value={`${m.margin.toFixed(1)}%`}
          delta={delta(m.margin, p.margin)}
          hint={
            report.previousCovered
              ? `antes ${p.margin.toFixed(1)}%`
              : "sin período anterior cargado"
          }
        />
        <Kpi
          label="Transacciones"
          value={m.transactions.toLocaleString()}
          delta={delta(m.transactions, p.transactions)}
          hint={`${m.activeDays} día(s) con ventas`}
        />
        <Kpi
          label="Ticket promedio"
          value={moneyCompact(m.avgTicket)}
          delta={delta(m.avgTicket, p.avgTicket)}
          hint={`${m.unitsPerTicket.toFixed(1)} u/venta`}
        />
        <Kpi
          label="Unidades vendidas"
          value={m.units.toLocaleString()}
          delta={delta(m.units, p.units)}
          hint={
            m.returnedUnits > 0 ? `${m.returnedUnits} devueltas` : "sin devoluciones"
          }
        />
      </KpiRow>

      {/* Trend against the previous period */}
      <SectionCard
        title="Ingresos del período"
        subtitle={
          report.previousCovered
            ? `Comparado punto a punto con los ${report.previous.days} días anteriores`
            : "Sin comparación: el período anterior no está cargado completo"
        }
        icon={<TrendingUp className="w-4 h-4 text-primary" aria-hidden="true" />}
      >
        {trend.length >= 2 ? (
          <>
            <Legend
              entries={[
                { label: "Período actual", color: SERIES[0] },
                ...(report.previousCovered
                  ? [{ label: "Período anterior", color: INK.axis }]
                  : []),
              ]}
            />
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={trend} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={INK.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  axisLine={{ stroke: INK.axis }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0))}
                />
                <Tooltip
                  cursor={{ stroke: INK.axis, strokeWidth: 1 }}
                  content={<ChartTooltip format={(v: number) => (v == null ? "—" : formatMoneyValue(v))} />}
                />
                <Line
                  type="monotone"
                  dataKey="anterior"
                  name="Período anterior"
                  stroke={INK.axis}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  name="Período actual"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#revGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </>
        ) : (
          <EmptyNote>No hay suficientes puntos para dibujar la tendencia.</EmptyNote>
        )}
      </SectionCard>

      {/* The "what do I do about it" list */}
      <SectionCard
        title="Qué necesita tu atención"
        subtitle="Ordenado por el dinero que hay en juego"
        icon={<Lightbulb className="w-4 h-4 text-pending" aria-hidden="true" />}
      >
        {alerts.length > 0 ? (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </ul>
        ) : (
          <EmptyNote>
            Sin alertas en este período. Stock, márgenes y devoluciones lucen bien.
          </EmptyNote>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <SectionCard
          title="Productos que más ganancia dejan"
          subtitle="Ingresos menos costo, neto de devoluciones"
          icon={<Wallet className="w-4 h-4 text-primary" aria-hidden="true" />}
        >
          {topProfit.length > 0 ? (
            <div className="space-y-3">
              {topProfit.map((item, i) => (
                <RankRow
                  key={item.itemId}
                  index={i + 1}
                  name={item.name}
                  value={money(item.profit)}
                  sub={`${item.units} u · ${item.margin.toFixed(0)}%`}
                  pct={maxProfit > 0 ? (item.profit / maxProfit) * 100 : 0}
                  color={item.profit >= 0 ? STATUS.good : STATUS.critical}
                  valueTone={item.profit >= 0 ? "good" : "bad"}
                />
              ))}
            </div>
          ) : (
            <EmptyNote>Sin ventas en este período.</EmptyNote>
          )}
        </SectionCard>

        <SectionCard
          title="Categorías con más peso"
          subtitle="Participación en los ingresos del período"
          icon={<Layers className="w-4 h-4 text-primary" aria-hidden="true" />}
        >
          {categories.length > 0 ? (
            <div className="space-y-3">
              {categories.map((c, i) => (
                <RankRow
                  key={c.key}
                  index={i + 1}
                  name={c.key}
                  value={money(c.revenue)}
                  sub={`${c.share.toFixed(0)}% · margen ${c.margin.toFixed(0)}%`}
                  pct={maxCategory > 0 ? (c.revenue / maxCategory) * 100 : 0}
                  color={SERIES[i % SERIES.length]}
                />
              ))}
            </div>
          ) : (
            <EmptyNote>Sin ventas en este período.</EmptyNote>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
