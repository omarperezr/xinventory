// "Inventario" - the present tense of the business. Crosses what is on the
// shelf with how fast it leaves, which is what turns a stock list into a
// decision: reorder, discount, or stop buying it.

import { format } from "date-fns";
import {
  AlertTriangle,
  Ban,
  Clock3,
  Layers,
  Snowflake,
} from "lucide-react";
import {
  Column,
  DataTable,
  EmptyNote,
  formatDays,
  Kpi,
  KpiRow,
  MeterBar,
  PanelProps,
  SectionCard,
  SERIES,
  STATUS,
} from "./report-ui";
import type { StockRow } from "../../services/report-analytics";

function coverageTone(days: number): string {
  if (!Number.isFinite(days)) return "text-muted-foreground";
  if (days <= 7) return "text-destructive font-medium";
  if (days <= 21) return "text-pending";
  return "text-foreground";
}

export function InventoryPanel({ report, money, moneyCompact }: PanelProps) {
  const inv = report.inventory;

  const health = [
    { label: "Saludable", count: inv.healthy, color: STATUS.good },
    { label: "Por agotarse", count: inv.urgent.length, color: STATUS.warning },
    { label: "Agotado", count: inv.outOfStock.length, color: STATUS.critical },
    { label: "Sin rotación", count: inv.deadStock.length, color: STATUS.serious },
    { label: "Nunca vendido", count: inv.neverSold.length, color: SERIES[1] },
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
          <span className="font-medium text-foreground truncate block max-w-[150px] md:max-w-[220px]">
            {r.name}
          </span>
          <span className="text-meta text-muted-foreground">{r.type}</span>
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
          <span className="text-muted-foreground/50">sin ventas</span>
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
          <span className="text-muted-foreground/50">—</span>
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
          <span className="text-muted-foreground/50">nunca</span>
        ),
      sortValue: (r) => r.daysSinceLastSale ?? 1e9,
    },
  ];

  const idleColumns: Column<StockRow>[] = [
    {
      key: "name",
      header: "Producto",
      render: (r) => (
        <span className="font-medium text-foreground truncate block max-w-[160px]">
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
      <KpiRow>
        <Kpi
          label="Inventario al costo"
          value={moneyCompact(inv.costValue)}
          hint={`${inv.units} u en ${inv.skus} productos`}
        />
        <Kpi
          label="Valor a precio de venta"
          value={moneyCompact(inv.retailValue)}
          hint="si se vendiera todo a lista"
        />
        <Kpi
          label="Ganancia potencial"
          value={moneyCompact(inv.potentialProfit)}
          hint="retenida en el stock actual"
          tone="good"
        />
        <Kpi
          label="Rotación del período"
          value={`${inv.turnover.toFixed(2)}x`}
          hint={`vueltas en ${report.range.days} días`}
        />
        <Kpi
          label="Días de inventario"
          value={formatDays(inv.daysOfInventory)}
          hint="para vender todo el stock"
        />
        <Kpi
          label="Agotados"
          value={inv.outOfStock.length.toLocaleString()}
          hint={`${inv.lostSales.length} de ellos sí se venden`}
          tone={inv.lostSales.length > 0 ? "critical" : "default"}
          higherIsBetter={false}
        />
      </KpiRow>

      <SectionCard
        title="Salud del inventario"
        subtitle={`${inv.skus} productos en catálogo, clasificados por lo que exige cada uno`}
        icon={<Layers className="w-4 h-4 text-primary" aria-hidden="true" />}
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
            <li key={h.label} className="border border-border rounded-lg p-2.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: h.color }}
                />
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {h.count}
                </span>
              </div>
              <p className="text-meta text-muted-foreground mt-0.5">{h.label}</p>
            </li>
          ))}
        </ul>
      </SectionCard>

      {inv.lostSales.length > 0 && (
        <SectionCard
          title="Agotados que sí se venden"
          subtitle="Cada día sin reponer es facturación que no entra"
          icon={<Ban className="w-4 h-4 text-destructive" aria-hidden="true" />}
        >
          <div className="space-y-3">
            {inv.lostSales.slice(0, 8).map((r) => {
              const perDay = r.velocity * r.sellingPrice;
              const max = inv.lostSales[0].velocity * inv.lostSales[0].sellingPrice;
              return (
                <div key={r.id}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground truncate">
                      {r.name}
                    </span>
                    <span className="text-sm text-destructive font-medium tabular-nums flex-shrink-0">
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
          <p className="text-sm text-muted-foreground mt-3">
            Estimado con el ritmo de venta del período y el precio de lista
            actual. Reponer estos productos es la acción con mejor retorno hoy.
          </p>
        </SectionCard>
      )}

      {inv.urgent.length > 0 && (
        <SectionCard
          title="Se agotan pronto"
          subtitle="Menos de 7 días de cobertura al ritmo actual"
          icon={<AlertTriangle className="w-4 h-4 text-pending" aria-hidden="true" />}
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
        icon={<Clock3 className="w-4 h-4 text-primary" aria-hidden="true" />}
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
        icon={<Snowflake className="w-4 h-4 text-primary" aria-hidden="true" />}
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
            <p className="text-sm text-muted-foreground mt-3">
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
