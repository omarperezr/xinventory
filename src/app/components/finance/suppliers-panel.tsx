// "Proveedores" - the standing with each supplier, and where the same product
// is cheaper.
//
// The price table is the reason a product may have several suppliers at once:
// with one supplier per item you can only see what you paid, never what you
// could have paid.

import {
  Building2,
  TrendingDown,
} from "lucide-react";
import { Column, DataTable, SectionCard, Kpi, KpiRow } from "../reports/report-ui";
import type {
  SupplierPrice,
  SupplierStanding,
} from "../../services/finance-analytics";
import { FinancePanelProps, formatDay } from "./finance-ui";

export function SuppliersPanel({ report, money }: FinancePanelProps) {
  const { suppliers, supplierPrices } = report;

  const totalOwed = suppliers.reduce((s, x) => s + x.owedUsd, 0);
  const totalCredit = suppliers.reduce((s, x) => s + x.creditUsd, 0);
  const overpaying = supplierPrices.filter((p) => p.premiumPct > 5);

  const supplierColumns: Column<SupplierStanding>[] = [
    {
      key: "name",
      header: "Proveedor",
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{row.name}</p>
          <p className="text-sm text-muted-foreground">
            {row.purchases} compra(s) · última {formatDay(row.lastPurchaseOn)}
          </p>
        </div>
      ),
    },
    {
      key: "purchased",
      header: "Comprado",
      align: "right",
      sortValue: (row) => row.purchasedUsd,
      render: (row) => (
        <span className="font-bold text-foreground" data-money>{money(row.purchasedUsd)}</span>
      ),
    },
    {
      key: "returned",
      header: "Devuelto",
      align: "right",
      secondary: true,
      sortValue: (row) => row.returnedUsd,
      render: (row) => (
        <span className="text-muted-foreground" data-money>
          {row.returnedUsd > 0 ? money(row.returnedUsd) : "—"}
        </span>
      ),
    },
    {
      key: "owed",
      header: "Le debo",
      align: "right",
      sortValue: (row) => row.owedUsd,
      render: (row) => (
        <span
          data-money
          className={row.owedUsd > 0 ? "text-pending font-semibold" : "text-muted-foreground"}
        >
          {row.owedUsd > 0 ? money(row.owedUsd) : "—"}
        </span>
      ),
    },
    {
      key: "credit",
      header: "Me debe",
      align: "right",
      sortValue: (row) => row.creditUsd,
      render: (row) => (
        <span
          data-money
          className={
            row.creditUsd > 0
              ? "text-primary-soft-foreground font-semibold"
              : "text-muted-foreground"
          }
        >
          {row.creditUsd > 0 ? money(row.creditUsd) : "—"}
        </span>
      ),
    },
  ];

  const priceColumns: Column<SupplierPrice>[] = [
    {
      key: "item",
      header: "Producto",
      sortValue: (row) => row.itemName,
      render: (row) => (
        <p className="font-semibold text-foreground truncate">{row.itemName}</p>
      ),
    },
    {
      key: "supplier",
      header: "Proveedor",
      sortValue: (row) => row.supplierName,
      render: (row) => (
        <div className="min-w-0">
          <p className="text-foreground truncate">{row.supplierName}</p>
          <p className="text-meta text-muted-foreground">
            {formatDay(row.lastPurchasedOn)}
          </p>
        </div>
      ),
    },
    {
      key: "cost",
      header: "Último costo",
      align: "right",
      sortValue: (row) => row.lastCostUsd,
      render: (row) => (
        <span className="font-bold text-foreground" data-money>{money(row.lastCostUsd)}</span>
      ),
    },
    {
      key: "premium",
      header: "Contra el más barato",
      align: "right",
      sortValue: (row) => row.premiumPct,
      render: (row) =>
        row.cheapest ? (
          <span className="text-meta px-2 py-0.5 rounded-full bg-primary-soft text-primary-soft-foreground font-semibold whitespace-nowrap">
            el más barato
          </span>
        ) : (
          <span className="text-destructive font-semibold" data-money>
            +{row.premiumPct.toFixed(1)}%
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-4 md:space-y-5">
      <KpiRow>
        <Kpi
          label="Proveedores"
          value={String(suppliers.length)}
        />
        <Kpi
          label="Les debo"
          value={money(totalOwed)}
          tone={totalOwed > 0 ? "warning" : "good"}
        />
        <Kpi
          label="Crédito a favor"
          value={money(totalCredit)}
          hint="De devoluciones sin usar"
          tone={totalCredit > 0 ? "good" : "default"}
        />
        <Kpi
          label="Productos con opción más barata"
          value={String(overpaying.length)}
          tone={overpaying.length > 0 ? "warning" : "good"}
        />
      </KpiRow>

      <SectionCard
        title="Estado con cada proveedor"
        subtitle="Lo comprado, lo devuelto y quién le debe a quién"
        icon={<Building2 className="size-5 text-primary" aria-hidden="true" />}
      >
        <DataTable
          columns={supplierColumns}
          rows={suppliers}
          rowKey={(row) => row.id}
          initialSort="purchased"
          emptyLabel="Aún no hay compras con proveedor asignado"
          maxHeight="26rem"
          pageSize={15}
        />
      </SectionCard>

      <SectionCard
        title="Comparación de precios"
        subtitle="Último costo pagado a cada proveedor por el mismo producto"
        icon={<TrendingDown className="size-5 text-primary" aria-hidden="true" />}
      >
        <DataTable
          columns={priceColumns}
          rows={supplierPrices}
          rowKey={(row) => `${row.itemId}:${row.supplierId}`}
          initialSort="premium"
          emptyLabel="Hacen falta compras de un mismo producto a varios proveedores"
          maxHeight="26rem"
          pageSize={20}
        />
        <p className="text-sm text-muted-foreground mt-3">
          Se compara el último costo por proveedor, sin flete. Un proveedor más
          caro puede seguir conviniendo si entrega más rápido o fía.
        </p>
      </SectionCard>
    </div>
  );
}
