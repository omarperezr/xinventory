// Recording a movement: an expense, other income, or a transfer between pots.
//
// The bolivar/dollar decision is deliberately explicit here. It defaults to
// whatever the selected pot holds - paying from the bolivar drawer is a bolivar
// payment - but the user can override it, because a shop does hand over dollars
// out of a bolivar account's owner's pocket often enough. Whichever way it goes,
// the context stamps the rate at write time, so the entry keeps its worth.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
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
import { MoneyInput } from "../money-input";
import {
  EntryInput,
  EntryKind,
  FinanceEntry,
  todayIso,
  useFinance,
} from "../../context/finance-context";
import { useAuth } from "../../context/auth-context";
import { KIND_LABEL } from "./finance-ui";

const NONE = "none";

interface EntryDialogProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  /** Editing an existing movement instead of creating one. */
  entry?: FinanceEntry;
  defaultKind?: EntryKind;
  /** Prefills a recurring occurrence, so posting a salary is one confirmation. */
  prefill?: Partial<EntryInput> & { title?: string };
}

export function EntryDialog({
  open,
  onOpenChange,
  entry,
  defaultKind = "expense",
  prefill,
}: EntryDialogProps) {
  const {
    accounts,
    categories,
    payees,
    allocations,
    addEntry,
    updateEntry,
  } = useFinance();
  const { currentUser } = useAuth();

  const [kind, setKind] = useState<EntryKind>(defaultKind);
  const [amountUsd, setAmountUsd] = useState(0);
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [accountId, setAccountId] = useState<string>(NONE);
  const [counterAccountId, setCounterAccountId] = useState<string>(NONE);
  const [categoryId, setCategoryId] = useState<string>(NONE);
  const [payeeId, setPayeeId] = useState<string>(NONE);
  const [allocationId, setAllocationId] = useState<string>(NONE);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [pending, setPending] = useState(false);
  const [dueOn, setDueOn] = useState("");
  const [paidIn, setPaidIn] = useState<"USD" | "BS">("USD");
  const [paidInTouched, setPaidInTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset whenever the dialog opens, so a previous draft never leaks into the
  // next movement.
  useEffect(() => {
    if (!open) return;
    const source = entry ?? prefill;
    setKind((entry?.kind ?? prefill?.kind ?? defaultKind) as EntryKind);
    setAmountUsd(source?.amountUsd ?? 0);
    setOccurredOn(source?.occurredOn ?? todayIso());
    setAccountId(source?.accountId ?? NONE);
    setCounterAccountId(entry?.counterAccountId ?? NONE);
    setCategoryId(source?.categoryId ?? NONE);
    setPayeeId(source?.payeeId ?? NONE);
    setAllocationId(source?.allocationId ?? NONE);
    setDescription(source?.description ?? prefill?.title ?? "");
    setNotes(source?.notes ?? "");
    setTags((entry?.tags ?? []).join(", "));
    setPending((entry?.status ?? "paid") === "pending");
    setDueOn(entry?.dueOn ?? "");
    setPaidIn(entry?.paidIn ?? "USD");
    setPaidInTouched(!!entry);
    setSaving(false);
  }, [open, entry, prefill, defaultKind]);

  // The pot decides the currency until someone says otherwise: money leaving
  // the bolivar drawer is bolivares.
  useEffect(() => {
    if (paidInTouched || accountId === NONE) return;
    const account = accounts.find((a) => a.id === accountId);
    if (account) setPaidIn(account.basis);
  }, [accountId, accounts, paidInTouched]);

  const visibleCategories = categories.filter(
    (c) => !c.archived && c.kind === (kind === "income" ? "income" : "expense"),
  );
  const activeAccounts = accounts.filter((a) => a.active);

  const canSave =
    amountUsd > 0 &&
    (kind === "transfer"
      ? accountId !== NONE && counterAccountId !== NONE && accountId !== counterAccountId
      : true);

  const handleSave = async () => {
    if (!currentUser) return;
    if (amountUsd <= 0) {
      toast.error("El monto debe ser mayor que cero");
      return;
    }
    if (kind === "transfer" && accountId === counterAccountId) {
      toast.error("Un traslado necesita dos cuentas distintas");
      return;
    }
    if (kind === "transfer" && (accountId === NONE || counterAccountId === NONE)) {
      toast.error("Elige la cuenta de origen y la de destino");
      return;
    }

    const input: EntryInput = {
      kind,
      status: pending ? "pending" : "paid",
      occurredOn,
      dueOn: pending ? dueOn || null : null,
      categoryId: kind === "transfer" ? null : nullable(categoryId),
      accountId: nullable(accountId),
      counterAccountId: kind === "transfer" ? nullable(counterAccountId) : null,
      payeeId: nullable(payeeId),
      allocationId: nullable(allocationId),
      amountUsd,
      paidIn,
      description: description.trim(),
      notes: notes.trim(),
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    setSaving(true);
    try {
      if (entry) await updateEntry(entry.id, input);
      else await addEntry(input, currentUser.name);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {entry ? "Editar movimiento" : "Nuevo movimiento"}
          </DialogTitle>
          <DialogDescription>
            Los montos se guardan en dólares. Si pagas en bolívares, se registra
            también la tasa del día para que el histórico no cambie después.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Kind */}
          <div role="tablist" className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(["expense", "income", "transfer"] as EntryKind[]).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={kind === option}
                onClick={() => setKind(option)}
                className={`flex-1 min-h-10 rounded-md text-sm font-medium transition-colors ${
                  kind === option
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {KIND_LABEL[option]}
              </button>
            ))}
          </div>

          <MoneyInput
            valueUsd={amountUsd}
            onCommitUsd={setAmountUsd}
            label="Monto"
            showPreview
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="finance-date">Fecha</Label>
              <Input
                id="finance-date"
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="finance-paidin">Pagado en</Label>
              <Select
                value={paidIn}
                onValueChange={(value) => {
                  setPaidIn(value === "BS" ? "BS" : "USD");
                  setPaidInTouched(true);
                }}
              >
                <SelectTrigger id="finance-paidin">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">Dólares</SelectItem>
                  <SelectItem value="BS">Bolívares</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="finance-account">
                {kind === "transfer" ? "Desde" : "Cuenta"}
              </Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="finance-account">
                  <SelectValue placeholder="Sin cuenta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin cuenta</SelectItem>
                  {activeAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {kind === "transfer" ? (
              <div>
                <Label htmlFor="finance-counter">Hacia</Label>
                <Select
                  value={counterAccountId}
                  onValueChange={setCounterAccountId}
                >
                  <SelectTrigger id="finance-counter">
                    <SelectValue placeholder="Cuenta destino" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Elegir…</SelectItem>
                    {activeAccounts
                      .filter((a) => a.id !== accountId)
                      .map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label htmlFor="finance-category">Categoría</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="finance-category">
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin categoría</SelectItem>
                    {visibleCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="finance-payee">
                {kind === "income" ? "De quién" : "A quién"}
              </Label>
              <Select value={payeeId} onValueChange={setPayeeId}>
                <SelectTrigger id="finance-payee">
                  <SelectValue placeholder="Sin contacto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin contacto</SelectItem>
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
            {kind === "transfer" && allocations.length > 0 && (
              <div>
                <Label htmlFor="finance-allocation">Fondo</Label>
                <Select value={allocationId} onValueChange={setAllocationId}>
                  <SelectTrigger id="finance-allocation">
                    <SelectValue placeholder="Ninguno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Ninguno</SelectItem>
                    {allocations
                      .filter((a) => a.active)
                      .map((allocation) => (
                        <SelectItem key={allocation.id} value={allocation.id}>
                          {allocation.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="finance-description">Descripción</Label>
            <Input
              id="finance-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                kind === "expense" ? "Gasolina camión, semana 3" : "Concepto"
              }
            />
          </div>

          {kind !== "transfer" && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={pending}
                  onChange={(e) => setPending(e.target.checked)}
                  className="w-4 h-4"
                />
                {kind === "income"
                  ? "Todavía no me han pagado"
                  : "Todavía no lo he pagado"}
              </label>
              <p className="text-meta text-gray-500 leading-snug">
                Queda como {kind === "income" ? "cuenta por cobrar" : "cuenta por pagar"}.
                No toca el saldo de ninguna cuenta hasta que se marque como pagado.
              </p>
              {pending && (
                <div>
                  <Label htmlFor="finance-due">Se vence</Label>
                  <Input
                    id="finance-due"
                    type="date"
                    value={dueOn}
                    onChange={(e) => setDueOn(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="finance-tags">
              Etiquetas <span className="text-gray-400">(separadas por coma)</span>
            </Label>
            <Input
              id="finance-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="AB123CD, reparto, navidad"
            />
            <p className="text-meta text-gray-500 mt-1">
              Sirven para cortar los gastos por vehículo, por ruta o por temporada
              sin crear categorías nuevas.
            </p>
          </div>

          <div>
            <Label htmlFor="finance-notes">Notas</Label>
            <Textarea
              id="finance-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={!canSave || saving}
              onClick={handleSave}
            >
              {entry ? "Guardar cambios" : "Registrar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function nullable(value: string): string | null {
  return value === NONE ? null : value;
}
