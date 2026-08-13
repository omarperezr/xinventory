// "Obligaciones" - what is owed, what is owed to us, and what repeats.
//
// The recurring list is not a schedule that fires: it is derived from the rules
// and checked against what is already recorded, every time the screen opens. So
// a bill can be proposed twice and posted once, even from two devices, because
// the occurrence carries its own key.

import { useState } from "react";
import {
  HandCoins,
  Repeat,
  Users,
} from "lucide-react";
import { Button } from "../ui/button";
import { Column, DataTable, SectionCard, Kpi, KpiRow } from "../reports/report-ui";
import {
  EntryInput,
  todayIso,
  useFinance,
} from "../../context/finance-context";
import type {
  DueOccurrence,
  Obligation,
} from "../../services/finance-analytics";
import { useAuth } from "../../context/auth-context";
import {
  CADENCE_LABEL,
  FinancePanelProps,
  formatDay,
  useLookup,
} from "./finance-ui";
import { EntryDialog } from "./entry-dialog";

export function ObligationsPanel({
  report,
  money,
  accounts,
  categories,
  payees,
  isAdmin,
}: FinancePanelProps) {
  const { addEntry, settleEntry, recurring } = useFinance();
  const { currentUser } = useAuth();
  const { categoryName } = useLookup(accounts, categories, payees);

  const [prefill, setPrefill] = useState<
    (Partial<EntryInput> & { title?: string }) | undefined
  >();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { payables, receivables } = report.obligations;
  const employees = payees.filter(
    (p) => p.active && p.kind === "employee" && p.baseSalaryUsd,
  );

  /** Posts an occurrence exactly as the rule describes it. The period key is
   *  what stops a second click - or a second device - recording it twice. */
  const postOccurrence = async (occurrence: DueOccurrence) => {
    if (!currentUser) return;
    await addEntry(
      {
        kind: occurrence.kind,
        status: "paid",
        occurredOn: occurrence.periodKey,
        categoryId: occurrence.categoryId,
        accountId: occurrence.accountId,
        payeeId: occurrence.payeeId,
        amountUsd: occurrence.amountUsd,
        description: occurrence.ruleName,
        recurringId: occurrence.ruleId,
        periodKey: occurrence.periodKey,
      },
      currentUser.name,
    );
  };

  const occurrenceColumns: Column<DueOccurrence>[] = [
    {
      key: "name",
      header: "Regla",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{row.ruleName}</p>
          <p className="text-sm text-muted-foreground">
            {formatDay(row.periodKey)} ·{" "}
            {row.daysLate > 0 ? `${row.daysLate} día(s) de atraso` : "hoy"}
          </p>
        </div>
      ),
      sortValue: (row) => row.ruleName,
    },
    {
      key: "category",
      header: "Categoría",
      secondary: true,
      render: (row) => (
        <span className="text-muted-foreground">{categoryName(row.categoryId)}</span>
      ),
    },
    {
      key: "amount",
      header: "Monto",
      align: "right",
      sortValue: (row) => row.amountUsd,
      render: (row) => (
        <span className="font-bold text-foreground" data-money>{money(row.amountUsd)}</span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      width: "8.5rem",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            onClick={() => postOccurrence(row)}
          >
            Registrar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPrefill({
                kind: row.kind,
                amountUsd: row.amountUsd,
                categoryId: row.categoryId,
                accountId: row.accountId,
                payeeId: row.payeeId,
                occurredOn: row.periodKey,
                recurringId: row.ruleId,
                periodKey: row.periodKey,
                title: row.ruleName,
              });
              setDialogOpen(true);
            }}
          >
            Ajustar
          </Button>
        </div>
      ),
    },
  ];

  const obligationColumns = (kind: "payable" | "receivable"): Column<Obligation>[] => [
    {
      key: "description",
      header: kind === "payable" ? "A quién" : "Quién debe",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">
            {row.payeeName ?? row.description}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            {[row.categoryName, row.payeeName ? row.description : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ),
      sortValue: (row) => row.payeeName ?? row.description,
    },
    {
      key: "due",
      header: "Vence",
      sortValue: (row) => row.dueOn ?? "9999",
      render: (row) => (
        <span
          className={`whitespace-nowrap ${
            row.overdue ? "text-destructive font-semibold" : "text-muted-foreground"
          }`}
        >
          {formatDay(row.dueOn)}
          {row.daysUntilDue !== null && (
            <span className="text-meta text-muted-foreground ml-1" data-money>
              ({row.overdue
                ? `${Math.abs(row.daysUntilDue)}d vencida`
                : `${row.daysUntilDue}d`})
            </span>
          )}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Monto",
      align: "right",
      sortValue: (row) => row.amountUsd,
      render: (row) => (
        <span className="font-bold text-foreground" data-money>{money(row.amountUsd)}</span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      width: "7rem",
      render: (row) =>
        isAdmin ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => settleEntry(row.id, row.accountId, todayIso())}
          >
            {kind === "payable" ? "Pagué" : "Me pagaron"}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4 md:space-y-5">
      <KpiRow>
        <Kpi
          label="Por pagar"
          value={money(report.obligations.payablesUsd)}
          hint={`${payables.length} cuenta(s)`}
          tone={report.obligations.overdueCount > 0 ? "critical" : "default"}
        />
        <Kpi
          label="Vencidas"
          value={String(report.obligations.overdueCount)}
          tone={report.obligations.overdueCount > 0 ? "critical" : "good"}
        />
        <Kpi
          label="Vence en 30 días"
          value={money(report.obligations.next30Usd)}
        />
        <Kpi
          label="Por cobrar"
          value={money(report.obligations.receivablesUsd)}
          hint={`${receivables.length} cuenta(s)`}
        />
      </KpiRow>

      <SectionCard
        title="Recurrentes por registrar"
        subtitle="Alquiler, sueldos, servicios. Se proponen; nadie los registra por ti"
        icon={<Repeat className="size-5 text-primary" aria-hidden="true" />}
      >
        <DataTable
          columns={occurrenceColumns}
          rows={report.dueOccurrences}
          rowKey={(row) => `${row.ruleId}:${row.periodKey}`}
          emptyLabel={
            recurring.filter((r) => r.active).length === 0
              ? "No hay reglas recurrentes. Créalas en Configuración."
              : "Todo al día: no hay ocurrencias pendientes."
          }
          maxHeight="20rem"
          pageSize={15}
        />
      </SectionCard>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-5">
        <SectionCard
          title="Cuentas por pagar"
          subtitle="Compromisos registrados que aún no se pagan"
          icon={<HandCoins className="size-5 text-primary" aria-hidden="true" />}
        >
          <DataTable
            columns={obligationColumns("payable")}
            rows={payables}
            rowKey={(row) => row.id}
            emptyLabel="Nada pendiente por pagar"
            maxHeight="22rem"
            pageSize={12}
          />
        </SectionCard>

        <SectionCard
          title="Cuentas por cobrar"
          subtitle="Ventas o servicios que aún no te han pagado"
          icon={<HandCoins className="size-5 text-primary" aria-hidden="true" />}
        >
          <DataTable
            columns={obligationColumns("receivable")}
            rows={receivables}
            rowKey={(row) => row.id}
            emptyLabel="Nadie te debe nada registrado"
            maxHeight="22rem"
            pageSize={12}
          />
        </SectionCard>
      </div>

      {employees.length > 0 && (
        <SectionCard
          title="Nómina"
          subtitle="Sueldos base configurados. Un clic propone el pago ya lleno"
          icon={<Users className="size-5 text-primary" aria-hidden="true" />}
        >
          <ul className="divide-y divide-border">
            {employees.map((employee) => (
              <li
                key={employee.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-base font-semibold text-foreground truncate">
                    {employee.name}
                  </p>
                  <p className="text-sm text-muted-foreground" data-money>
                    {money(employee.baseSalaryUsd ?? 0)} ·{" "}
                    {employee.payCadence
                      ? CADENCE_LABEL[employee.payCadence]
                      : "sin frecuencia"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    setPrefill({
                      kind: "expense",
                      amountUsd: employee.baseSalaryUsd ?? 0,
                      payeeId: employee.id,
                      occurredOn: todayIso(),
                      title: `Sueldo ${employee.name}`,
                    });
                    setDialogOpen(true);
                  }}
                >
                  Pagar
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground mt-3">
            El pago se registra como cualquier otro gasto: elige la cuenta de
            donde sale y, si es en bolívares, queda con la tasa del día.
          </p>
        </SectionCard>
      )}

      <EntryDialog
        open={dialogOpen}
        onOpenChange={(value) => {
          setDialogOpen(value);
          if (!value) setPrefill(undefined);
        }}
        prefill={prefill}
        defaultKind={prefill?.kind ?? "expense"}
      />

      <p className="text-sm text-muted-foreground text-center">
        Las cuentas por pagar y cobrar no dependen del período elegido: una
        factura de hace tres meses sigue debiéndose hoy.
      </p>
    </div>
  );
}
