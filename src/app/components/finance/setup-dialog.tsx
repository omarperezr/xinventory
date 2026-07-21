// Configuración - the definitions the whole module points at.
//
// Everything in here is data the shop owns: rename it, archive it, delete it.
// No screen and no calculation looks any of it up by name, so renaming "Caja"
// to "Gaveta" changes a label and nothing else. The one thing that is NOT free
// is a category's `nature`, because the profit statement is built out of those
// buckets - the form says so where it matters.

import { useState } from "react";
import { Archive, Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Allocation,
  CategoryNature,
  Cadence,
  FinanceAccount,
  FinanceCategory,
  FinancePayee,
  PayeeKind,
  RecurringRule,
  todayIso,
  useFinance,
} from "../../context/finance-context";
import {
  ACCOUNT_KIND_LABEL,
  ALLOCATION_BASIS_LABEL,
  CADENCE_LABEL,
  NATURE_HINT,
  NATURE_LABEL,
  PAYEE_KIND_LABEL,
} from "./finance-ui";

type Tab = "accounts" | "categories" | "payees" | "recurring" | "allocations";

const TABS: { key: Tab; label: string }[] = [
  { key: "accounts", label: "Cuentas" },
  { key: "categories", label: "Categorías" },
  { key: "payees", label: "Contactos" },
  { key: "recurring", label: "Recurrentes" },
  { key: "allocations", label: "Fondos" },
];

export function SetupDialog({
  open,
  onOpenChange,
  initialTab = "accounts",
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuración de finanzas</DialogTitle>
          <DialogDescription>
            Esta lista es tuya. Lo que viene cargado es solo un punto de partida:
            renómbralo, archívalo o bórralo sin miedo.
          </DialogDescription>
        </DialogHeader>

        <div role="tablist" className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
          {TABS.map((option) => (
            <button
              key={option.key}
              role="tab"
              aria-selected={tab === option.key}
              onClick={() => setTab(option.key)}
              className={`flex-1 min-w-max min-h-10 px-3 rounded-md text-sm font-medium transition-colors ${
                tab === option.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "accounts" && <AccountsTab />}
          {tab === "categories" && <CategoriesTab />}
          {tab === "payees" && <PayeesTab />}
          {tab === "recurring" && <RecurringTab />}
          {tab === "allocations" && <AllocationsTab />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function RowActions({
  onArchive,
  onDelete,
  archived,
}: {
  onArchive: () => void;
  onDelete: () => void;
  archived: boolean;
}) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button
        type="button"
        onClick={onArchive}
        aria-label={archived ? "Reactivar" : "Archivar"}
        title={archived ? "Reactivar" : "Archivar"}
        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
      >
        {archived ? <Check className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Eliminar"
        title="Eliminar (solo si nada lo usa)"
        className="p-1.5 rounded-md hover:bg-red-50 text-red-500"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function FormShell({
  title,
  onCancel,
  onSave,
  saveLabel = "Guardar",
  children,
}: {
  title: string;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50/60">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cerrar formulario"
          className="p-1 rounded-md hover:bg-gray-200 text-gray-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" className="flex-1" onClick={onSave}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

function AccountsTab() {
  const { accounts, entries, saveAccount, deleteAccount } = useFinance();
  const [editing, setEditing] = useState<FinanceAccount | "new" | null>(null);

  const blank: FinanceAccount = {
    id: "",
    name: "",
    kind: "bank",
    basis: "BS",
    openingBalanceUsd: 0,
    openingBalanceBs: 0,
    active: true,
    sortOrder: accounts.length + 1,
    paymentMethods: [],
    notes: "",
  };

  const [draft, setDraft] = useState<FinanceAccount>(blank);
  const [methods, setMethods] = useState("");

  const startEdit = (account: FinanceAccount | "new") => {
    const value = account === "new" ? blank : account;
    setDraft(value);
    setMethods(value.paymentMethods.join(", "));
    setEditing(account);
  };

  // Changing the currency of a pot that already has movements would restate
  // every balance it ever had, so the field locks once it is in use.
  const hasMovements = (id: string) =>
    entries.some((e) => e.accountId === id || e.counterAccountId === id);

  const save = async () => {
    if (!draft.name.trim()) return;
    await saveAccount(
      {
        ...draft,
        paymentMethods: methods
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
      },
      editing === "new" ? undefined : draft.id,
    );
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {accounts.map((account) => (
          <li key={account.id} className="flex items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => startEdit(account)}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-sm font-medium text-gray-900 truncate">
                {account.name}
                {!account.active && (
                  <span className="text-meta text-gray-400 ml-2">archivada</span>
                )}
              </p>
              <p className="text-meta text-gray-500 truncate">
                {ACCOUNT_KIND_LABEL[account.kind]} ·{" "}
                {account.basis === "BS" ? "bolívares" : "dólares"}
                {account.paymentMethods.length > 0 &&
                  ` · cobra: ${account.paymentMethods.join(", ")}`}
              </p>
            </button>
            <RowActions
              archived={!account.active}
              onArchive={() =>
                saveAccount({ active: !account.active }, account.id)
              }
              onDelete={() => deleteAccount(account.id)}
            />
          </li>
        ))}
        {accounts.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-gray-500">
            No hay cuentas. Crea la primera para poder registrar movimientos.
          </li>
        )}
      </ul>

      {editing === null ? (
        <Button variant="outline" size="sm" onClick={() => startEdit("new")}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nueva cuenta
        </Button>
      ) : (
        <FormShell
          title={editing === "new" ? "Nueva cuenta" : "Editar cuenta"}
          onCancel={() => setEditing(null)}
          onSave={save}
        >
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="account-name">Nombre</Label>
              <Input
                id="account-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Banesco corriente"
              />
            </div>
            <div>
              <Label htmlFor="account-kind">Tipo</Label>
              <Select
                value={draft.kind}
                onValueChange={(value) =>
                  setDraft({ ...draft, kind: value as FinanceAccount["kind"] })
                }
              >
                <SelectTrigger id="account-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACCOUNT_KIND_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="account-basis">Moneda que guarda</Label>
              <Select
                value={draft.basis}
                onValueChange={(value) =>
                  setDraft({ ...draft, basis: value === "USD" ? "USD" : "BS" })
                }
                disabled={editing !== "new" && hasMovements(draft.id)}
              >
                <SelectTrigger id="account-basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BS">Bolívares</SelectItem>
                  <SelectItem value="USD">Dólares</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-meta text-gray-500 mt-1">
                {editing !== "new" && hasMovements(draft.id)
                  ? "No se puede cambiar: la cuenta ya tiene movimientos."
                  : "Las cuentas en bolívares muestran cuánto valor pierden con la tasa."}
              </p>
            </div>
            <div>
              <Label htmlFor="account-opening">
                Saldo inicial {draft.basis === "BS" ? "(Bs)" : "($)"}
              </Label>
              <Input
                id="account-opening"
                type="number"
                step="0.01"
                value={
                  draft.basis === "BS"
                    ? draft.openingBalanceBs
                    : draft.openingBalanceUsd
                }
                onChange={(e) => {
                  const value = Number(e.target.value) || 0;
                  setDraft(
                    draft.basis === "BS"
                      ? { ...draft, openingBalanceBs: value }
                      : { ...draft, openingBalanceUsd: value },
                  );
                }}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="account-methods">Métodos de cobro que caen aquí</Label>
            <Input
              id="account-methods"
              value={methods}
              onChange={(e) => setMethods(e.target.value)}
              placeholder="Efectivo, Pago móvil, Zelle"
            />
            <p className="text-meta text-gray-500 mt-1">
              Deben coincidir con los métodos que usan los vendedores al cobrar.
              Sin esto, el dinero de las ventas no se puede rastrear hasta un
              saldo.
            </p>
          </div>
        </FormShell>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function CategoriesTab() {
  const { categories, saveCategory, deleteCategory } = useFinance();
  const [editing, setEditing] = useState<FinanceCategory | "new" | null>(null);

  const blank: FinanceCategory = {
    id: "",
    name: "",
    kind: "expense",
    nature: "variable",
    monthlyBudgetUsd: null,
    color: null,
    archived: false,
  };
  const [draft, setDraft] = useState<FinanceCategory>(blank);

  const startEdit = (category: FinanceCategory | "new") => {
    setDraft(category === "new" ? blank : category);
    setEditing(category);
  };

  const save = async () => {
    if (!draft.name.trim()) return;
    await saveCategory(draft, editing === "new" ? undefined : draft.id);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => startEdit(category)}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-sm font-medium text-gray-900 truncate">
                {category.name}
                {category.archived && (
                  <span className="text-meta text-gray-400 ml-2">archivada</span>
                )}
              </p>
              <p className="text-meta text-gray-500">
                {category.kind === "income" ? "Ingreso" : "Gasto"} ·{" "}
                {NATURE_LABEL[category.nature]}
                {category.monthlyBudgetUsd != null &&
                  ` · presupuesto $${category.monthlyBudgetUsd.toFixed(0)}/mes`}
              </p>
            </button>
            <RowActions
              archived={category.archived}
              onArchive={() =>
                saveCategory({ archived: !category.archived }, category.id)
              }
              onDelete={() => deleteCategory(category.id)}
            />
          </li>
        ))}
      </ul>

      {editing === null ? (
        <Button variant="outline" size="sm" onClick={() => startEdit("new")}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nueva categoría
        </Button>
      ) : (
        <FormShell
          title={editing === "new" ? "Nueva categoría" : "Editar categoría"}
          onCancel={() => setEditing(null)}
          onSave={save}
        >
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="category-name">Nombre</Label>
              <Input
                id="category-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="GASOLINA"
              />
            </div>
            <div>
              <Label htmlFor="category-kind">Entra o sale</Label>
              <Select
                value={draft.kind}
                onValueChange={(value) =>
                  setDraft({ ...draft, kind: value === "income" ? "income" : "expense" })
                }
              >
                <SelectTrigger id="category-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Gasto</SelectItem>
                  <SelectItem value="income">Ingreso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="category-nature">Qué tipo de dinero es</Label>
            <Select
              value={draft.nature}
              onValueChange={(value) =>
                setDraft({ ...draft, nature: value as CategoryNature })
              }
            >
              <SelectTrigger id="category-nature">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(NATURE_LABEL) as CategoryNature[]).map((nature) => (
                  <SelectItem key={nature} value={nature}>
                    {NATURE_LABEL[nature]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-meta text-gray-500 mt-1">
              {NATURE_HINT[draft.nature]}
            </p>
            {editing !== "new" && (
              <p className="text-meta text-amber-700 mt-1">
                Cambiar esto también cambia los reportes de períodos pasados,
                porque el estado de resultados se arma con estos grupos.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="category-budget">Presupuesto mensual $ (opcional)</Label>
            <Input
              id="category-budget"
              type="number"
              min={0}
              step="0.01"
              value={draft.monthlyBudgetUsd ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  monthlyBudgetUsd:
                    e.target.value === "" ? null : Number(e.target.value) || 0,
                })
              }
              placeholder="Sin presupuesto"
            />
          </div>
        </FormShell>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payees
// ---------------------------------------------------------------------------

function PayeesTab() {
  const { payees, savePayee, deletePayee } = useFinance();
  const [editing, setEditing] = useState<FinancePayee | "new" | null>(null);

  const blank: FinancePayee = {
    id: "",
    name: "",
    kind: "supplier",
    phone: "",
    cedulaRif: "",
    notes: "",
    baseSalaryUsd: null,
    payCadence: null,
    active: true,
  };
  const [draft, setDraft] = useState<FinancePayee>(blank);

  const startEdit = (payee: FinancePayee | "new") => {
    setDraft(payee === "new" ? blank : payee);
    setEditing(payee);
  };

  const save = async () => {
    if (!draft.name.trim()) return;
    await savePayee(draft, editing === "new" ? undefined : draft.id);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
        {payees.map((payee) => (
          <li key={payee.id} className="flex items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => startEdit(payee)}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-sm font-medium text-gray-900 truncate">
                {payee.name}
                {!payee.active && (
                  <span className="text-meta text-gray-400 ml-2">inactivo</span>
                )}
              </p>
              <p className="text-meta text-gray-500 truncate">
                {PAYEE_KIND_LABEL[payee.kind]}
                {payee.baseSalaryUsd
                  ? ` · sueldo $${payee.baseSalaryUsd.toFixed(0)}`
                  : ""}
                {payee.phone ? ` · ${payee.phone}` : ""}
              </p>
            </button>
            <RowActions
              archived={!payee.active}
              onArchive={() => savePayee({ active: !payee.active }, payee.id)}
              onDelete={() => deletePayee(payee.id)}
            />
          </li>
        ))}
        {payees.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-gray-500">
            Sin contactos. Agrega proveedores y empleados para poder agrupar
            gastos y proponer la nómina.
          </li>
        )}
      </ul>

      {editing === null ? (
        <Button variant="outline" size="sm" onClick={() => startEdit("new")}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nuevo contacto
        </Button>
      ) : (
        <FormShell
          title={editing === "new" ? "Nuevo contacto" : "Editar contacto"}
          onCancel={() => setEditing(null)}
          onSave={save}
        >
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="payee-name">Nombre</Label>
              <Input
                id="payee-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="payee-kind">Qué es</Label>
              <Select
                value={draft.kind}
                onValueChange={(value) =>
                  setDraft({ ...draft, kind: value as PayeeKind })
                }
              >
                <SelectTrigger id="payee-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYEE_KIND_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="payee-phone">Teléfono</Label>
              <Input
                id="payee-phone"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="payee-rif">Cédula / RIF</Label>
              <Input
                id="payee-rif"
                value={draft.cedulaRif}
                onChange={(e) => setDraft({ ...draft, cedulaRif: e.target.value })}
                placeholder="J-12345678-9"
              />
            </div>
          </div>

          {draft.kind === "employee" && (
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="payee-salary">Sueldo base $</Label>
                <Input
                  id="payee-salary"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.baseSalaryUsd ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      baseSalaryUsd:
                        e.target.value === "" ? null : Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="payee-cadence">Cada cuánto se paga</Label>
                <Select
                  value={draft.payCadence ?? "none"}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      payCadence:
                        value === "none"
                          ? null
                          : (value as FinancePayee["payCadence"]),
                    })
                  }
                >
                  <SelectTrigger id="payee-cadence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin definir</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="biweekly">Quincenal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </FormShell>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recurring rules
// ---------------------------------------------------------------------------

function RecurringTab() {
  const {
    recurring,
    categories,
    accounts,
    payees,
    saveRecurring,
    deleteRecurring,
  } = useFinance();
  const [editing, setEditing] = useState<RecurringRule | "new" | null>(null);

  const blank: RecurringRule = {
    id: "",
    name: "",
    kind: "expense",
    categoryId: null,
    accountId: null,
    payeeId: null,
    amountUsd: 0,
    cadence: "monthly",
    anchorDate: todayIso(),
    endsOn: null,
    active: true,
    notes: "",
  };
  const [draft, setDraft] = useState<RecurringRule>(blank);

  const startEdit = (rule: RecurringRule | "new") => {
    setDraft(rule === "new" ? blank : rule);
    setEditing(rule);
  };

  const save = async () => {
    if (!draft.name.trim() || draft.amountUsd <= 0) return;
    await saveRecurring(draft, editing === "new" ? undefined : draft.id);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
        {recurring.map((rule) => (
          <li key={rule.id} className="flex items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => startEdit(rule)}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-sm font-medium text-gray-900 truncate">
                {rule.name}
                {!rule.active && (
                  <span className="text-meta text-gray-400 ml-2">pausada</span>
                )}
              </p>
              <p className="text-meta text-gray-500">
                ${rule.amountUsd.toFixed(2)} · {CADENCE_LABEL[rule.cadence]} · desde{" "}
                {rule.anchorDate}
              </p>
            </button>
            <RowActions
              archived={!rule.active}
              onArchive={() => saveRecurring({ active: !rule.active }, rule.id)}
              onDelete={() => deleteRecurring(rule.id)}
            />
          </li>
        ))}
        {recurring.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-gray-500">
            Sin reglas. Agrega el alquiler, los sueldos o el internet y el módulo
            te los recordará cada período.
          </li>
        )}
      </ul>

      {editing === null ? (
        <Button variant="outline" size="sm" onClick={() => startEdit("new")}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nueva regla
        </Button>
      ) : (
        <FormShell
          title={editing === "new" ? "Nueva regla" : "Editar regla"}
          onCancel={() => setEditing(null)}
          onSave={save}
        >
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rule-name">Nombre</Label>
              <Input
                id="rule-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Alquiler del local"
              />
            </div>
            <div>
              <Label htmlFor="rule-amount">Monto $</Label>
              <Input
                id="rule-amount"
                type="number"
                min={0}
                step="0.01"
                value={draft.amountUsd}
                onChange={(e) =>
                  setDraft({ ...draft, amountUsd: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rule-cadence">Cada cuánto</Label>
              <Select
                value={draft.cadence}
                onValueChange={(value) =>
                  setDraft({ ...draft, cadence: value as Cadence })
                }
              >
                <SelectTrigger id="rule-cadence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CADENCE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rule-anchor">Primera vez</Label>
              <Input
                id="rule-anchor"
                type="date"
                value={draft.anchorDate}
                onChange={(e) => setDraft({ ...draft, anchorDate: e.target.value })}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="rule-category">Categoría</Label>
              <Select
                value={draft.categoryId ?? "none"}
                onValueChange={(value) =>
                  setDraft({ ...draft, categoryId: value === "none" ? null : value })
                }
              >
                <SelectTrigger id="rule-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoría</SelectItem>
                  {categories
                    .filter((c) => !c.archived && c.kind === draft.kind)
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rule-account">Cuenta</Label>
              <Select
                value={draft.accountId ?? "none"}
                onValueChange={(value) =>
                  setDraft({ ...draft, accountId: value === "none" ? null : value })
                }
              >
                <SelectTrigger id="rule-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cuenta</SelectItem>
                  {accounts
                    .filter((a) => a.active)
                    .map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rule-payee">Contacto</Label>
              <Select
                value={draft.payeeId ?? "none"}
                onValueChange={(value) =>
                  setDraft({ ...draft, payeeId: value === "none" ? null : value })
                }
              >
                <SelectTrigger id="rule-payee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin contacto</SelectItem>
                  {payees
                    .filter((p) => p.active)
                    .map((payee) => (
                      <SelectItem key={payee.id} value={payee.id}>
                        {payee.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-meta text-gray-500">
            Nada se registra solo. Las ocurrencias vencidas aparecen en
            Obligaciones para que las confirmes con un clic.
          </p>
        </FormShell>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Allocations
// ---------------------------------------------------------------------------

function AllocationsTab() {
  const { allocations, accounts, saveAllocation, deleteAllocation } = useFinance();
  const [editing, setEditing] = useState<Allocation | "new" | null>(null);

  const blank: Allocation = {
    id: "",
    name: "",
    basis: "net_profit",
    percent: 10,
    accountId: null,
    targetUsd: null,
    active: true,
    notes: "",
  };
  const [draft, setDraft] = useState<Allocation>(blank);

  const startEdit = (allocation: Allocation | "new") => {
    setDraft(allocation === "new" ? blank : allocation);
    setEditing(allocation);
  };

  const save = async () => {
    if (!draft.name.trim() || draft.percent <= 0) return;
    await saveAllocation(draft, editing === "new" ? undefined : draft.id);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {allocations.map((allocation) => (
          <li key={allocation.id} className="flex items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => startEdit(allocation)}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-sm font-medium text-gray-900 truncate">
                {allocation.name}
              </p>
              <p className="text-meta text-gray-500">
                {allocation.percent}% de {ALLOCATION_BASIS_LABEL[allocation.basis]}
              </p>
            </button>
            <RowActions
              archived={!allocation.active}
              onArchive={() =>
                saveAllocation({ active: !allocation.active }, allocation.id)
              }
              onDelete={() => deleteAllocation(allocation.id)}
            />
          </li>
        ))}
        {allocations.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-gray-500">
            Sin fondos. Ejemplo: «Reposición de inventario, 20% de la utilidad
            neta».
          </li>
        )}
      </ul>

      {editing === null ? (
        <Button variant="outline" size="sm" onClick={() => startEdit("new")}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nuevo fondo
        </Button>
      ) : (
        <FormShell
          title={editing === "new" ? "Nuevo fondo" : "Editar fondo"}
          onCancel={() => setEditing(null)}
          onSave={save}
        >
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="alloc-name">Nombre</Label>
              <Input
                id="alloc-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Fondo de emergencia"
              />
            </div>
            <div>
              <Label htmlFor="alloc-percent">Porcentaje</Label>
              <Input
                id="alloc-percent"
                type="number"
                min={0.1}
                max={100}
                step="0.1"
                value={draft.percent}
                onChange={(e) =>
                  setDraft({ ...draft, percent: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="alloc-basis">Se calcula sobre</Label>
              <Select
                value={draft.basis}
                onValueChange={(value) =>
                  setDraft({ ...draft, basis: value as Allocation["basis"] })
                }
              >
                <SelectTrigger id="alloc-basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ALLOCATION_BASIS_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="alloc-account">Se guarda en</Label>
              <Select
                value={draft.accountId ?? "none"}
                onValueChange={(value) =>
                  setDraft({ ...draft, accountId: value === "none" ? null : value })
                }
              >
                <SelectTrigger id="alloc-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cuenta</SelectItem>
                  {accounts
                    .filter((a) => a.active)
                    .map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="alloc-target">Meta $ (opcional)</Label>
            <Input
              id="alloc-target"
              type="number"
              min={0}
              step="0.01"
              value={draft.targetUsd ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  targetUsd: e.target.value === "" ? null : Number(e.target.value) || 0,
                })
              }
            />
          </div>

          <p className="text-meta text-gray-500">
            La regla dice cuánto debería apartarse. Para que cuente como
            apartado, registra un traslado a la cuenta del fondo y márcalo con
            este nombre.
          </p>
        </FormShell>
      )}
    </div>
  );
}
