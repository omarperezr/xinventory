// Shared vocabulary for the finance screens: what every panel receives, and the
// small pieces that would otherwise be re-typed in each of them.
//
// The layout primitives (cards, tiles, tables, bars) come from the reports
// dashboard rather than being copied - the two screens are the same product and
// should not drift apart.

import { ReactNode } from "react";
import type { FinanceReport } from "../../services/finance-analytics";
import type {
  CategoryNature,
  EntryKind,
  FinanceAccount,
  FinanceCategory,
  FinancePayee,
} from "../../context/finance-context";
export interface FinancePanelProps {
  report: FinanceReport;
  /** Full precision, e.g. "$ 1234.56". */
  money: (usd: number) => string;
  /** Abbreviated for tiles and axes, e.g. "$ 1.2K". */
  moneyCompact: (usd: number) => string;
  convert: (usd: number) => number;
  symbol: string;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  payees: FinancePayee[];
  isAdmin: boolean;
}

/** What each structural bucket is called on screen. The names are the shop's
 *  to change; these labels describe the bucket, not the category. */
export const NATURE_LABEL: Record<CategoryNature, string> = {
  cogs: "Mercancía",
  fixed: "Gasto fijo",
  variable: "Gasto variable",
  tax: "Impuesto",
  investment: "Inversión",
  owner: "Retiro del dueño",
  other: "Otro",
};

export const NATURE_HINT: Record<CategoryNature, string> = {
  cogs: "Compra de stock: sale efectivo hoy, el costo entra al resultado cuando se vende",
  fixed: "Se paga venda o no venda. Define el punto de equilibrio",
  variable: "Sube y baja con la actividad",
  tax: "Se le debe al Estado",
  investment: "Utilidad apartada, no consumida",
  owner: "Dinero que sacó el dueño. No es un costo del negocio",
  other: "Sin clasificar. Cuenta como gasto variable",
};

export const KIND_LABEL: Record<EntryKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Traslado",
};

export const CADENCE_LABEL: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
};

export const ACCOUNT_KIND_LABEL: Record<string, string> = {
  cash: "Efectivo",
  bank: "Banco",
  digital: "Digital",
  credit: "Crédito",
  other: "Otra",
};

export const PAYEE_KIND_LABEL: Record<string, string> = {
  employee: "Empleado",
  supplier: "Proveedor",
  landlord: "Arrendador",
  service: "Servicio",
  government: "Gobierno",
  customer: "Cliente",
  other: "Otro",
};

export const ALLOCATION_BASIS_LABEL: Record<string, string> = {
  gross_sales: "Ventas brutas",
  gross_profit: "Utilidad bruta",
  net_profit: "Utilidad neta",
};

export function KindBadge({ kind }: { kind: EntryKind }) {
  const styles: Record<EntryKind, string> = {
    income: "bg-primary-soft text-primary-soft-foreground",
    expense: "bg-destructive-soft text-destructive-soft-foreground",
    transfer: "bg-secondary text-secondary-foreground",
  };
  return (
    <span
      className={`text-meta px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${styles[kind]}`}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

export function StatusBadge({
  status,
  overdue,
}: {
  status: "paid" | "pending" | "void";
  overdue?: boolean;
}) {
  if (status === "paid") {
    return (
      <span className="text-meta px-2 py-0.5 rounded-full font-semibold bg-primary-soft text-primary-soft-foreground">
        Pagado
      </span>
    );
  }
  if (status === "void") {
    return (
      <span className="text-meta px-2 py-0.5 rounded-full font-semibold bg-secondary text-muted-foreground">
        Anulado
      </span>
    );
  }
  return (
    <span
      className={`text-meta px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${
        overdue
          ? "bg-destructive-soft text-destructive-soft-foreground"
          : "bg-pending-soft text-pending"
      }`}
    >
      {overdue ? "Vencido" : "Pendiente"}
    </span>
  );
}

/** One line of the profit statement. Indented lines are subtotals of the line
 *  above them, and the emphasised ones are the three numbers people look for. */
export function PnlRow({
  label,
  value,
  hint,
  emphasis = false,
  negative = false,
  indent = false,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  emphasis?: boolean;
  negative?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2 ${
        emphasis ? "border-t border-border mt-1 pt-2.5" : ""
      }`}
    >
      <div className={`min-w-0 ${indent ? "pl-4" : ""}`}>
        <span
          className={`text-sm md:text-base ${
            emphasis ? "font-bold text-foreground" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        {hint && (
          <p className="text-meta text-muted-foreground leading-tight">{hint}</p>
        )}
      </div>
      <span
        data-money
        className={`whitespace-nowrap ${
          emphasis ? "text-base md:text-lg font-bold" : "text-sm md:text-base font-semibold"
        } ${negative ? "text-destructive" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

export function AlertList({
  alerts,
}: {
  alerts: FinanceReport["alerts"];
}) {
  if (alerts.length === 0) {
    return (
      <p className="text-base text-muted-foreground py-6 text-center">
        Nada que atender. Las cuentas están al día.
      </p>
    );
  }
  const tone: Record<string, string> = {
    critical: "bg-destructive-soft text-destructive-soft-foreground",
    warning: "bg-pending-soft text-pending",
    info: "bg-secondary text-secondary-foreground",
  };
  return (
    <ul className="space-y-2">
      {alerts.map((alert) => (
        <li key={alert.id} className={`rounded-lg px-3.5 py-2.5 ${tone[alert.level]}`}>
          <p className="text-sm font-bold">{alert.title}</p>
          <p className="text-sm mt-0.5 leading-snug opacity-90">{alert.detail}</p>
        </li>
      ))}
    </ul>
  );
}

/** Names for ids, so a table never shows a uuid. Missing rows read as a dash
 *  rather than blank, because a blank cell looks like a bug. */
export function useLookup(
  accounts: FinanceAccount[],
  categories: FinanceCategory[],
  payees: FinancePayee[],
) {
  const accountName = (id: string | null) =>
    id ? (accounts.find((a) => a.id === id)?.name ?? "—") : "—";
  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? "—") : "—";
  const payeeName = (id: string | null) =>
    id ? (payees.find((p) => p.id === id)?.name ?? "—") : "—";
  return { accountName, categoryName, payeeName };
}

export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year.slice(2)}`;
}
