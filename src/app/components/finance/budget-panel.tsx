// "Presupuesto" - where the money went against where it was supposed to go,
// and how much of the profit was actually set aside.
//
// Budgets are monthly figures, so they are scaled to the length of the selected
// period. Comparing a 7-day window against a monthly budget without that would
// make every category look wildly under-spent.

import { useState } from "react";
import { Link2, PieChart, PiggyBank, Target } from "lucide-react";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  FinanceAccount,
  useFinance,
} from "../../context/finance-context";
import {
  Column,
  DataTable,
  EmptyNote,
  MeterBar,
  RankRow,
  SectionCard,
} from "../reports/report-ui";

// Rule 9 palette, in rank order.
const RANK_COLORS = ["#0f7b4d", "#3f6fae", "#d9962b", "#8a5fa8", "#c05252"];
import type {
  AllocationStatus,
  CategorySpend,
} from "../../services/finance-analytics";
import {
  ALLOCATION_BASIS_LABEL,
  FinancePanelProps,
  NATURE_LABEL,
} from "./finance-ui";

export function BudgetPanel({
  report,
  money,
  accounts,
  isAdmin,
}: FinancePanelProps) {
  const unlinkedFunds = report.allocations.filter((a) => !a.accountId).length;
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
          <p className="font-semibold text-foreground truncate">{row.name}</p>
          <p className="text-sm text-muted-foreground">
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
        <span className="font-bold text-foreground" data-money>{money(row.amount)}</span>
      ),
    },
    {
      key: "previous",
      header: "Período anterior",
      align: "right",
      secondary: true,
      sortValue: (row) => row.previousAmount,
      render: (row) => (
        <span className="text-muted-foreground" data-money>
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
          <span className="text-sm text-muted-foreground">sin presupuesto</span>
        ) : (
          <div className="w-28 ml-auto">
            <p
              data-money
              className={`text-meta mb-1 ${
                (row.budgetUsedPct ?? 0) > 100 ? "text-destructive font-semibold" : "text-muted-foreground"
              }`}
            >
              {money(row.budgetForRange)} · {(row.budgetUsedPct ?? 0).toFixed(0)}%
            </p>
            <MeterBar
              pct={Math.min(row.budgetUsedPct ?? 0, 100)}
              color={
                (row.budgetUsedPct ?? 0) > 100
                  ? "#c05252"
                  : (row.budgetUsedPct ?? 0) > 85
                    ? "#d9962b"
                    : "#0f7b4d"
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
        icon={<PieChart className="size-5 text-primary" aria-hidden="true" />}
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
                color={RANK_COLORS[index % RANK_COLORS.length]}
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
          icon={<PiggyBank className="size-5 text-primary" aria-hidden="true" />}
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
        subtitle={
          unlinkedFunds > 0
            ? `${unlinkedFunds} fondo(s) sin cuenta: vincúlalos para saber dónde está ese dinero`
            : "Lo que la regla dice que debería apartarse, contra lo que se apartó"
        }
        icon={<Target className="size-5 text-primary" aria-hidden="true" />}
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
                accounts={accounts}
                isAdmin={isAdmin}
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
  accounts,
  isAdmin,
}: {
  allocation: AllocationStatus;
  money: (usd: number) => string;
  accounts: FinanceAccount[];
  isAdmin: boolean;
}) {
  const { saveAllocation } = useFinance();
  const [linking, setLinking] = useState(false);
  const [choice, setChoice] = useState("");
  const linked = accounts.find((a) => a.id === allocation.accountId);
  const activeAccounts = accounts.filter((a) => a.active);

  const link = async (accountId: string) => {
    await saveAllocation({ accountId }, allocation.id);
    setLinking(false);
  };

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
          <p className="text-base font-semibold text-foreground truncate">
            {allocation.name}
          </p>
          <p className="text-sm text-muted-foreground" data-money>
            {allocation.percent}% de {ALLOCATION_BASIS_LABEL[allocation.basis]} ·
            base {money(allocation.baseUsd)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold text-foreground" data-money>
            {money(allocation.fundedUsd)}
          </p>
          <p className="text-sm text-muted-foreground" data-money>
            de {money(allocation.shouldBeUsd)}
          </p>
        </div>
      </div>
      <MeterBar
        pct={Math.min(fundedPct, 100)}
        color={fundedPct >= 99 ? "#0f7b4d" : "#d9962b"}
      />
      <p className="text-sm mt-1.5 text-muted-foreground">
        {allocation.gapUsd > 0.01
          ? `Faltan ${money(allocation.gapUsd)} por trasladar al fondo.`
          : "Fondeado según la regla."}
        {allocation.targetPct !== null &&
          ` Meta: ${allocation.targetPct.toFixed(0)}% de ${money(allocation.targetUsd ?? 0)}.`}
      </p>

      {/* A fund with nowhere to put the money is just a number on a screen.
          Linking it is one control, here, rather than a trip to the settings
          dialog. */}
      {linked ? (
        <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5">
          <Link2 className="size-4" aria-hidden="true" />
          Se guarda en{" "}
          <span className="font-semibold text-foreground">{linked.name}</span>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setChoice(linked.id);
                setLinking(true);
              }}
              className="text-primary hover:underline"
            >
              cambiar
            </button>
          )}
        </p>
      ) : (
        !linking && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-meta font-semibold text-pending bg-pending-soft rounded-full px-2 py-0.5">
              Sin cuenta asignada
            </span>
            {isAdmin && activeAccounts.length > 0 && (
              <button
                type="button"
                onClick={() => setLinking(true)}
                className="text-sm text-primary hover:underline font-semibold"
              >
                Vincular a una cuenta
              </button>
            )}
            {activeAccounts.length === 0 && (
              <span className="text-sm text-muted-foreground">
                Crea primero una cuenta en Cuentas → Gestionar.
              </span>
            )}
          </div>
        )
      )}

      {linking && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={choice} onValueChange={setChoice}>
            <SelectTrigger
              size="sm"
              className="w-52"
              aria-label={`Cuenta para ${allocation.name}`}
            >
              <SelectValue placeholder="Elegir cuenta" />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!choice}
            onClick={() => link(choice)}
          >
            Vincular
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLinking(false)}
          >
            Cancelar
          </Button>
        </div>
      )}
    </li>
  );
}
