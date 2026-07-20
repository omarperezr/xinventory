// "Proyección" - the future tense. A deliberately simple straight-line fit over
// the observed daily sales, plus the purchase order that fit implies. The
// method is stated on screen: for a shop with a few weeks of history, anything
// fancier would dress up noise as insight.

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarClock,
  Info,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  AXIS_TICK,
  ChartTooltip,
  Column,
  DataTable,
  EmptyNote,
  formatDays,
  INK,
  Legend,
  PanelProps,
  SectionCard,
  Segmented,
  SERIES,
  StatTile,
} from "./report-ui";
import { reorderPlan, type ReorderRow } from "../../services/report-analytics";

export function ForecastPanel({ report, money, moneyCompact, convert }: PanelProps) {
  const [coverDays, setCoverDays] = useState<"15" | "30" | "60">("30");
  const f = report.forecast;

  // Daily buckets whatever the selected range, so "próximos 30 días" means the
  // same thing everywhere. Only the tail is worth showing: 90 days of history
  // would squash the projection into the right-hand margin.
  const observed = report.dailySeries.slice(-30);
  const chart: {
    label: string;
    observado: number | null;
    proyectado: number | null;
  }[] = observed.map((p, i) => ({
    label: p.label,
    observado: Number(convert(p.revenue).toFixed(2)),
    // Repeat the last observed value so the two lines meet instead of leaving
    // a visual gap at the hand-off.
    proyectado:
      i === observed.length - 1 ? Number(convert(p.revenue).toFixed(2)) : null,
  }));

  const startDate = new Date();
  f.points.forEach((point, i) => {
    const date = new Date(startDate.getTime() + (i + 1) * 86_400_000);
    chart.push({
      label: format(date, "dd/MM"),
      observado: null,
      proyectado: Number(convert(point.revenue).toFixed(2)),
    });
  });

  const plan = useMemo(
    () => reorderPlan(report.inventory.rows, Number(coverDays)),
    [report.inventory.rows, coverDays],
  );

  const upcoming = report.inventory.rows
    .filter((r) => r.velocity > 0 && Number.isFinite(r.daysOfStock) && r.daysOfStock <= 60)
    .sort((a, b) => a.daysOfStock - b.daysOfStock)
    .slice(0, 12);

  const planColumns: Column<ReorderRow>[] = [
    {
      key: "name",
      header: "Producto",
      render: (r) => (
        <span className="font-medium text-gray-900 truncate block max-w-[150px] md:max-w-[220px]">
          {r.name}
        </span>
      ),
      sortValue: (r) => r.name,
    },
    {
      key: "quantity",
      header: "Stock",
      align: "right",
      render: (r) => r.quantity,
      sortValue: (r) => r.quantity,
    },
    {
      key: "coverage",
      header: "Cobertura",
      align: "right",
      secondary: true,
      render: (r) => formatDays(r.daysOfStock),
      sortValue: (r) => r.daysOfStock,
    },
    {
      key: "suggested",
      header: "Comprar",
      align: "right",
      render: (r) => (
        <span className="font-semibold text-gray-900">{r.suggestedQty}</span>
      ),
      sortValue: (r) => r.suggestedQty,
    },
    {
      key: "cost",
      header: "Inversión",
      align: "right",
      render: (r) => money(r.purchaseCost),
      sortValue: (r) => r.purchaseCost,
    },
    {
      key: "profit",
      header: "Ganancia esperada",
      align: "right",
      secondary: true,
      render: (r) => (
        <span className="text-green-700">{money(r.expectedProfit)}</span>
      ),
      sortValue: (r) => r.expectedProfit,
    },
  ];

  const trendUp = f.slopePerDay > 0;
  const confidence =
    f.method === "average"
      ? "baja"
      : f.fit >= 0.6
        ? "alta"
        : f.fit >= 0.4
          ? "media"
          : "moderada";

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
        <StatTile
          label="Proyección 7 días"
          value={moneyCompact(f.next7)}
          hint={`${money(f.next7 / 7)}/día`}
          icon={<Sparkles className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Proyección 30 días"
          value={moneyCompact(f.next30)}
          hint={`vs ${moneyCompact(report.metrics.revenue)} del período`}
          icon={<CalendarClock className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Ganancia esperada 30 días"
          value={moneyCompact(f.expectedProfit30)}
          hint={`al margen actual de ${report.metrics.margin.toFixed(0)}%`}
          tone="good"
          icon={<TrendingUp className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Tendencia diaria"
          value={
            f.method === "average"
              ? "Estable"
              : `${trendUp ? "+" : "−"}${moneyCompact(Math.abs(f.slopePerDay))}`
          }
          hint={`confianza ${confidence}`}
          tone={f.method === "average" ? "default" : trendUp ? "good" : "warning"}
          icon={
            trendUp ? (
              <TrendingUp className="w-3.5 h-3.5 text-gray-300" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-gray-300" />
            )
          }
        />
      </div>

      <SectionCard
        title="Hacia dónde va la facturación"
        subtitle={`Últimos ${observed.length} días observados y ${f.points.length} días proyectados`}
        icon={<Sparkles className="w-4 h-4 text-primary" />}
      >
        {observed.length >= 2 ? (
          <>
            <Legend
              entries={[
                { label: "Observado", color: SERIES[0] },
                { label: "Proyección", color: SERIES[3] },
              ]}
            />
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={INK.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  axisLine={{ stroke: INK.axis }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={18}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)
                  }
                />
                <Tooltip
                  cursor={{ stroke: INK.axis, strokeWidth: 1 }}
                  content={
                    <ChartTooltip
                      format={(v: number) => (v == null ? "—" : v.toFixed(2))}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="observado"
                  name="Observado"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                />
                <Line
                  type="monotone"
                  dataKey="proyectado"
                  name="Proyección"
                  stroke={SERIES[3]}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-gray-500 mt-2 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px text-gray-500" />
              <span>
                {f.method === "trend"
                  ? `Ajuste de tendencia sobre ${f.sampleSize} días de ventas (calidad del ajuste ${(f.fit * 100).toFixed(0)}%).`
                  : `Sin una tendencia clara en ${f.sampleSize} días de datos, se proyecta el promedio diario de ${money(f.baselinePerDay)}.`}{" "}
                Es una estimación simple: no considera temporadas, feriados ni
                campañas.
              </span>
            </p>
          </>
        ) : (
          <EmptyNote>
            Se necesitan al menos dos días con ventas para proyectar.
          </EmptyNote>
        )}
      </SectionCard>

      <SectionCard
        title="Plan de compra sugerido"
        subtitle="Cantidad necesaria para no quedarte sin stock en el horizonte elegido"
        icon={<ShoppingCart className="w-4 h-4 text-primary" />}
        actions={
          <Segmented
            value={coverDays}
            onChange={setCoverDays}
            options={[
              { value: "15", label: "15 días" },
              { value: "30", label: "30 días" },
              { value: "60", label: "60 días" },
            ]}
          />
        }
      >
        {plan.rows.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-4">
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-meta text-gray-500">Inversión requerida</p>
                <p className="text-base md:text-lg font-semibold text-gray-900">
                  {money(plan.totalCost)}
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-meta text-gray-500">Ganancia esperada</p>
                <p className="text-base md:text-lg font-semibold text-green-700">
                  {money(plan.expectedProfit)}
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-meta text-gray-500">Productos a reponer</p>
                <p className="text-base md:text-lg font-semibold text-gray-900">
                  {plan.rows.length}
                </p>
              </div>
            </div>
            <DataTable
              columns={planColumns}
              rows={plan.rows}
              rowKey={(r) => r.id}
              initialSort="cost"
              maxHeight="26rem"
              pageSize={12}
            />
          </>
        ) : (
          <EmptyNote>
            Con el ritmo actual, el stock alcanza para los próximos {coverDays}{" "}
            días. No hace falta reponer nada.
          </EmptyNote>
        )}
      </SectionCard>

      <SectionCard
        title="Calendario de agotamiento"
        subtitle="Fecha estimada en que cada producto llega a cero"
        icon={<CalendarClock className="w-4 h-4 text-primary" />}
      >
        {upcoming.length > 0 ? (
          <ul className="space-y-2">
            {upcoming.map((r) => {
              const date = new Date(Date.now() + r.daysOfStock * 86_400_000);
              const urgent = r.daysOfStock <= 7;
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs md:text-sm font-medium text-gray-900 truncate">
                      {r.name}
                    </p>
                    <p className="text-meta text-gray-500">
                      {r.quantity} en stock · {r.velocity.toFixed(2)} u/día
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p
                      className={`text-xs font-semibold tabular-nums ${
                        urgent ? "text-red-700" : "text-gray-900"
                      }`}
                    >
                      {format(date, "dd/MM/yy")}
                    </p>
                    <p className="text-meta text-gray-500">
                      {formatDays(r.daysOfStock)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyNote>
            Ningún producto con stock se agota dentro de los próximos 60 días al
            ritmo actual.
          </EmptyNote>
        )}
      </SectionCard>
    </div>
  );
}
