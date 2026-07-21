// "Compras" - what was bought, from whom, and what went back.
//
// A return is bounded twice: by how much that purchase actually brought in, and
// by how much is still on the shelf. Goods already sold cannot be sent back, and
// the server refuses rather than letting stock go negative.

import { useState } from "react";
import { PackageOpen, RotateCcw, Truck } from "lucide-react";
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
import { Column, DataTable, SectionCard, StatTile } from "../reports/report-ui";
import {
  Purchase,
  PurchaseReturnLineInput,
  todayIso,
  useFinance,
} from "../../context/finance-context";
import { useAuth } from "../../context/auth-context";
import { FinancePanelProps, formatDay, useLookup } from "./finance-ui";

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
        <span className="text-gray-600 whitespace-nowrap">
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
            <p className="font-medium text-gray-900 truncate">
              {payeeName(row.supplierId)}
            </p>
            <p className="text-meta text-gray-500 truncate">
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
        <span className="text-gray-600">{accountName(row.accountId)}</span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortValue: (row) => row.totalUsd,
      render: (row) => (
        <div>
          <span className="font-semibold text-gray-900">{money(row.totalUsd)}</span>
          {row.paymentStatus === "pending" && (
            <p className="text-meta text-amber-700">por pagar</p>
          )}
          {row.freightUsd > 0 && (
            <p className="text-meta text-gray-500">
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
      width: "6rem",
      render: (row) =>
        isAdmin ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-meta"
            onClick={() => setReturning(row)}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Devolver
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Comprado"
          value={money(totalBought)}
          hint={`${purchases.length} compra(s) cargadas`}
          icon={<Truck className="w-4 h-4 text-gray-400" />}
        />
        <StatTile
          label="Por pagar a proveedores"
          value={money(owed)}
          tone={owed > 0 ? "warning" : "good"}
          icon={<PackageOpen className="w-4 h-4 text-gray-400" />}
        />
        <StatTile
          label="Devuelto"
          value={money(returned)}
          hint={`${purchaseReturns.length} devolución(es)`}
          icon={<RotateCcw className="w-4 h-4 text-gray-400" />}
        />
        <StatTile
          label="Compra promedio"
          value={money(purchases.length > 0 ? totalBought / purchases.length : 0)}
          icon={<Truck className="w-4 h-4 text-gray-400" />}
        />
      </div>

      <SectionCard
        title="Compras"
        subtitle="Cada una subió stock, actualizó costos y registró la salida de dinero"
        icon={<Truck className="w-4 h-4 text-primary" />}
        actions={
          isAdmin ? (
            <Button size="sm" className="text-xs" onClick={onNewPurchase}>
              Nueva compra
            </Button>
          ) : null
        }
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
    </div>
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
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Devolver al proveedor</DialogTitle>
          <DialogDescription>
            Baja el stock y deja el dinero como crédito con el proveedor, o como
            reembolso si te devolvieron efectivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {lines.map((line) => {
              const max = line.quantity - line.quantityReturned;
              return (
                <li key={line.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate">{line.name}</p>
                    <p className="text-meta text-gray-500">
                      {max} disponible(s) de {line.quantity} · costo{" "}
                      {line.landedUnitCostUsd.toFixed(2)} $
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
                    className="w-20 h-9 text-right"
                    aria-label={`Cantidad a devolver de ${line.name}`}
                  />
                </li>
              );
            })}
          </ul>

          <div className="grid grid-cols-2 gap-3">
            <div>
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
              <div>
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

          <div>
            <Label htmlFor="return-reason">Motivo</Label>
            <Input
              id="return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Llegó dañado, vencido, no era lo pedido…"
            />
          </div>

          <div>
            <Label htmlFor="return-notes">Notas</Label>
            <Textarea
              id="return-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
            <span className="text-gray-600">Total a devolver</span>
            <span className="font-semibold text-gray-900 tabular-nums">
              $ {total.toFixed(2)}
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
