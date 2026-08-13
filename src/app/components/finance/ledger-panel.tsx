// "Movimientos" - the ledger itself. Every expense, income and transfer, with
// enough filtering to answer "what did we spend on X" without leaving the page.

import { useMemo, useState } from "react";
import { Pencil, Search, Trash2, Wallet } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Column, DataTable, SectionCard, Segmented } from "../reports/report-ui";
import {
  FinancePanelProps,
  KindBadge,
  StatusBadge,
  formatDay,
  useLookup,
} from "./finance-ui";
import {
  FinanceEntry,
  todayIso,
  useFinance,
} from "../../context/finance-context";
import { formatMoneyValue } from "../../context/app-context";
import { EntryDialog } from "./entry-dialog";

const ALL = "all";

export function LedgerPanel({
  report,
  money,
  accounts,
  categories,
  payees,
  isAdmin,
}: FinancePanelProps) {
  const { deleteEntry, settleEntry } = useFinance();
  const { accountName, categoryName, payeeName } = useLookup(
    accounts,
    categories,
    payees,
  );

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "income" | "expense" | "transfer">("all");
  const [categoryId, setCategoryId] = useState(ALL);
  const [accountId, setAccountId] = useState(ALL);
  const [editing, setEditing] = useState<FinanceEntry | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return report.rangeEntries.filter((entry) => {
      if (kind !== "all" && entry.kind !== kind) return false;
      if (categoryId !== ALL && entry.categoryId !== categoryId) return false;
      if (
        accountId !== ALL &&
        entry.accountId !== accountId &&
        entry.counterAccountId !== accountId
      ) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        entry.description,
        entry.notes,
        entry.tags.join(" "),
        categoryName(entry.categoryId),
        payeeName(entry.payeeId),
        accountName(entry.accountId),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.rangeEntries, query, kind, categoryId, accountId]);

  const total = rows.reduce(
    (sum, entry) =>
      entry.kind === "income"
        ? sum + entry.amountUsd
        : entry.kind === "expense"
          ? sum - entry.amountUsd
          : sum,
    0,
  );

  const columns: Column<FinanceEntry>[] = [
    {
      key: "date",
      header: "Fecha",
      width: "5.5rem",
      sortValue: (row) => row.occurredOn,
      render: (row) => (
        <span className="whitespace-nowrap text-muted-foreground" data-money>
          {formatDay(row.occurredOn)}
        </span>
      ),
    },
    {
      key: "description",
      header: "Concepto",
      sortValue: (row) => row.description,
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">
            {row.description || "—"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {row.kind === "transfer" ? (
              <span className="text-sm text-muted-foreground truncate">
                {accountName(row.accountId)} → {accountName(row.counterAccountId)}
              </span>
            ) : (
              <>
                {categoryName(row.categoryId) !== "—" && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-meta font-semibold text-secondary-foreground">
                    {categoryName(row.categoryId)}
                  </span>
                )}
                {payeeName(row.payeeId) !== "—" && (
                  <span className="text-sm text-muted-foreground truncate">
                    {payeeName(row.payeeId)}
                  </span>
                )}
              </>
            )}
            {row.tags.map((tag) => (
              <span key={tag} className="text-meta text-muted-foreground">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      ),
    },
    {
      key: "account",
      header: "Cuenta",
      secondary: true,
      sortValue: (row) => accountName(row.accountId),
      render: (row) => (
        <span className="text-muted-foreground">{accountName(row.accountId)}</span>
      ),
    },
    {
      key: "kind",
      header: "Tipo",
      secondary: true,
      render: (row) => (
        <div className="flex flex-col gap-1 items-start">
          <KindBadge kind={row.kind} />
          {row.status !== "paid" && (
            <StatusBadge
              status={row.status}
              overdue={!!row.dueOn && row.dueOn < todayIso()}
            />
          )}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Monto",
      align: "right",
      sortValue: (row) => row.amountUsd,
      render: (row) => (
        <div data-money>
          <span
            className={`font-bold ${
              row.kind === "income"
                ? "text-primary-soft-foreground"
                : row.kind === "expense"
                  ? "text-foreground"
                  : "text-muted-foreground"
            }`}
          >
            {row.kind === "expense" ? "−" : row.kind === "income" ? "+" : ""}
            {money(row.amountUsd)}
          </span>
          {/* The bolivar figure and its rate are what was actually paid that
              day: printed exactly as stored, never re-converted. */}
          {row.paidIn === "BS" && row.amountBs !== null && (
            <p className="text-meta text-muted-foreground">
              Bs {formatMoneyValue(row.amountBs)} @{" "}
              {row.rateUsed !== null ? formatMoneyValue(row.rateUsed) : "—"}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "6rem",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {row.status === "pending" && isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => settleEntry(row.id, row.accountId, todayIso())}
            >
              Marcar pagado
            </Button>
          )}
          {isAdmin && (
            <>
              <button
                type="button"
                aria-label={`Editar ${row.description || "movimiento"}`}
                onClick={() => {
                  setEditing(row);
                  setDialogOpen(true);
                }}
                className="tap-target inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Eliminar ${row.description || "movimiento"}`}
                onClick={() => deleteEntry(row.id)}
                className="tap-target inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <SectionCard
        title="Movimientos"
        subtitle={`${rows.length} de ${report.rangeEntries.length} en el período · neto ${money(total)}`}
        icon={<Wallet className="size-5 text-primary" aria-hidden="true" />}
        actions={
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "Todos" },
              { value: "expense", label: "Gastos" },
              { value: "income", label: "Ingresos" },
              { value: "transfer", label: "Traslados" },
            ]}
          />
        }
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[12rem]">
            <Search
              className="size-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar concepto, etiqueta, proveedor…"
              className="pl-11"
              aria-label="Buscar movimientos"
            />
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-[11rem]" aria-label="Filtrar por categoría">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las categorías</SelectItem>
              {categories
                .filter((c) => !c.archived)
                .map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-[10rem]" aria-label="Filtrar por cuenta">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las cuentas</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          initialSort="date"
          emptyLabel="No hay movimientos que coincidan"
          maxHeight="32rem"
          pageSize={40}
        />
      </SectionCard>

      <EntryDialog
        open={dialogOpen}
        onOpenChange={(value) => {
          setDialogOpen(value);
          if (!value) setEditing(undefined);
        }}
        entry={editing}
      />
    </div>
  );
}
