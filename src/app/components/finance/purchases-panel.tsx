// "Compras" - what was bought, from whom, and what went back.
//
// A return is bounded twice: by how much that purchase actually brought in, and
// by how much is still on the shelf. Goods already sold cannot be sent back, and
// the server refuses rather than letting stock go negative.

import { useState } from "react";
import {
  HandCoins,
  RotateCcw,
  Truck,
} from "lucide-react";
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
import { Column, DataTable, SectionCard, Kpi, KpiRow } from "../reports/report-ui";
import {
  Purchase,
  PurchaseReturnLineInput,
  todayIso,
  useFinance,
} from "../../context/finance-context";
import { useAuth } from "../../context/auth-context";
import { FinancePanelProps, formatDay, useLookup } from "./finance-ui";
import { formatMoneyValue } from "../../context/app-context";

export function PurchasesPanel({
  money,
  accounts,
  categories,
  payees,
  isAdmin,
  onNewPurchase,
}: FinancePanelProps & { onNewPurchase: () => void }) {
  const { purchases, purchaseLines, purchaseReturns } = useFinance();
  const { accountName, payeeName } = useLookup(accounts, categories, payees);
  const [returning, setReturning] = useState<Purchase | undefined>();
  const [settling, setSettling] = useState<Purchase | undefined>();

  const totalBought = purchases.reduce(
    (s, p) => s + p.goodsUsd + p.freightUsd,
    0,
  );
  const owed = purchases
    .filter((p) => p.paymentStatus === "pending")
    .reduce((s, p) => s + p.totalUsd, 0);
  const returned = purchaseReturns.reduce((s, r) => s + r.totalUsd, 0);

  const columns: Column<Purchase>[] = [
    {
      key: "date",
      header: "Fecha",
      width: "5.5rem",
      sortValue: (row) => row.occurredOn,
      render: (row) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {formatDay(row.occurredOn)}
        </span>
      ),
    },
    {
      key: "supplier",
      header: "Proveedor",
      sortValue: (row) => payeeName(row.supplierId),
      render: (row) => {
        const lines = purchaseLines.filter((l) => l.purchaseId === row.id);
        const returnedUnits = lines.reduce((s, l) => s + l.quantityReturned, 0);
        return (
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">
              {payeeName(row.supplierId)}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              {lines.length} línea(s)
              {row.invoiceNumber ? ` · factura ${row.invoiceNumber}` : ""}
              {returnedUnits > 0 ? ` · ${returnedUnits} devuelta(s)` : ""}
            </p>
          </div>
        );
      },
    },
    {
      key: "account",
      header: "Pagado desde",
      secondary: true,
      render: (row) => (
        <span className="text-muted-foreground">{accountName(row.accountId)}</span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortValue: (row) => row.totalUsd,
      render: (row) => (
        <div data-money>
          <span className="font-bold text-foreground">{money(row.totalUsd)}</span>
          {row.paymentStatus === "pending" && (
            <p className="text-meta font-semibold text-pending">por pagar</p>
          )}
          {row.freightUsd > 0 && (
            <p className="text-meta text-muted-foreground">
              incl. {money(row.freightUsd)} flete
            </p>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "11rem",
      render: (row) =>
        isAdmin ? (
          <div className="flex items-center justify-end gap-1">
            {row.paymentStatus === "pending" && (
              <Button
                size="sm"
                    onClick={() => setSettling(row)}
              >
                <HandCoins aria-hidden="true" />
                Pagar
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
                onClick={() => setReturning(row)}
            >
              <RotateCcw aria-hidden="true" />
              Devolver
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4 md:space-y-5">
      <KpiRow>
        <Kpi
          label="Comprado"
          value={money(totalBought)}
          hint={`${purchases.length} compra(s) cargadas`}
        />
        <Kpi
          label="Por pagar a proveedores"
          value={money(owed)}
          tone={owed > 0 ? "warning" : "good"}
        />
        <Kpi
          label="Devuelto"
          value={money(returned)}
          hint={`${purchaseReturns.length} devolución(es)`}
        />
        <Kpi
          label="Compra promedio"
          value={money(purchases.length > 0 ? totalBought / purchases.length : 0)}
        />
      </KpiRow>

      <SectionCard
        title="Compras"
        subtitle="Cada una subió stock, actualizó costos y registró la salida de dinero"
        actions={
          isAdmin ? (
            <Button size="sm" onClick={onNewPurchase}>
              Nueva compra
            </Button>
          ) : null
        }
        icon={<Truck className="size-5 text-primary" aria-hidden="true" />}
      >
        <DataTable
          columns={columns}
          rows={purchases}
          rowKey={(row) => row.id}
          initialSort="date"
          emptyLabel="Todavía no hay compras registradas"
          maxHeight="30rem"
          pageSize={20}
        />
      </SectionCard>

      {returning && (
        <ReturnDialog
          purchase={returning}
          open={!!returning}
          onOpenChange={(value) => !value && setReturning(undefined)}
        />
      )}

      {settling && (
        <SettleDialog
          purchase={settling}
          money={money}
          open={!!settling}
          onOpenChange={(value) => !value && setSettling(undefined)}
        />
      )}
    </div>
  );
}

// Paying a supplier that was left on credit. The purchase only recorded the
// debt; this is where the money actually leaves a pot, so the pot has to be
// named - the compra itself usually has none, because nothing was paid the day
// it arrived.
function SettleDialog({
  purchase,
  money,
  open,
  onOpenChange,
}: {
  purchase: Purchase;
  money: (usd: number) => string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { accounts, settlePurchase } = useFinance();
  const [accountId, setAccountId] = useState(purchase.accountId ?? "none");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (accountId === "none") {
      toast.error("Elige de qué cuenta salió el dinero");
      return;
    }
    setSaving(true);
    try {
      await settlePurchase(purchase, accountId, occurredOn);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar al proveedor</DialogTitle>
          <DialogDescription>
            Marca la compra como pagada y descuenta {money(purchase.totalUsd)} de
            la cuenta que elijas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="settle-account">Sale de</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="settle-account">
                <SelectValue placeholder="Elegir cuenta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Elegir…</SelectItem>
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

          <div className="space-y-2">
            <Label htmlFor="settle-date">Fecha del pago</Label>
            <Input
              id="settle-date"
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
            {purchase.paidIn === "BS" && (
              <p className="text-sm text-muted-foreground mt-1">
                Los bolívares se valoran a la tasa de hoy: lo que se debía en
                dólares no cambia, pero pagarlo tarde cuesta los bolívares de
                hoy.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button className="flex-1" disabled={saving} onClick={handleSave}>
              Registrar pago
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({
  purchase,
  open,
  onOpenChange,
}: {
  purchase: Purchase;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { purchaseLines, accounts, returnPurchase } = useFinance();
  const { currentUser } = useAuth();
  const lines = purchaseLines.filter((l) => l.purchaseId === purchase.id);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [settlement, setSettlement] = useState<"credit" | "cash">("credit");
  const [accountId, setAccountId] = useState("none");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const total = lines.reduce(
    (sum, line) => sum + (quantities[line.id] ?? 0) * line.landedUnitCostUsd,
    0,
  );

  const handleSave = async () => {
    if (!currentUser) return;
    const selected: PurchaseReturnLineInput[] = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([purchaseLineId, quantity]) => ({ purchaseLineId, quantity }));

    if (selected.length === 0) {
      toast.error("Indica qué cantidad devuelves");
      return;
    }
    if (settlement === "cash" && accountId === "none") {
      toast.error("Elige a qué cuenta entra el reembolso");
      return;
    }

    setSaving(true);
    try {
      await returnPurchase(
        purchase.id,
        selected,
        {
          settlement,
          accountId: settlement === "cash" ? accountId : null,
          reason: reason.trim(),
          notes: notes.trim(),
          occurredOn: todayIso(),
        },
        currentUser.name,
      );
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Devolver al proveedor</DialogTitle>
          <DialogDescription>
            Baja el stock y deja el dinero como crédito con el proveedor, o como
            reembolso si te devolvieron efectivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {lines.map((line) => {
              const max = line.quantity - line.quantityReturned;
              return (
                <li key={line.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-foreground truncate">
                      {line.name}
                    </p>
                    <p className="text-sm text-muted-foreground" data-money>
                      {max} disponible(s) de {line.quantity} · costo $
                      {formatMoneyValue(line.landedUnitCostUsd)}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    value={quantities[line.id] ?? 0}
                    disabled={max <= 0}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [line.id]: Math.max(
                          0,
                          Math.min(max, Math.round(Number(e.target.value) || 0)),
                        ),
                      }))
                    }
                    className="w-24 text-right"
                    data-money
                    aria-label={`Cantidad a devolver de ${line.name}`}
                  />
                </li>
              );
            })}
          </ul>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="return-settlement">Cómo se salda</Label>
              <Select
                value={settlement}
                onValueChange={(value) =>
                  setSettlement(value === "cash" ? "cash" : "credit")
                }
              >
                <SelectTrigger id="return-settlement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Crédito con el proveedor</SelectItem>
                  <SelectItem value="cash">Reembolso en efectivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {settlement === "cash" && (
              <div className="space-y-2">
                <Label htmlFor="return-account">Entra a</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="return-account">
                    <SelectValue placeholder="Elegir cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Elegir…</SelectItem>
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
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="return-reason">Motivo</Label>
            <Input
              id="return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Llegó dañado, vencido, no era lo pedido…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="return-notes">Notas</Label>
            <Textarea
              id="return-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div
            className="flex items-center justify-between rounded-xl bg-canvas px-4 py-3"
            data-money
          >
            <span className="text-base text-muted-foreground">Total a devolver</span>
            <span className="text-xl font-bold text-foreground">
              {`$ ${formatMoneyValue(total)}`}
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button className="flex-1" disabled={saving || total <= 0} onClick={handleSave}>
              Registrar devolución
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
