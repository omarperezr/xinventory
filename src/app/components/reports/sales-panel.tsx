// "Ventas" - the shape of the demand: when it happens, who closes it, and how
// customers pay. Answers staffing and opening-hours questions, not just
// bookkeeping ones.

import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Banknote,
  CalendarDays,
  Clock,
  Layers,
  Undo2,
  Users,
} from "lucide-react";
import {
  AXIS_TICK,
  ChartTooltip,
  Column,
  DataTable,
  EmptyNote,
  INK,
  Legend,
  MeterBar,
  PanelProps,
  SectionCard,
  Segmented,
  SERIES,
  StatTile,
  Swatch,
} from "./report-ui";
import type { PaymentStat, SellerStat } from "../../services/report-analytics";

export function SalesPanel({ report, money, moneyCompact, convert }: PanelProps) {
  const [breakdown, setBreakdown] = useState<"composicion" | "unidades">("composicion");
  const { metrics: m } = report;

  const composition = report.series.map((point) => ({
    label: point.label,
    Costo: Number(convert(point.cost).toFixed(2)),
    Ganancia: Number(convert(point.profit).toFixed(2)),
    Unidades: point.units,
    Ventas: point.transactions,
  }));

  const weekday = report.weekday.map((d) => ({
    label: d.label,
    valor: Number(convert(d.avgRevenue).toFixed(2)),
    ventas: d.transactions,
    ocurrencias: d.occurrences,
  }));
  const bestDay = [...report.weekday].sort((a, b) => b.avgRevenue - a.avgRevenue)[0];
  const worstDay = [...report.weekday]
    .filter((d) => d.occurrences > 0)
    .sort((a, b) => a.avgRevenue - b.avgRevenue)[0];

  // Trim the empty tails so the chart shows trading hours, not a 24-bar comb.
  const activeHours = report.hours.filter((h) => h.transactions > 0);
  const firstHour = activeHours.length ? Math.max(0, activeHours[0].hour - 1) : 8;
  const lastHour = activeHours.length
    ? Math.min(23, activeHours[activeHours.length - 1].hour + 1)
    : 20;
  const hours = report.hours
    .slice(firstHour, lastHour + 1)
    .map((h) => ({
      label: h.label,
      valor: Number(convert(h.revenue).toFixed(2)),
      ventas: h.transactions,
    }));
  const peakHour = [...report.hours].sort((a, b) => b.revenue - a.revenue)[0];

  const sellerColumns: Column<SellerStat>[] = [
    {
      key: "seller",
      header: "Vendedor",
      render: (s) => (
        <span className="font-medium text-gray-900 truncate block max-w-[140px]">
          {s.seller}
        </span>
      ),
      sortValue: (s) => s.seller,
    },
    {
      key: "revenue",
      header: "Ingresos",
      align: "right",
      render: (s) => money(s.revenue),
      sortValue: (s) => s.revenue,
    },
    {
      key: "share",
      header: "Peso",
      align: "right",
      secondary: true,
      render: (s) => `${s.share.toFixed(0)}%`,
      sortValue: (s) => s.share,
    },
    {
      key: "transactions",
      header: "Ventas",
      align: "right",
      render: (s) => s.transactions,
      sortValue: (s) => s.transactions,
    },
    {
      key: "avgTicket",
      header: "Ticket prom.",
      align: "right",
      render: (s) => money(s.avgTicket),
      sortValue: (s) => s.avgTicket,
    },
    {
      key: "unitsPerTicket",
      header: "U/venta",
      align: "right",
      secondary: true,
      render: (s) => s.unitsPerTicket.toFixed(1),
      sortValue: (s) => s.unitsPerTicket,
    },
    {
      key: "margin",
      header: "Margen",
      align: "right",
      render: (s) => (
        <span className={s.margin < 0 ? "text-red-700" : "text-gray-900"}>
          {s.margin.toFixed(0)}%
        </span>
      ),
      sortValue: (s) => s.margin,
    },
    {
      key: "discount",
      header: "Descuentos",
      align: "right",
      secondary: true,
      render: (s) => money(s.discountGiven),
      sortValue: (s) => s.discountGiven,
    },
  ];

  const paymentData = report.payments.map((p, i) => ({
    ...p,
    valor: Number(convert(p.total).toFixed(2)),
    fill: SERIES[i % SERIES.length],
  }));

  const paymentColumns: Column<PaymentStat & { fill: string }>[] = [
    {
      key: "method",
      header: "Método",
      render: (p) => (
        <span className="flex items-center gap-1.5 text-gray-900">
          <Swatch color={p.fill} />
          {p.method}
        </span>
      ),
      sortValue: (p) => p.method,
    },
    {
      key: "total",
      header: "Ingresos",
      align: "right",
      render: (p) => money(p.total),
      sortValue: (p) => p.total,
    },
    {
      key: "share",
      header: "Peso",
      align: "right",
      render: (p) => `${p.share.toFixed(0)}%`,
      sortValue: (p) => p.share,
    },
    {
      key: "avgTicket",
      header: "Ticket prom.",
      align: "right",
      secondary: true,
      render: (p) => money(p.avgTicket),
      sortValue: (p) => p.avgTicket,
    },
  ];

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
        <StatTile
          label="Mejor día de la semana"
          value={bestDay && bestDay.avgRevenue > 0 ? bestDay.label : "—"}
          hint={bestDay ? `${money(bestDay.avgRevenue)} en promedio` : undefined}
          icon={<CalendarDays className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Hora pico"
          value={peakHour && peakHour.revenue > 0 ? peakHour.label : "—"}
          hint={peakHour ? `${peakHour.transactions} venta(s)` : undefined}
          icon={<Clock className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Devoluciones"
          value={`${m.returnRate.toFixed(1)}%`}
          hint={`${m.returnedUnits} u · ${moneyCompact(m.returnedValue)}`}
          tone={m.returnRate > 10 ? "warning" : "default"}
          higherIsBetter={false}
          icon={<Undo2 className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Descuentos otorgados"
          value={moneyCompact(m.discountGiven)}
          hint={`${m.discountRate.toFixed(1)}% del precio de lista`}
          tone={m.discountRate > 10 ? "warning" : "default"}
          icon={<Banknote className="w-3.5 h-3.5 text-gray-300" />}
        />
      </div>

      <SectionCard
        title="Composición de las ventas"
        subtitle="Cuánto de cada período se fue en costo y cuánto quedó como ganancia"
        icon={<Layers className="w-4 h-4 text-primary" />}
        actions={
          <Segmented
            value={breakdown}
            onChange={setBreakdown}
            options={[
              { value: "composicion", label: "Dinero" },
              { value: "unidades", label: "Unidades" },
            ]}
          />
        }
      >
        {composition.length > 0 ? (
          <>
            {breakdown === "composicion" && (
              <Legend
                entries={[
                  { label: "Costo de la mercancía", color: SERIES[3] },
                  { label: "Ganancia", color: SERIES[1] },
                ]}
              />
            )}
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={composition}
                margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
                barCategoryGap="22%"
              >
                <CartesianGrid stroke={INK.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  axisLine={{ stroke: INK.axis }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={14}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)
                  }
                />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  content={
                    <ChartTooltip
                      format={(v: number, key: string) =>
                        key === "Unidades" ? `${v} u` : v.toFixed(2)
                      }
                    />
                  }
                />
                {breakdown === "composicion" ? (
                  <>
                    {/* A 2px surface-coloured gap separates the two segments. */}
                    <Bar
                      dataKey="Costo"
                      stackId="a"
                      fill={SERIES[3]}
                      stroke="#ffffff"
                      strokeWidth={2}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="Ganancia"
                      stackId="a"
                      fill={SERIES[1]}
                      stroke="#ffffff"
                      strokeWidth={2}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                  </>
                ) : (
                  <Bar
                    dataKey="Unidades"
                    fill={SERIES[0]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : (
          <EmptyNote>Sin ventas en este período.</EmptyNote>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <SectionCard
          title="Rendimiento por día de la semana"
          subtitle="Promedio por ocurrencia, no suma - así un lunes de más no infla el resultado"
          icon={<CalendarDays className="w-4 h-4 text-primary" />}
        >
          {report.metrics.transactions > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={weekday}
                  margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid stroke={INK.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={AXIS_TICK}
                    axisLine={{ stroke: INK.axis }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)
                    }
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.03)" }}
                    content={
                      <ChartTooltip format={(v: number) => v.toFixed(2)} />
                    }
                  />
                  <Bar
                    dataKey="valor"
                    name="Promedio"
                    fill={SERIES[0]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
              {bestDay && worstDay && bestDay.avgRevenue > 0 && (
                <p className="text-[11px] text-gray-500 mt-2">
                  <strong className="text-gray-700">{bestDay.label}</strong> rinde{" "}
                  {money(bestDay.avgRevenue)} en promedio y{" "}
                  <strong className="text-gray-700">{worstDay.label}</strong>{" "}
                  {money(worstDay.avgRevenue)}.
                  {report.metrics.transactions < 30 &&
                    " Con pocas ventas aún, tómalo como indicio, no como norma."}
                </p>
              )}
            </>
          ) : (
            <EmptyNote>Sin ventas en este período.</EmptyNote>
          )}
        </SectionCard>

        <SectionCard
          title="Ventas por hora del día"
          subtitle="Para decidir horarios de atención y refuerzo de personal"
          icon={<Clock className="w-4 h-4 text-primary" />}
        >
          {activeHours.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={hours}
                margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
                barCategoryGap="20%"
              >
                <CartesianGrid stroke={INK.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  axisLine={{ stroke: INK.axis }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={8}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)
                  }
                />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  content={<ChartTooltip format={(v: number) => v.toFixed(2)} />}
                />
                <Bar
                  dataKey="valor"
                  name="Ingresos"
                  fill={SERIES[0]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyNote>Sin ventas en este período.</EmptyNote>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Rendimiento por vendedor"
        subtitle="Toca una columna para reordenar"
        icon={<Users className="w-4 h-4 text-primary" />}
      >
        <DataTable
          columns={sellerColumns}
          rows={report.sellers}
          rowKey={(s) => s.seller}
          initialSort="revenue"
        />
      </SectionCard>

      <SectionCard
        title="Métodos de pago"
        subtitle="El total de cada venta se reparte entre sus métodos, así el vuelto entregado no infla el efectivo"
        icon={<Banknote className="w-4 h-4 text-primary" />}
      >
        {paymentData.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={paymentData}
                  dataKey="valor"
                  nameKey="method"
                  cx="50%"
                  cy="50%"
                  outerRadius={78}
                  innerRadius={46}
                  paddingAngle={2}
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  {paymentData.map((entry) => (
                    <Cell key={entry.method} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  content={<ChartTooltip nameKey="method" format={(v: number) => v.toFixed(2)} />}
                />
              </PieChart>
            </ResponsiveContainer>
            <div>
              <DataTable
                columns={paymentColumns}
                rows={paymentData}
                rowKey={(p) => p.method}
                initialSort="total"
                maxHeight="14rem"
              />
              {report.paymentCoverage.unrecordedTransactions > 0 && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2">
                  {report.paymentCoverage.unrecordedTransactions} venta(s) por{" "}
                  {money(report.paymentCoverage.unrecorded)} se cerraron sin
                  registrar el pago, así que no aparecen en esta mezcla.
                </p>
              )}
            </div>
          </div>
        ) : (
          <EmptyNote>Sin pagos registrados en este período.</EmptyNote>
        )}
      </SectionCard>

      <SectionCard
        title="Concentración de clientes por ticket"
        subtitle="Qué parte de los ingresos viene de las ventas grandes"
        icon={<Layers className="w-4 h-4 text-primary" />}
      >
        <TicketConcentration report={report} money={money} />
      </SectionCard>
    </div>
  );
}

/**
 * Splits the period's sales into quartiles by ticket size. A shop whose top
 * quarter of tickets carries most of the revenue is a different business from
 * one with an even spread, and it changes what a discount is worth.
 */
function TicketConcentration({
  report,
  money,
}: {
  report: PanelProps["report"];
  money: (usd: number) => string;
}) {
  const totals = report.rangeTransactions
    .map((t) => t.total)
    .sort((a, b) => b - a);
  if (totals.length < 4) {
    return <EmptyNote>Se necesitan al menos 4 ventas en el período.</EmptyNote>;
  }
  const revenue = totals.reduce((s, v) => s + v, 0);
  const quartileSize = Math.ceil(totals.length / 4);
  const labels = ["25% más grandes", "Siguiente 25%", "Siguiente 25%", "25% más pequeñas"];
  const rows = labels.map((label, i) => {
    const slice = totals.slice(i * quartileSize, (i + 1) * quartileSize);
    const sum = slice.reduce((s, v) => s + v, 0);
    return {
      label,
      count: slice.length,
      sum,
      share: revenue > 0 ? (sum / revenue) * 100 : 0,
    };
  });

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-700">
              {r.label}
              <span className="text-gray-400 ml-1.5">{r.count} venta(s)</span>
            </span>
            <span className="font-medium text-gray-900 tabular-nums">
              {money(r.sum)}
              <span className="text-gray-400 font-normal ml-1.5">
                {r.share.toFixed(0)}%
              </span>
            </span>
          </div>
          <MeterBar pct={r.share} color={SERIES[i % SERIES.length]} />
        </div>
      ))}
    </div>
  );
}
