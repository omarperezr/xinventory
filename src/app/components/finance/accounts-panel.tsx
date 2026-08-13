// "Cuentas" - how much money exists and where it is sitting.
//
// The column worth explaining is devaluation. A bolivar pot is booked at what
// each bolivar was worth on the day it arrived; today those same bolivares buy
// fewer dollars. The gap is a real loss caused by holding bolivares, and it is
// invisible in a ledger that only tracks dollars.

import { useState } from "react";
import {
  AlertTriangle,
  Link2,
  Settings2,
  Wallet,
} from "lucide-react";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { FinanceAccount, useFinance } from "../../context/finance-context";
import {
  Column,
  DataTable,
  EmptyNote,
  SectionCard,
  Kpi,
  KpiRow,
} from "../reports/report-ui";
import type { AccountBalance } from "../../services/finance-analytics";
import { ACCOUNT_KIND_LABEL, FinancePanelProps } from "./finance-ui";
import { formatMoneyValue } from "../../context/app-context";

export function AccountsPanel({
  report,
  money,
  accounts,
  isAdmin,
  onManage,
}: FinancePanelProps & { onManage: () => void }) {
  const balances = report.accounts;
  const totalWorth = balances.reduce((s, a) => s + a.worthNowUsd, 0);
  const totalDevaluation = balances.reduce((s, a) => s + a.devaluationUsd, 0);
  const bolivarWorth = balances
    .filter((a) => a.basis === "BS")
    .reduce((s, a) => s + a.worthNowUsd, 0);

  const columns: Column<AccountBalance>[] = [
    {
      key: "name",
      header: "Cuenta",
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">
            {row.name}
            {!row.active && (
              <span className="text-meta text-muted-foreground ml-2">archivada</span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {ACCOUNT_KIND_LABEL[row.kind] ?? row.kind} ·{" "}
            {row.basis === "BS" ? "bolívares" : "dólares"}
          </p>
        </div>
      ),
    },
    {
      key: "inflow",
      header: "Entradas",
      align: "right",
      secondary: true,
      sortValue: (row) => row.inflowUsd,
      render: (row) => (
        <span className="text-primary-soft-foreground" data-money>
          {money(row.inflowUsd)}
        </span>
      ),
    },
    {
      key: "outflow",
      header: "Salidas",
      align: "right",
      secondary: true,
      sortValue: (row) => row.outflowUsd,
      render: (row) => (
        <span className="text-foreground" data-money>
          {money(row.outflowUsd)}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Saldo",
      align: "right",
      sortValue: (row) => row.worthNowUsd,
      render: (row) => (
        <div data-money>
          <span
            className={`font-bold ${
              row.worthNowUsd < 0 ? "text-destructive" : "text-foreground"
            }`}
          >
            {money(row.worthNowUsd)}
          </span>
          {row.basis === "BS" && (
            <p className="text-meta text-muted-foreground">
              Bs {formatMoneyValue(row.balanceBs)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "devaluation",
      header: "Devaluación",
      align: "right",
      sortValue: (row) => row.devaluationUsd,
      render: (row) =>
        row.basis === "USD" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            data-money
            className={
              row.devaluationUsd < 0
                ? "text-destructive font-semibold"
                : "text-muted-foreground"
            }
          >
            {money(row.devaluationUsd)}
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-4 md:space-y-5">
      <KpiRow>
        <Kpi
          label="Total disponible"
          value={money(totalWorth)}
          hint={`${balances.filter((a) => a.active).length} cuenta(s) activa(s)`}
        />
        <Kpi
          label="En bolívares"
          value={money(bolivarWorth)}
          hint={
            totalWorth > 0
              ? `${((bolivarWorth / totalWorth) * 100).toFixed(0)}% del efectivo`
              : undefined
          }
        />
        <Kpi
          label="Pérdida por devaluación"
          value={money(totalDevaluation)}
          tone={totalDevaluation < -1 ? "critical" : "default"}
          hint="Lo que costó tener bolívares guardados"
        />
        <Kpi
          label="Cobros sin asignar"
          value={money(report.cashFlow.unassignedSalesUsd)}
          tone={report.cashFlow.unassignedSalesUsd > 0 ? "warning" : "good"}
          hint="Ventas cuyo método no pertenece a ninguna cuenta"
        />
      </KpiRow>

      <SectionCard
        title="Saldos por cuenta"
        subtitle="Acumulado de todo lo registrado, no solo del período"
        actions={
          isAdmin ? (
            <Button variant="outline" size="sm" onClick={onManage}>
              <Settings2 aria-hidden="true" />
              Gestionar
            </Button>
          ) : null
        }
        icon={<Wallet className="size-5 text-primary" aria-hidden="true" />}
      >
        {accounts.length === 0 ? (
          <EmptyNote>
            No hay cuentas todavía. Crea al menos una para poder registrar de
            dónde sale y a dónde entra el dinero.
          </EmptyNote>
        ) : (
          <DataTable
            columns={columns}
            rows={balances}
            rowKey={(row) => row.id}
            initialSort="balance"
            emptyLabel="Sin cuentas"
            maxHeight="26rem"
          />
        )}
      </SectionCard>

      {report.cashFlow.unassignedMethods.length > 0 && (
        <SectionCard
          title="Métodos de cobro sin cuenta"
          subtitle="El dinero entró, pero el módulo no sabe a qué cuenta"
          icon={<AlertTriangle className="size-5 text-pending" aria-hidden="true" />}
        >
          <p className="text-sm text-muted-foreground mb-3">
            Los vendedores cobraron con estos métodos y ninguna cuenta los
            reclama. Asígnale una cuenta a cada uno y ese dinero pasa a contar en
            el saldo.
          </p>
          <ul className="space-y-2">
            {report.cashFlow.unassignedMethods.map((method) => (
              <MethodRow
                key={method}
                method={method}
                accounts={accounts}
                isAdmin={isAdmin}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      <p className="text-sm text-muted-foreground text-center leading-relaxed">
        La devaluación compara lo que valían los bolívares al entrar contra lo
        que valen hoy a la tasa honesta. Una cuenta en dólares no puede
        devaluarse, por eso muestra un guion.
      </p>
    </div>
  );
}

/**
 * One unclaimed payment method, with the control that claims it. Assigning
 * appends the method to the account's list rather than replacing it, so an
 * account can collect several ("Efectivo", "Efectivo $", "Cash") without the
 * previous ones being dropped.
 */
function MethodRow({
  method,
  accounts,
  isAdmin,
}: {
  method: string;
  accounts: FinanceAccount[];
  isAdmin: boolean;
}) {
  const { saveAccount } = useFinance();
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const active = accounts.filter((a) => a.active);

  const assign = async () => {
    const account = accounts.find((a) => a.id === choice);
    if (!account) return;
    setSaving(true);
    try {
      await saveAccount(
        { paymentMethods: [...account.paymentMethods, method] },
        account.id,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-2 border border-border rounded-lg px-3 py-2">
      <span className="text-base font-semibold text-foreground flex-1 min-w-[8rem]">
        {method}
      </span>

      {!isAdmin ? (
        <span className="text-sm text-muted-foreground">
          Pídele a un administrador que lo asigne
        </span>
      ) : active.length === 0 ? (
        <span className="text-sm text-muted-foreground">
          Crea una cuenta primero, en «Gestionar»
        </span>
      ) : (
        <>
          <Select value={choice} onValueChange={setChoice}>
            <SelectTrigger
              size="sm"
              className="w-48"
              aria-label={`Cuenta para ${method}`}
            >
              <SelectValue placeholder="Entra a…" />
            </SelectTrigger>
            <SelectContent>
              {active.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!choice || saving}
            onClick={assign}
          >
            <Link2 aria-hidden="true" />
            Asignar
          </Button>
        </>
      )}
    </li>
  );
}
