import { useCallback, useEffect, useMemo, useRef, useState, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { InventoryForm } from "./inventory-form";
import { InventoryTable } from "./inventory-table";
import {
  useApp,
  InventoryItem,
  ItemHistoryRecord,
  RateKey,
  foldText,
} from "../context/app-context";
import { useAuth } from "../context/auth-context";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { toast } from "sonner";
import {
  DollarSign,
  Euro,
  Coins,
  History,
  ArrowRight,
  Search,
  Check,
  RefreshCw,
  Trash2,
  X,
  Plus,
  FileSpreadsheet,
} from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { cn } from "./ui/utils";
import { InventorySortControl } from "./inventory-sort-control";
import { sortInventory, SortOption } from "../utils/sortInventory";
import { parseItemsFromExcel } from "../utils/excelImport";

// Stock moves for several reasons now, and the timeline has to name each one.
// "Ajuste" and "Compra" both raise stock, but only one of them cost money.
const HISTORY_LABEL: Record<ItemHistoryRecord["action"], string> = {
  create: "Creación",
  update: "Modificación",
  delete: "Eliminación",
  sale: "Venta",
  return: "Devolución de cliente",
  purchase: "Compra a proveedor",
  adjust: "Ajuste de inventario",
  purchase_return: "Devolución a proveedor",
};

// Green when stock came in, red when it went out, neutral when only the record
// changed. The chip carries the same reading as the dot, so the meaning
// survives a colourblind or sunlit screen.
const HISTORY_TONE: Record<
  ItemHistoryRecord["action"],
  { chip: string; dot: string }
> = {
  create: {
    chip: "bg-primary-soft text-primary-soft-foreground",
    dot: "bg-primary",
  },
  update: { chip: "bg-secondary text-secondary-foreground", dot: "bg-border-strong" },
  delete: {
    chip: "bg-destructive-soft text-destructive-soft-foreground",
    dot: "bg-destructive",
  },
  sale: {
    chip: "bg-destructive-soft text-destructive-soft-foreground",
    dot: "bg-destructive",
  },
  return: {
    chip: "bg-primary-soft text-primary-soft-foreground",
    dot: "bg-primary",
  },
  purchase: {
    chip: "bg-primary-soft text-primary-soft-foreground",
    dot: "bg-primary",
  },
  adjust: { chip: "bg-secondary text-secondary-foreground", dot: "bg-border-strong" },
  purchase_return: {
    chip: "bg-destructive-soft text-destructive-soft-foreground",
    dot: "bg-destructive",
  },
};

const NEUTRAL_TONE = {
  chip: "bg-secondary text-secondary-foreground",
  dot: "bg-border-strong",
};

interface AdminViewProps {
  editingItem?: InventoryItem;
  onEditItem: (item: InventoryItem) => void;
  onCancelEdit: () => void;
}

export function AdminView({
  editingItem,
  onEditItem,
  onCancelEdit,
}: AdminViewProps) {
  const {
    items,
    addItem,
    updateItem,
    deleteItem,
    deleteItems,
    importItems,
    loadItemHistory,
    rates,
    honestRateKey,
    updateRates,
    syncRatesFromProviders,
    syncingRates,
    formatPrice,
  } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  // History is fetched per item when this dialog opens, so the item list does
  // not have to carry the whole item_history table.
  const [historyRecords, setHistoryRecords] = useState<ItemHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!historyItem) {
      setHistoryRecords([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    loadItemHistory(historyItem.id)
      .then((records) => {
        if (!cancelled) setHistoryRecords(records);
      })
      .catch((err) => {
        console.error("No se pudo cargar el historial", err);
        if (!cancelled) setHistoryRecords([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyItem, loadItemHistory]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption[]>([]);

  // Bulk-delete selection mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Add/Edit product dialog
  const [formOpen, setFormOpen] = useState(false);
  useEffect(() => {
    if (editingItem) setFormOpen(true);
  }, [editingItem]);

  const handleFormOpenChange = (open: boolean) => {
    setFormOpen(open);
    if (!open && editingItem) onCancelEdit();
  };

  // Excel import
  const [importing, setImporting] = useState(false);

  const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    const toastId = toast.loading("Leyendo archivo Excel...");
    try {
      const { items: rows, skipped } = await parseItemsFromExcel(file);
      if (rows.length === 0) {
        toast.error("No se encontraron productos válidos en el archivo", { id: toastId });
        return;
      }
      toast.loading(`Importando ${rows.length} producto(s)...`, { id: toastId });
      const result = await importItems(
        rows.map((r) => ({
          name: r.name,
          barcode: r.barcode,
          buyingPrice: r.buyingPrice,
          sellingPrice: r.sellingPrice,
          quantity: r.quantity,
          unit: r.unit,
          includesTaxes: r.includesTaxes,
          discount: r.discount,
          type: r.type,
          brand: r.brand,
          notes: r.notes,
        })),
        currentUser?.name || "Admin",
      );
      // Every row the sheet contained is accounted for: silently dropping the
      // ones we could not read is how an admin ends up believing the inventory
      // is complete when a tenth of it never arrived.
      const notes = [
        result.duplicates > 0
          ? `${result.duplicates} repetida(s) por código de barras`
          : "",
        skipped > 0 ? `${skipped} omitida(s) por datos ilegibles` : "",
      ].filter(Boolean);
      toast.success(
        `Importación completa: ${result.created} creado(s), ${result.updated} actualizado(s)` +
          (notes.length ? `. ${notes.join(", ")}` : ""),
        { id: toastId, duration: notes.length ? 8000 : undefined },
      );
    } catch (err) {
      console.error(err);
      toast.error("Error al importar el archivo Excel", { id: toastId });
    } finally {
      setImporting(false);
    }
  };

  // Editable rate drafts - only committed to Supabase when "Guardar Tasas" is
  // clicked, so typing/clearing a field doesn't fire a request per keystroke.
  const [usdInput, setUsdInput] = useState("");
  const [eurInput, setEurInput] = useState("");
  const [usdtInput, setUsdtInput] = useState("");
  const [honestInput, setHonestInput] = useState<RateKey>(honestRateKey);
  // Set while the admin is editing, so a background refresh (another admin
  // saving rates) can't wipe their unsaved drafts mid-edit.
  const editingRates = useRef(false);

  useEffect(() => {
    if (editingRates.current) return;
    setUsdInput(rates.USD.toString());
    setEurInput(rates.EUR.toString());
    setUsdtInput(rates.USDT.toString());
    setHonestInput(honestRateKey);
  }, [rates.USD, rates.EUR, rates.USDT, honestRateKey]);

  // Pulls today's rates from the providers and saves them straight away - the
  // fetched numbers are the source of truth, so there is nothing to review
  // before committing. Dropping the edit flag lets the effect above refill the
  // inputs from the rates that just landed.
  const handleFetchRates = async () => {
    editingRates.current = false;
    await syncRatesFromProviders();
  };

  const handleSaveRates = () => {
    const usd = parseFloat(usdInput);
    const eur = parseFloat(eurInput);
    const usdt = parseFloat(usdtInput);
    if (isNaN(usd) || usd <= 0 || isNaN(eur) || eur <= 0 || isNaN(usdt) || usdt <= 0) {
      toast.error("Ingrese tasas válidas mayores a cero");
      return;
    }
    editingRates.current = false;
    updateRates(usd, eur, usdt, honestInput);
  };

  const ratesChanged =
    usdInput !== rates.USD.toString() ||
    eurInput !== rates.EUR.toString() ||
    usdtInput !== rates.USDT.toString() ||
    honestInput !== honestRateKey;

  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    if (!isAdmin) navigate("/search", { replace: true });
  }, [isAdmin, navigate]);

  const handleAddItem = (
    item: Omit<InventoryItem, "id" | "history">,
    notes?: string,
  ) => {
    return addItem(item, currentUser?.name || "Desconocido");
  };

  const handleUpdateItem = async (
    item: Omit<InventoryItem, "id" | "history">,
    notes?: string,
    adjustmentReason?: string,
  ) => {
    if (editingItem) {
      await updateItem(
        { ...item, id: editingItem.id, history: editingItem.history },
        currentUser?.name || "Desconocido",
        notes,
        false,
        adjustmentReason,
      );
      onCancelEdit();
    }
  };

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (!searchTerm.trim()) return true;
        const term = foldText(searchTerm);
        if (filterBy === "name") return foldText(item.name).includes(term);
        if (filterBy === "barcode")
          return foldText(item.barcode).includes(term);
        // 'all'
        return (
          foldText(item.name).includes(term) ||
          foldText(item.barcode).includes(term)
        );
      }),
    [items, searchTerm, filterBy],
  );

  const visibleItems = useMemo(
    () => sortInventory(filteredItems, sortBy),
    [filteredItems, sortBy],
  );

  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((i) => selectedIds.has(i.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleItems.forEach((i) => next.delete(i.id));
        return next;
      }
      const next = new Set(prev);
      visibleItems.forEach((i) => next.add(i.id));
      return next;
    });
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await deleteItems(Array.from(selectedIds), currentUser?.name || "Admin");
      setSelectedIds(new Set());
      setSelectMode(false);
    } finally {
      setBulkDeleting(false);
      setConfirmBulkDelete(false);
    }
  };

  const handleDeleteItem = useCallback(
    (id: string) => deleteItem(id, currentUser?.name || "Admin"),
    [deleteItem, currentUser],
  );

  const inventoryCost = useMemo(
    () => items.reduce((sum, i) => sum + i.buyingPrice * i.quantity, 0),
    [items],
  );
  const inventoryValue = useMemo(
    () => items.reduce((sum, i) => sum + i.sellingPrice * i.quantity, 0),
    [items],
  );
  const lowStockItems = useMemo(
    () => items.filter((i) => i.quantity > 0 && i.quantity < 10),
    [items],
  );
  const outOfStockItems = useMemo(
    () => items.filter((i) => i.quantity === 0),
    [items],
  );
  const avgMargin = useMemo(
    () =>
      items.length > 0
        ? items.reduce(
            (sum, i) =>
              sum +
              (i.sellingPrice > 0
                ? ((i.sellingPrice - i.buyingPrice) / i.sellingPrice) * 100
                : 0),
            0,
          ) / items.length
        : 0,
    [items],
  );

  if (!currentUser || currentUser.role !== "admin") return null;

  // Render nothing for non-admins. The redirect above runs after paint, so
  // without this gate a seller sees costs and margins flash on screen first.
  if (!isAdmin) return null;

  return (
    <div className="space-y-8">
      {/* One card, four figures: the numbers are the subject, not the boxes. */}
      <div className="bg-white rounded-xl border border-border shadow-card overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4">
          {[
            {
              label: "Costo de inventario",
              value: formatPrice(inventoryCost),
            },
            {
              label: "Valor potencial de venta",
              value: formatPrice(inventoryValue),
              tone: "text-primary",
            },
            {
              label: "Bajo / agotado",
              value: (
                <>
                  {lowStockItems.length}
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-destructive">
                    {outOfStockItems.length}
                  </span>
                </>
              ),
            },
            {
              label: "Margen promedio",
              value: `${avgMargin.toFixed(0)}%`,
            },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className={cn(
                "p-4 md:p-6",
                i % 2 === 1 && "border-l border-border",
                i >= 2 && "border-t border-border md:border-t-0",
                i > 0 && "md:border-l md:border-border",
              )}
            >
              <p className="text-sm text-muted-foreground leading-snug">
                {stat.label}
              </p>
              <p
                data-money
                className={cn(
                  "mt-1 text-2xl font-bold truncate",
                  stat.tone || "text-foreground",
                )}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Exchange rates. One row per rate; one of them is the honest one, and
          every cost, sale and payment the app records converts at that one. */}
      <div className="bg-white rounded-xl border border-border shadow-card p-4 md:p-6 space-y-5">
        <div>
          <h3 className="text-lg font-bold text-foreground">
            Tasas de cambio de hoy
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Bolívares por cada unidad de moneda.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-base font-bold text-foreground">
            Tasa honesta del bolívar
          </legend>
          <p className="text-sm text-muted-foreground">
            Define el valor real de los bolívares. Se usa para registrar
            compras, ventas y pagos. Las demás tasas quedan solo como
            referencia visual.
          </p>
          {(
            [
              {
                key: "USD",
                id: "rate-usd",
                label: "USD (BCV)",
                hint: "Bs por dólar",
                icon: DollarSign,
                value: usdInput,
                set: setUsdInput,
              },
              {
                key: "EUR",
                id: "rate-eur",
                label: "EUR (BCV)",
                hint: "Bs por euro",
                icon: Euro,
                value: eurInput,
                set: setEurInput,
              },
              {
                key: "USDT",
                id: "rate-usdt",
                label: "USDT (Binance)",
                hint: "Bs por USDT — Binance P2P (liquidación)",
                icon: Coins,
                value: usdtInput,
                set: setUsdtInput,
              },
            ] as {
              key: RateKey;
              id: string;
              label: string;
              hint: string;
              icon: typeof DollarSign;
              value: string;
              set: (v: string) => void;
            }[]
          ).map(({ key, id, label, hint, icon: Icon, value, set }) => {
            const isHonest = honestInput === key;
            return (
              <div
                key={key}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-xl border p-3 md:p-4 transition-colors",
                  isHonest ? "border-primary bg-primary-soft/30" : "border-border",
                )}
              >
                <div className="min-w-[9rem] flex-1">
                  <Label htmlFor={id}>
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    {label}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">{hint}</p>
                </div>
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={value}
                  onChange={(e) => {
                    editingRates.current = true;
                    set(e.target.value);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveRates()}
                  placeholder="0.00"
                  className="w-36 font-bold"
                  data-money
                />
                <button
                  type="button"
                  role="radio"
                  aria-checked={isHonest}
                  aria-label={`Usar ${label} como tasa honesta`}
                  onClick={() => {
                    editingRates.current = true;
                    setHonestInput(key);
                  }}
                  className={cn(
                    "inline-flex h-12 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors",
                    isHonest
                      ? "border-primary bg-primary-soft text-primary-soft-foreground"
                      : "border-border-strong bg-white text-muted-foreground hover:bg-secondary",
                  )}
                >
                  <Check
                    className={cn("size-4", !isHonest && "opacity-0")}
                    aria-hidden="true"
                  />
                  Tasa honesta
                </button>
              </div>
            );
          })}
        </fieldset>

        <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleFetchRates}
            disabled={syncingRates}
          >
            <RefreshCw
              className={syncingRates ? "animate-spin" : undefined}
              aria-hidden="true"
            />
            Actualizar tasas
          </Button>
          <Button
            type="button"
            onClick={handleSaveRates}
            disabled={!ratesChanged}
            className="px-6"
          >
            <Check aria-hidden="true" />
            Guardar tasas
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
        <label className="contents">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
            disabled={importing}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            disabled={importing}
            asChild
          >
            <span>
              <FileSpreadsheet aria-hidden="true" />
              {importing ? "Importando…" : "Importar Excel"}
            </span>
          </Button>
        </label>
        <Button
          type="button"
          onClick={() => setFormOpen(true)}
          className="px-6"
        >
          <Plus aria-hidden="true" />
          Agregar producto
        </Button>
      </div>

      <Dialog open={formOpen} onOpenChange={handleFormOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Editar producto" : "Agregar producto"}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Actualiza los datos del producto seleccionado."
                : "Completa la información para agregarlo al inventario."}
            </DialogDescription>
          </DialogHeader>
          <InventoryForm
            onSubmit={async (item, notes, adjustmentReason) => {
              if (editingItem) {
                // The form makes the seller pick a reason before it will
                // submit a stock change; dropping it here left every write-off,
                // theft and recount indistinguishable in the item history.
                await handleUpdateItem(item, notes, adjustmentReason);
              } else {
                await handleAddItem(item, notes);
              }
              setFormOpen(false);
            }}
            editItem={editingItem}
            onCancelEdit={() => handleFormOpenChange(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Admin inventory search bar */}
      <div className="bg-white rounded-xl border border-border shadow-card p-4 md:p-6">
        <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center">
          <h3 className="text-base font-bold text-foreground whitespace-nowrap">
            Inventario
            <span
              className="ml-2 text-sm font-normal text-muted-foreground"
              data-money
            >
              ({visibleItems.length} de {items.length} productos)
            </span>
          </h3>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:ml-auto lg:max-w-3xl">
            <div className="relative flex-1">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label="Buscar en inventario"
                placeholder="Buscar en inventario…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11"
              />
            </div>
            <Select value={filterBy} onValueChange={setFilterBy}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Filtrar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo</SelectItem>
                <SelectItem value="name">Nombre</SelectItem>
                <SelectItem value="barcode">Código</SelectItem>
              </SelectContent>
            </Select>
            <InventorySortControl
              value={sortBy}
              onChange={setSortBy}
              className="sm:w-[180px]"
            />
            <Button
              type="button"
              variant="outline"
              onClick={toggleSelectMode}
              className="whitespace-nowrap"
            >
              {selectMode ? (
                <>
                  <X aria-hidden="true" />
                  Cancelar
                </>
              ) : (
                <>
                  <Trash2 aria-hidden="true" />
                  Eliminar varios
                </>
              )}
            </Button>
          </div>
        </div>

        {selectMode && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
            <label className="flex items-center gap-2.5 text-base font-medium text-foreground cursor-pointer">
              <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} />
              Seleccionar todos
            </label>
            <Button
              type="button"
              variant="destructive"
              disabled={selectedIds.size === 0}
              onClick={() => setConfirmBulkDelete(true)}
              className="disabled:opacity-50"
            >
              <Trash2 aria-hidden="true" />
              Eliminar ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      <InventoryTable
        items={visibleItems}
        onEdit={onEditItem}
        onDelete={handleDeleteItem}
        showBuyingPrice
        onViewHistory={setHistoryItem}
        selectMode={selectMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelectItem}
      />

      {/* Bulk Delete Confirm */}
      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {selectedIds.size} producto(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Los productos seleccionados se
              eliminarán permanentemente del inventario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {bulkDeleting ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* History Dialog */}
      <Dialog
        open={!!historyItem}
        onOpenChange={(open) => !open && setHistoryItem(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5 text-primary" aria-hidden="true" />
              Historial de movimientos
            </DialogTitle>
            <DialogDescription>
              Historial completo de{" "}
              <span className="font-bold text-foreground">
                {historyItem?.name}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="relative border-l border-border ml-3 space-y-7 mt-2">
            {historyRecords
              .slice()
              .reverse()
              .map((record, index) => {
                const tone = HISTORY_TONE[record.action] ?? NEUTRAL_TONE;
                return (
                  <div key={index} className="relative pl-6">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute -left-1.5 top-1.5 size-3 rounded-full border-2 border-white",
                        tone.dot,
                      )}
                    />

                    <div className="flex flex-col gap-1.5">
                      <span className="text-meta text-muted-foreground" data-money>
                        {format(new Date(record.date), "PPP p")}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold",
                            tone.chip,
                          )}
                        >
                          {HISTORY_LABEL[record.action] ?? record.action}
                        </span>
                        {record.reason && (
                          <span className="text-sm text-muted-foreground">
                            {record.reason}
                          </span>
                        )}
                      </span>
                      <p className="text-sm text-muted-foreground bg-canvas p-3 rounded-lg border border-border">
                        {record.details}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-sm mt-0.5">
                        <span className="text-muted-foreground">
                          Usuario:{" "}
                          <span className="font-semibold text-foreground">
                            {record.user}
                          </span>
                        </span>
                        {record.previousStock !== undefined &&
                          record.newStock !== undefined && (
                            <span
                              data-money
                              className="inline-flex items-center gap-1 font-semibold text-secondary-foreground bg-secondary px-2.5 py-1 rounded-full"
                            >
                              Stock: {record.previousStock}
                              <ArrowRight className="size-4" aria-hidden="true" />
                              {record.newStock}
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}
            {historyLoading && (
              <p className="text-sm text-muted-foreground pl-6">
                Cargando historial…
              </p>
            )}
            {!historyLoading && historyRecords.length === 0 && (
              <p className="text-sm text-muted-foreground pl-6">
                No hay historial registrado.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
