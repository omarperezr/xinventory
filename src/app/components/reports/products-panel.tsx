// "Productos" - which items carry the business, which ones only look busy, and
// what is actually being charged for them versus the list price.

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Award,
  Layers,
  Percent,
  Tag,
  TrendingDown,
  Boxes,
} from "lucide-react";
import {
  AXIS_TICK,
  ChartTooltip,
  Column,
  DataTable,
  EmptyNote,
  INK,
  MeterBar,
  PanelProps,
  SectionCard,
  SERIES,
  StatTile,
  STATUS,
} from "./report-ui";
import type { GroupStat, ProductStat } from "../../services/report-analytics";

const ABC_STYLE: Record<string, string> = {
  A: "bg-green-50 text-green-700 border-green-200",
  B: "bg-blue-50 text-blue-700 border-blue-200",
  C: "bg-gray-50 text-gray-500 border-gray-200",
};

function AbcBadge({ abc }: { abc: string }) {
  return (
    <span
      className={`inline-block text-meta font-semibold border rounded px-1 ${ABC_STYLE[abc]}`}
      title={
        abc === "A"
          ? "Clase A: aporta el primer 80% de la ganancia"
          : abc === "B"
            ? "Clase B: aporta hasta el 95% de la ganancia"
            : "Clase C: el 5% final de la ganancia"
      }
    >
      {abc}
    </span>
  );
}

export function ProductsPanel({ report, money, moneyCompact }: PanelProps) {
  const products = report.products;
  const classA = products.filter((p) => p.abc === "A");
  const classB = products.filter((p) => p.abc === "B");
  const classC = products.filter((p) => p.abc === "C");

  const star = products[0];
  // Weighted by revenue: a discount on the item that moves the money matters
  // more than one on something that sold twice.
  const realizationBase = products.reduce((s, p) => s + p.revenue, 0);
  const weightedRealization =
    realizationBase > 0
      ? products.reduce((s, p) => s + p.priceRealization * p.revenue, 0) /
        realizationBase
      : null;

  // Pareto curve: one series, one axis, percentages. The classic bar+line
  // version needs two y-scales, which invents relationships that aren't there.
  const pareto = products.map((p, i) => ({
    label: `${i + 1}`,
    name: p.name,
    acumulado: Number(p.cumulativeProfitShare.toFixed(1)),
  }));

  const belowCost = products.filter((p) => p.profit < 0);
  const heavyDiscount = products
    .filter((p) => p.discountGiven > 0 && p.priceRealization < 97)
    .sort((a, b) => b.discountGiven - a.discountGiven);
  const withReturns = products
    .filter((p) => p.returnedUnits > 0)
    .sort((a, b) => b.returnRate - a.returnRate);

  const productColumns: Column<ProductStat>[] = [
    {
      key: "name",
      header: "Producto",
      render: (p) => (
        <span className="flex items-center gap-1.5 min-w-0">
          <AbcBadge abc={p.abc} />
          <span className="font-medium text-gray-900 truncate max-w-[150px] md:max-w-[220px]">
            {p.name}
          </span>
          {!p.inCatalog && (
            <span className="text-meta text-gray-500 flex-shrink-0">(eliminado)</span>
          )}
        </span>
      ),
      sortValue: (p) => p.name,
    },
    {
      key: "units",
      header: "Unid.",
      align: "right",
      render: (p) => p.units,
      sortValue: (p) => p.units,
    },
    {
      key: "revenue",
      header: "Ingresos",
      align: "right",
      render: (p) => money(p.revenue),
      sortValue: (p) => p.revenue,
    },
    {
      key: "profit",
      header: "Ganancia",
      align: "right",
      render: (p) => (
        <span className={p.profit < 0 ? "text-red-700 font-medium" : "text-gray-900"}>
          {money(p.profit)}
        </span>
      ),
      sortValue: (p) => p.profit,
    },
    {
      key: "margin",
      header: "Margen",
      align: "right",
      render: (p) => (
        <span className={p.margin < 0 ? "text-red-700 font-medium" : "text-gray-900"}>
          {p.margin.toFixed(0)}%
        </span>
      ),
      sortValue: (p) => p.margin,
    },
    {
      key: "avgPrice",
      header: "Precio prom.",
      align: "right",
      secondary: true,
      render: (p) => money(p.avgPrice),
      sortValue: (p) => p.avgPrice,
    },
    {
      key: "realization",
      header: "% de lista",
      align: "right",
      secondary: true,
      render: (p) => (
        <span
          className={
            p.priceRealization < 90
              ? "text-amber-700"
              : p.priceRealization > 105
                ? "text-green-700"
                : "text-gray-900"
          }
          title={`Precio de lista ${money(p.listPrice)}`}
        >
          {p.priceRealization.toFixed(0)}%
        </span>
      ),
      sortValue: (p) => p.priceRealization,
    },
    {
      key: "returns",
      header: "Devol.",
      align: "right",
      secondary: true,
      render: (p) =>
        p.returnedUnits > 0 ? (
          <span className="text-amber-700">
            {p.returnedUnits} ({p.returnRate.toFixed(0)}%)
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
      sortValue: (p) => p.returnRate,
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      render: (p) => (
        <span className={p.inStock === 0 ? "text-red-700 font-medium" : "text-gray-900"}>
          {p.inStock}
        </span>
      ),
      sortValue: (p) => p.inStock,
    },
  ];

  const groupColumns = (label: string): Column<GroupStat>[] => [
    {
      key: "key",
      header: label,
      render: (g) => (
        <div className="min-w-[120px]">
          <span className="font-medium text-gray-900 truncate block max-w-[160px]">
            {g.key}
          </span>
          <div className="mt-1">
            <MeterBar pct={g.share} color={SERIES[0]} />
          </div>
        </div>
      ),
      sortValue: (g) => g.key,
    },
    {
      key: "revenue",
      header: "Ingresos",
      align: "right",
      render: (g) => money(g.revenue),
      sortValue: (g) => g.revenue,
    },
    {
      key: "share",
      header: "Peso",
      align: "right",
      render: (g) => `${g.share.toFixed(0)}%`,
      sortValue: (g) => g.share,
    },
    {
      key: "profit",
      header: "Ganancia",
      align: "right",
      secondary: true,
      render: (g) => money(g.profit),
      sortValue: (g) => g.profit,
    },
    {
      key: "margin",
      header: "Margen",
      align: "right",
      render: (g) => `${g.margin.toFixed(0)}%`,
      sortValue: (g) => g.margin,
    },
    {
      key: "units",
      header: "Unid.",
      align: "right",
      secondary: true,
      render: (g) => g.units,
      sortValue: (g) => g.units,
    },
  ];

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
        <StatTile
          label="Producto estrella"
          value={
            <span className="text-sm md:text-base block truncate">
              {star?.name ?? "—"}
            </span>
          }
          hint={star ? `${money(star.profit)} de ganancia` : undefined}
          icon={<Award className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Productos vendidos"
          value={products.length.toLocaleString()}
          hint={`${classA.length} generan el 80% de la ganancia`}
          icon={<Boxes className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Precio realizado"
          value={weightedRealization === null ? "—" : `${weightedRealization.toFixed(0)}%`}
          hint="del precio de lista, ponderado"
          tone={weightedRealization !== null && weightedRealization < 90 ? "warning" : "default"}
          icon={<Tag className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Vendidos bajo costo"
          value={belowCost.length.toLocaleString()}
          hint={
            belowCost.length
              ? `${moneyCompact(Math.abs(belowCost.reduce((s, p) => s + p.profit, 0)))} de pérdida`
              : "ninguno"
          }
          tone={belowCost.length ? "critical" : "good"}
          icon={<TrendingDown className="w-3.5 h-3.5 text-gray-300" />}
        />
      </div>

      <SectionCard
        title="Concentración de la ganancia (Pareto)"
        subtitle="Productos ordenados de mayor a menor aporte. La línea muestra el acumulado."
        icon={<Percent className="w-4 h-4 text-primary" />}
      >
        {pareto.length >= 3 ? (
          <>
            {/* Bottom margin leaves room for the axis caption below the ticks. */}
            <ResponsiveContainer width="100%" height={224}>
              <LineChart data={pareto} margin={{ top: 8, right: 24, left: 0, bottom: 16 }}>
                <CartesianGrid stroke={INK.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  axisLine={{ stroke: INK.axis }}
                  tickLine={false}
                  minTickGap={12}
                  label={{
                    value: "Productos ordenados por ganancia",
                    position: "insideBottom",
                    offset: -2,
                    style: { fontSize: 10, fill: INK.muted },
                  }}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      nameKey="name"
                      format={(v: number) => `${v}%`}
                    />
                  }
                />
                <ReferenceLine
                  y={80}
                  stroke={STATUS.warning}
                  strokeWidth={1}
                  label={{
                    value: "80%",
                    position: "right",
                    style: { fontSize: 10, fill: INK.secondary },
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="acumulado"
                  name="Ganancia acumulada"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { cls: "A", list: classA, note: "primer 80% de la ganancia" },
                { cls: "B", list: classB, note: "hasta el 95%" },
                { cls: "C", list: classC, note: "el 5% final" },
              ].map(({ cls, list, note }) => (
                <div key={cls} className="border border-gray-200 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AbcBadge abc={cls} />
                    <span className="text-xs font-medium text-gray-900">
                      {list.length} producto(s)
                    </span>
                  </div>
                  <p className="text-meta text-gray-500">{note}</p>
                  <p className="text-[11px] text-gray-700 mt-1 tabular-nums">
                    {money(list.reduce((s, p) => s + p.profit, 0))}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-3">
              Los productos de clase A son los que nunca deberían faltar en
              estante. Los de clase C ocupan capital y espacio a cambio de poco:
              conviene revisar si vale la pena reponerlos.
            </p>
          </>
        ) : (
          <EmptyNote>Se necesitan al menos 3 productos vendidos.</EmptyNote>
        )}
      </SectionCard>

      <SectionCard
        title="Detalle por producto"
        subtitle="Toca una columna para reordenar. «% de lista» compara el precio cobrado con el de catálogo."
        icon={<Boxes className="w-4 h-4 text-primary" />}
      >
        <DataTable
          columns={productColumns}
          rows={products}
          rowKey={(p) => p.itemId}
          initialSort="revenue"
          maxHeight="30rem"
          pageSize={12}
        />
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <SectionCard
          title="Por categoría"
          subtitle="Dónde se concentra el negocio"
          icon={<Layers className="w-4 h-4 text-primary" />}
        >
          <DataTable
            columns={groupColumns("Categoría")}
            rows={report.categories}
            rowKey={(g) => g.key}
            initialSort="revenue"
            maxHeight="20rem"
          />
        </SectionCard>

        <SectionCard
          title="Por marca"
          subtitle="Qué proveedor sostiene las ventas"
          icon={<Tag className="w-4 h-4 text-primary" />}
        >
          <DataTable
            columns={groupColumns("Marca")}
            rows={report.brands}
            rowKey={(g) => g.key}
            initialSort="revenue"
            maxHeight="20rem"
          />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <SectionCard
          title="Dónde se va el descuento"
          subtitle="Diferencia entre el precio de lista y lo que realmente se cobró"
          icon={<Tag className="w-4 h-4 text-amber-500" />}
        >
          {heavyDiscount.length > 0 ? (
            <DataTable
              columns={[
                {
                  key: "name",
                  header: "Producto",
                  render: (p: ProductStat) => (
                    <span className="font-medium text-gray-900 truncate block max-w-[160px]">
                      {p.name}
                    </span>
                  ),
                  sortValue: (p: ProductStat) => p.name,
                },
                {
                  key: "list",
                  header: "Lista",
                  align: "right",
                  render: (p: ProductStat) => money(p.listPrice),
                  sortValue: (p: ProductStat) => p.listPrice,
                },
                {
                  key: "avg",
                  header: "Cobrado",
                  align: "right",
                  render: (p: ProductStat) => money(p.avgPrice),
                  sortValue: (p: ProductStat) => p.avgPrice,
                },
                {
                  key: "given",
                  header: "Cedido",
                  align: "right",
                  render: (p: ProductStat) => (
                    <span className="text-amber-700">{money(p.discountGiven)}</span>
                  ),
                  sortValue: (p: ProductStat) => p.discountGiven,
                },
              ]}
              rows={heavyDiscount}
              rowKey={(p) => p.itemId}
              initialSort="given"
              maxHeight="18rem"
            />
          ) : (
            <EmptyNote>
              Todo se vendió al precio de lista o por encima de él.
            </EmptyNote>
          )}
        </SectionCard>

        <SectionCard
          title="Devoluciones por producto"
          subtitle="Una tasa alta suele indicar un problema de calidad o de expectativa"
          icon={<TrendingDown className="w-4 h-4 text-amber-500" />}
        >
          {withReturns.length > 0 ? (
            <DataTable
              columns={[
                {
                  key: "name",
                  header: "Producto",
                  render: (p: ProductStat) => (
                    <span className="font-medium text-gray-900 truncate block max-w-[160px]">
                      {p.name}
                    </span>
                  ),
                  sortValue: (p: ProductStat) => p.name,
                },
                {
                  key: "units",
                  header: "Devueltas",
                  align: "right",
                  render: (p: ProductStat) => p.returnedUnits,
                  sortValue: (p: ProductStat) => p.returnedUnits,
                },
                {
                  key: "rate",
                  header: "Tasa",
                  align: "right",
                  render: (p: ProductStat) => (
                    <span className={p.returnRate >= 15 ? "text-red-700" : "text-gray-900"}>
                      {p.returnRate.toFixed(0)}%
                    </span>
                  ),
                  sortValue: (p: ProductStat) => p.returnRate,
                },
                {
                  key: "value",
                  header: "Valor",
                  align: "right",
                  render: (p: ProductStat) => money(p.returnedUnits * p.avgPrice),
                  sortValue: (p: ProductStat) => p.returnedUnits * p.avgPrice,
                },
              ]}
              rows={withReturns}
              rowKey={(p) => p.itemId}
              initialSort="rate"
              maxHeight="18rem"
            />
          ) : (
            <EmptyNote>Sin devoluciones en este período.</EmptyNote>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
