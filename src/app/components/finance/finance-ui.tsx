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
import { SERIES, STATUS } from "../reports/report-ui";

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

/** Colour by what the movement does to the money, never by category identity -
 *  the palette has six safe slots and a shop can have thirty categories. */
export function kindColor(kind: EntryKind): string {
  if (kind === "income") return STATUS.good;
  if (kind === "expense") return STATUS.critical;
  return SERIES[0];
}

export function KindBadge({ kind }: { kind: EntryKind }) {
  const styles: Record<EntryKind, string> = {
    income: "bg-green-50 text-green-700",
    expense: "bg-red-50 text-red-700",
    transfer: "bg-blue-50 text-blue-700",
  };
  return (
    <span className={`text-meta px-1.5 py-0.5 rounded-full font-medium ${styles[kind]}`}>
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
      <span className="text-meta px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
        Pagado
      </span>
    );
  }
  if (status === "void") {
    return (
      <span className="text-meta px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
        Anulado
      </span>
    );
  }
  return (
    <span
      className={`text-meta px-1.5 py-0.5 rounded-full font-medium ${
        overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
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
      className={`flex items-baseline justify-between gap-3 py-1.5 ${
        emphasis ? "border-t border-gray-200 mt-1 pt-2" : ""
      }`}
    >
      <div className={`min-w-0 ${indent ? "pl-4" : ""}`}>
        <span
          className={`text-xs md:text-sm ${
            emphasis ? "font-semibold text-gray-900" : "text-gray-600"
          }`}
        >
          {label}
        </span>
        {hint && <p className="text-meta text-gray-500 leading-tight">{hint}</p>}
      </div>
      <span
        className={`tabular-nums whitespace-nowrap ${
          emphasis ? "text-sm md:text-base font-semibold" : "text-xs md:text-sm"
        } ${negative ? "text-red-700" : emphasis ? "text-gray-900" : "text-gray-700"}`}
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
      <p className="text-xs text-gray-500 py-4 text-center">
        Nada que atender. Las cuentas están al día.
      </p>
    );
  }
  const tone: Record<string, string> = {
    critical: "bg-red-50 border-red-200 text-red-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
    info: "bg-blue-50 border-blue-200 text-blue-900",
  };
  return (
    <ul className="space-y-2">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className={`border rounded-lg px-3 py-2 ${tone[alert.level]}`}
        >
          <p className="text-xs font-medium">{alert.title}</p>
          <p className="text-meta mt-0.5 leading-snug">{alert.detail}</p>
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
