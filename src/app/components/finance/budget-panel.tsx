// "Presupuesto" - where the money went against where it was supposed to go,
// and how much of the profit was actually set aside.
//
// Budgets are monthly figures, so they are scaled to the length of the selected
// period. Comparing a 7-day window against a monthly budget without that would
// make every category look wildly under-spent.

import { PieChart, PiggyBank, Target } from "lucide-react";
import {
  Column,
  DataTable,
  EmptyNote,
  MeterBar,
  RankRow,
  SectionCard,
  SERIES,
  STATUS,
} from "../reports/report-ui";
import type {
  AllocationStatus,
  CategorySpend,
} from "../../services/finance-analytics";
import {
  ALLOCATION_BASIS_LABEL,
  FinancePanelProps,
  NATURE_LABEL,
} from "./finance-ui";

export function BudgetPanel({ report, money }: FinancePanelProps) {
  const expenses = report.categories.filter((c) => c.kind === "expense");
  const income = report.categories.filter((c) => c.kind === "income");
  const biggest = expenses[0]?.amount ?? 0;

  const columns: Column<CategorySpend>[] = [
    {
      key: "name",
      header: "Categoría",
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{row.name}</p>
          <p className="text-meta text-gray-500">
            {NATURE_LABEL[row.nature]} · {row.entries} movimiento(s)
          </p>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Gastado",
      align: "right",
      sortValue: (row) => row.amount,
      render: (row) => (
        <span className="font-semibold text-gray-900">{money(row.amount)}</span>
      ),
    },
    {
      key: "previous",
      header: "Período anterior",
      align: "right",
      secondary: true,
      sortValue: (row) => row.previousAmount,
      render: (row) => (
        <span className="text-gray-600">
          {row.previousAmount > 0 ? money(row.previousAmount) : "—"}
        </span>
      ),
    },
    {
      key: "budget",
      header: "Presupuesto",
      align: "right",
      sortValue: (row) => row.budgetUsedPct ?? -1,
      render: (row) =>
        row.budgetForRange === null ? (
          <span className="text-gray-400">sin presupuesto</span>
        ) : (
          <div className="w-28 ml-auto">
            <p
              className={`text-meta mb-1 ${
                (row.budgetUsedPct ?? 0) > 100 ? "text-red-700 font-medium" : "text-gray-600"
              }`}
            >
              {money(row.budgetForRange)} · {(row.budgetUsedPct ?? 0).toFixed(0)}%
            </p>
            <MeterBar
              pct={Math.min(row.budgetUsedPct ?? 0, 100)}
              color={
                (row.budgetUsedPct ?? 0) > 100
                  ? STATUS.critical
                  : (row.budgetUsedPct ?? 0) > 85
                    ? STATUS.warning
                    : STATUS.good
              }
            />
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-4 md:space-y-5">
      <SectionCard
        title="En qué se va el dinero"
        subtitle="Ordenado por peso. Los primeros tres suelen explicar casi todo"
        icon={<PieChart className="w-4 h-4 text-primary" />}
      >
        {expenses.length === 0 ? (
          <EmptyNote>Sin gastos registrados en el período</EmptyNote>
        ) : (
          <div className="space-y-3 mb-5">
            {expenses.slice(0, 5).map((category, index) => (
              <RankRow
                key={category.id}
                index={index + 1}
                name={category.name}
                value={money(category.amount)}
                sub={`${category.sharePct.toFixed(0)}%`}
                pct={biggest > 0 ? (category.amount / biggest) * 100 : 0}
                color={SERIES[index % SERIES.length]}
              />
            ))}
          </div>
        )}

        <DataTable
          columns={columns}
          rows={expenses}
          rowKey={(row) => row.id || "sin-categoria"}
          initialSort="amount"
          emptyLabel="Sin gastos en el período"
          maxHeight="26rem"
          pageSize={15}
        />
      </SectionCard>

      {income.length > 0 && (
        <SectionCard
          title="Ingresos que no son ventas"
          subtitle="Servicios, rendimientos, alquileres, comisiones"
          icon={<PiggyBank className="w-4 h-4 text-primary" />}
        >
          <DataTable
            columns={columns.filter((c) => c.key !== "budget")}
            rows={income}
            rowKey={(row) => row.id || "sin-categoria"}
            initialSort="amount"
            emptyLabel="Sin otros ingresos"
            maxHeight="18rem"
            pageSize={10}
          />
        </SectionCard>
      )}

      <SectionCard
        title="Fondos y apartados"
        subtitle="Lo que la regla dice que debería apartarse, contra lo que se apartó"
        icon={<Target className="w-4 h-4 text-primary" />}
      >
        {report.allocations.length === 0 ? (
          <EmptyNote>
            No hay reglas de asignación. Créalas en Configuración: por ejemplo,
            20% de la utilidad neta para reponer inventario.
          </EmptyNote>
        ) : (
          <ul className="space-y-4">
            {report.allocations.map((allocation) => (
              <AllocationRow
                key={allocation.id}
                allocation={allocation}
                money={money}
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function AllocationRow({
  allocation,
  money,
}: {
  allocation: AllocationStatus;
  money: (usd: number) => string;
}) {
  const fundedPct =
    allocation.shouldBeUsd > 0
      ? (allocation.fundedUsd / allocation.shouldBeUsd) * 100
      : allocation.fundedUsd > 0
        ? 100
        : 0;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {allocation.name}
          </p>
          <p className="text-meta text-gray-500">
            {allocation.percent}% de {ALLOCATION_BASIS_LABEL[allocation.basis]} ·
            base {money(allocation.baseUsd)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900 tabular-nums">
            {money(allocation.fundedUsd)}
          </p>
          <p className="text-meta text-gray-500">
            de {money(allocation.shouldBeUsd)}
          </p>
        </div>
      </div>
      <MeterBar
        pct={Math.min(fundedPct, 100)}
        color={fundedPct >= 99 ? STATUS.good : STATUS.warning}
      />
      <p className="text-meta mt-1 text-gray-500">
        {allocation.gapUsd > 0.01
          ? `Faltan ${money(allocation.gapUsd)} por trasladar al fondo.`
          : "Fondeado según la regla."}
        {allocation.targetPct !== null &&
          ` Meta: ${allocation.targetPct.toFixed(0)}% de ${money(allocation.targetUsd ?? 0)}.`}
      </p>
    </li>
  );
}
