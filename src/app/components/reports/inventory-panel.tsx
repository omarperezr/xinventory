// "Inventario" - the present tense of the business. Crosses what is on the
// shelf with how fast it leaves, which is what turns a stock list into a
// decision: reorder, discount, or stop buying it.

import { format } from "date-fns";
import {
  AlertTriangle,
  Ban,
  Boxes,
  Clock3,
  Layers,
  PackageX,
  Repeat,
  Snowflake,
  Warehouse,
} from "lucide-react";
import {
  Column,
  DataTable,
  EmptyNote,
  formatDays,
  MeterBar,
  PanelProps,
  SectionCard,
  SERIES,
  StatTile,
  STATUS,
} from "./report-ui";
import type { StockRow } from "../../services/report-analytics";

function coverageTone(days: number): string {
  if (!Number.isFinite(days)) return "text-gray-400";
  if (days <= 7) return "text-red-700 font-medium";
  if (days <= 21) return "text-amber-700";
  return "text-gray-900";
}

export function InventoryPanel({ report, money, moneyCompact }: PanelProps) {
  const inv = report.inventory;

  const health = [
    { label: "Saludable", count: inv.healthy, color: STATUS.good },
    { label: "Por agotarse", count: inv.urgent.length, color: STATUS.warning },
    { label: "Agotado", count: inv.outOfStock.length, color: STATUS.critical },
    { label: "Sin rotación", count: inv.deadStock.length, color: STATUS.serious },
    { label: "Nunca vendido", count: inv.neverSold.length, color: SERIES[0] },
  ];
  const healthTotal = health.reduce((s, h) => s + h.count, 0) || 1;

  const coverageRows = inv.rows
    .filter((r) => r.quantity > 0)
    .sort((a, b) => a.daysOfStock - b.daysOfStock);

  const coverageColumns: Column<StockRow>[] = [
    {
      key: "name",
      header: "Producto",
      render: (r) => (
        <div className="min-w-0">
          <span className="font-medium text-gray-900 truncate block max-w-[150px] md:max-w-[220px]">
            {r.name}
          </span>
          <span className="text-[10px] text-gray-400">{r.type}</span>
        </div>
      ),
      sortValue: (r) => r.name,
    },
    {
      key: "quantity",
      header: "Stock",
      align: "right",
      render: (r) => `${r.quantity}`,
      sortValue: (r) => r.quantity,
    },
    {
      key: "velocity",
      header: "Ritmo",
      align: "right",
      secondary: true,
      render: (r) =>
        r.velocity > 0 ? (
          `${r.velocity.toFixed(2)} u/día`
        ) : (
          <span className="text-gray-300">sin ventas</span>
        ),
      sortValue: (r) => r.velocity,
    },
    {
      key: "coverage",
      header: "Cobertura",
      align: "right",
      render: (r) => (
        <span className={coverageTone(r.daysOfStock)}>{formatDays(r.daysOfStock)}</span>
      ),
      sortValue: (r) => (Number.isFinite(r.daysOfStock) ? r.daysOfStock : 1e9),
    },
    {
      key: "stockout",
      header: "Se agota",
      align: "right",
      secondary: true,
      render: (r) =>
        Number.isFinite(r.daysOfStock) && r.daysOfStock < 365 ? (
          format(new Date(Date.now() + r.daysOfStock * 86_400_000), "dd/MM/yy")
        ) : (
          <span className="text-gray-300">—</span>
        ),
      sortValue: (r) => (Number.isFinite(r.daysOfStock) ? r.daysOfStock : 1e9),
    },
    {
      key: "costValue",
      header: "Capital",
      align: "right",
      render: (r) => money(r.costValue),
      sortValue: (r) => r.costValue,
    },
    {
      key: "lastSold",
      header: "Última venta",
      align: "right",
      secondary: true,
      render: (r) =>
        r.lastSold ? (
          `hace ${r.daysSinceLastSale} d`
        ) : (
          <span className="text-gray-300">nunca</span>
        ),
      sortValue: (r) => r.daysSinceLastSale ?? 1e9,
    },
  ];

  const idleColumns: Column<StockRow>[] = [
    {
      key: "name",
      header: "Producto",
      render: (r) => (
        <span className="font-medium text-gray-900 truncate block max-w-[160px]">
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
      key: "costValue",
      header: "Capital detenido",
      align: "right",
      render: (r) => money(r.costValue),
      sortValue: (r) => r.costValue,
    },
    {
      key: "idle",
      header: "Sin vender",
      align: "right",
      render: (r) =>
        r.daysSinceLastSale !== null ? `${r.daysSinceLastSale} d` : "nunca",
      sortValue: (r) => r.daysSinceLastSale ?? 1e9,
    },
  ];

  const idleRows = [...inv.deadStock, ...inv.neverSold];
  const idleValue = idleRows.reduce((s, r) => s + r.costValue, 0);

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 md:gap-3">
        <StatTile
          label="Inventario al costo"
          value={moneyCompact(inv.costValue)}
          hint={`${inv.units} u en ${inv.skus} productos`}
          icon={<Warehouse className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Valor a precio de venta"
          value={moneyCompact(inv.retailValue)}
          hint="si se vendiera todo a lista"
          icon={<Boxes className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Ganancia potencial"
          value={moneyCompact(inv.potentialProfit)}
          hint="retenida en el stock actual"
          tone="good"
          icon={<Layers className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Rotación del período"
          value={`${inv.turnover.toFixed(2)}x`}
          hint={`vueltas en ${report.range.days} días`}
          icon={<Repeat className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Días de inventario"
          value={formatDays(inv.daysOfInventory)}
          hint="para vender todo el stock"
          icon={<Clock3 className="w-3.5 h-3.5 text-gray-300" />}
        />
        <StatTile
          label="Agotados"
          value={inv.outOfStock.length.toLocaleString()}
          hint={`${inv.lostSales.length} de ellos sí se venden`}
          tone={inv.lostSales.length > 0 ? "critical" : "default"}
          higherIsBetter={false}
          icon={<PackageX className="w-3.5 h-3.5 text-gray-300" />}
        />
      </div>

      <SectionCard
        title="Salud del inventario"
        subtitle={`${inv.skus} productos en catálogo, clasificados por lo que exige cada uno`}
        icon={<Layers className="w-4 h-4 text-primary" />}
      >
        <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-3">
          {health
            .filter((h) => h.count > 0)
            .map((h) => (
              <div
                key={h.label}
                style={{
                  width: `${(h.count / healthTotal) * 100}%`,
                  backgroundColor: h.color,
                }}
                title={`${h.label}: ${h.count}`}
              />
            ))}
        </div>
        <ul className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {health.map((h) => (
            <li key={h.label} className="border border-gray-200 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: h.color }}
                />
                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                  {h.count}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">{h.label}</p>
            </li>
          ))}
        </ul>
      </SectionCard>

      {inv.lostSales.length > 0 && (
        <SectionCard
          title="Agotados que sí se venden"
          subtitle="Cada día sin reponer es facturación que no entra"
          icon={<Ban className="w-4 h-4 text-red-500" />}
        >
          <div className="space-y-3">
            {inv.lostSales.slice(0, 8).map((r) => {
              const perDay = r.velocity * r.sellingPrice;
              const max = inv.lostSales[0].velocity * inv.lostSales[0].sellingPrice;
              return (
                <div key={r.id}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs md:text-sm font-medium text-gray-900 truncate">
                      {r.name}
                    </span>
                    <span className="text-xs text-red-700 font-medium tabular-nums flex-shrink-0">
                      ~{money(perDay)}/día
                    </span>
                  </div>
                  <MeterBar
                    pct={max > 0 ? (perDay / max) * 100 : 0}
                    color={STATUS.critical}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-500 mt-3">
            Estimado con el ritmo de venta del período y el precio de lista
            actual. Reponer estos productos es la acción con mejor retorno hoy.
          </p>
        </SectionCard>
      )}

      {inv.urgent.length > 0 && (
        <SectionCard
          title="Se agotan pronto"
          subtitle="Menos de 7 días de cobertura al ritmo actual"
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
        >
          <DataTable
            columns={coverageColumns}
            rows={inv.urgent}
            rowKey={(r) => r.id}
            initialSort="coverage"
            initialDir="asc"
            maxHeight="18rem"
          />
        </SectionCard>
      )}

      <SectionCard
        title="Cobertura de stock"
        subtitle="Cuántos días aguanta cada producto al ritmo de venta del período"
        icon={<Clock3 className="w-4 h-4 text-primary" />}
      >
        <DataTable
          columns={coverageColumns}
          rows={coverageRows}
          rowKey={(r) => r.id}
          initialSort="coverage"
          initialDir="asc"
          maxHeight="28rem"
          pageSize={12}
          emptyLabel="No hay productos con stock disponible."
        />
      </SectionCard>

      <SectionCard
        title="Capital detenido"
        subtitle={`${money(idleValue)} en productos con stock y sin rotación`}
        icon={<Snowflake className="w-4 h-4 text-primary" />}
      >
        {idleRows.length > 0 ? (
          <>
            <DataTable
              columns={idleColumns}
              rows={idleRows}
              rowKey={(r) => r.id}
              initialSort="costValue"
              maxHeight="20rem"
            />
            <p className="text-[11px] text-gray-500 mt-3">
              Ese dinero está comprado y quieto. Una promoción, un combo o una
              liquidación lo convierte en efectivo para reponer los productos de
              clase A.
            </p>
          </>
        ) : (
          <EmptyNote>Todo el inventario tuvo movimiento reciente.</EmptyNote>
        )}
      </SectionCard>
    </div>
  );
}
