import { useCallback, useEffect, useMemo, useRef, useState, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { InventoryForm } from "./inventory-form";
import { InventoryTable } from "./inventory-table";
import {
  useApp,
  InventoryItem,
  ItemHistoryRecord,
  RateKey,
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
  Package,
  AlertTriangle,
  Wallet,
  TrendingUp,
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
import { Card, CardContent } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { InventorySortControl } from "./inventory-sort-control";
import { sortInventory, SortOption } from "../utils/sortInventory";
import { parseItemsFromExcel } from "../utils/excelImport";

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
      const rows = await parseItemsFromExcel(file);
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
      toast.success(
        `Importación completa: ${result.created} creado(s), ${result.updated} actualizado(s)`,
        { id: toastId },
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
  ) => {
    if (editingItem) {
      await updateItem(
        { ...item, id: editingItem.id, history: editingItem.history },
        currentUser?.name || "Desconocido",
        notes,
      );
      onCancelEdit();
    }
  };

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        if (filterBy === "name") return item.name.toLowerCase().includes(term);
        if (filterBy === "barcode")
          return item.barcode.toLowerCase().includes(term);
        // 'all'
        return (
          item.name.toLowerCase().includes(term) ||
          item.barcode.toLowerCase().includes(term)
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
      {/* Inventory Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground leading-tight">
                Costo de Inventario
              </p>
              <Wallet className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            </div>
            <p className="text-base md:text-xl font-bold text-gray-900 truncate">
              {formatPrice(inventoryCost)}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground leading-tight">
                Valor Potencial de Venta
              </p>
              <TrendingUp className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            </div>
            <p className="text-base md:text-xl font-bold text-green-600 truncate">
              {formatPrice(inventoryValue)}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground leading-tight">
                Bajo / Sin Stock
              </p>
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
            </div>
            <p className="text-base md:text-xl font-bold text-gray-900">
              {lowStockItems.length}
              <span className="text-red-500"> / {outOfStockItems.length}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground leading-tight">
                Margen Promedio
              </p>
              <Package className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            </div>
            <p className="text-base md:text-xl font-bold text-gray-900">
              {avgMargin.toFixed(0)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Exchange Rates Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Tasas de Cambio (Hoy)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="rate-usd">USD (BCV) — Bs/USD</Label>
            <div className="relative">
              <DollarSign
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
              />
              <Input
                id="rate-usd"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={usdInput}
                onChange={(e) => {
                  editingRates.current = true;
                  setUsdInput(e.target.value);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSaveRates()}
                placeholder="0.00"
                className="pl-9 h-11"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rate-eur">EUR (BCV) — Bs/EUR</Label>
            <div className="relative">
              <Euro
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
              />
              <Input
                id="rate-eur"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={eurInput}
                onChange={(e) => {
                  editingRates.current = true;
                  setEurInput(e.target.value);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSaveRates()}
                placeholder="0.00"
                className="pl-9 h-11"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rate-usdt">USDT (Binance) — Bs/USDT</Label>
            <div className="relative">
              <Coins
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
              />
              <Input
                id="rate-usdt"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={usdtInput}
                onChange={(e) => {
                  editingRates.current = true;
                  setUsdtInput(e.target.value);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSaveRates()}
                placeholder="0.00"
                className="pl-9 h-11"
              />
            </div>
            <p className="text-[11px] text-gray-500 leading-tight">
              Binance P2P (liquidación)
            </p>
          </div>
        </div>

        {/* This is the rate that defines what a bolivar is really worth.
            Every cost, sale, and payment the app records converts at this rate. */}
        <fieldset className="mt-6 border-t border-gray-100 pt-4">
          <legend className="text-sm font-medium text-gray-900">
            Tasa honesta del bolívar
          </legend>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            Define el valor real de los bolívares. Se usa para registrar
            compras, ventas y pagos. Las demás tasas quedan solo como
            referencia visual.
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "USDT", label: "USDT (Binance)" },
                { key: "USD", label: "USD (BCV)" },
                { key: "EUR", label: "EUR (BCV)" },
              ] as { key: RateKey; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={honestInput === key}
                onClick={() => {
                  editingRates.current = true;
                  setHonestInput(key);
                }}
                className={`h-11 px-4 rounded-lg border text-sm font-medium transition-colors ${
                  honestInput === key
                    ? "border-primary bg-primary text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-3 mt-4">
          <Button
            type="button"
            variant="ghost"
            className="bg-input-background hover:bg-input-background hover:brightness-100 border border-input text-foreground"
            onClick={handleFetchRates}
            disabled={syncingRates}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${syncingRates ? "animate-spin" : ""}`}
            />
            Actualizar Tasas
          </Button>
          <Button
            type="button"
            onClick={handleSaveRates}
            disabled={!ratesChanged}
            className="px-6"
          >
            <Check className="w-4 h-4 mr-2" />
            Guardar Tasas
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
            disabled={importing}
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            className="bg-input-background hover:bg-input-background hover:brightness-100 border border-input text-foreground"
            disabled={importing}
            asChild
          >
            <span>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              {importing ? "Importando..." : "Importar Excel"}
            </span>
          </Button>
        </label>
        <Button
          type="button"
          onClick={() => setFormOpen(true)}
          className="px-6"
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Producto
        </Button>
      </div>

      <Dialog open={formOpen} onOpenChange={handleFormOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Editar Producto" : "Agregar Nuevo Producto"}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Actualiza los datos del producto seleccionado."
                : "Completa la información para agregarlo al inventario."}
            </DialogDescription>
          </DialogHeader>
          <InventoryForm
            onSubmit={async (item, notes) => {
              if (editingItem) {
                await handleUpdateItem(item, notes);
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

      {/* Admin Inventory Search Bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <h3 className="text-base font-medium text-gray-900 whitespace-nowrap">
            Inventario
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({visibleItems.length} de {items.length} productos)
            </span>
          </h3>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:ml-auto sm:max-w-2xl">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                aria-hidden="true"
              />
              <Input
                aria-label="Buscar en inventario"
                placeholder="Buscar en inventario..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={filterBy} onValueChange={setFilterBy}>
              <SelectTrigger className="w-full sm:w-[150px] h-9 text-sm">
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
              className="h-9 sm:w-[170px]"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={toggleSelectMode}
              className="h-9 text-sm whitespace-nowrap bg-input-background hover:bg-input-background hover:brightness-100 border border-input text-foreground"
            >
              {selectMode ? (
                <>
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Cancelar
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Eliminar varios
                </>
              )}
            </Button>
          </div>
        </div>

        {selectMode && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} />
              Seleccionar todos
            </label>
            <Button
              type="button"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={() => setConfirmBulkDelete(true)}
              className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
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
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} producto(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Los productos seleccionados se eliminarán
              permanentemente del inventario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* History Dialog */}
      <Dialog
        open={!!historyItem}
        onOpenChange={(open) => !open && setHistoryItem(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Historial de Movimientos
            </DialogTitle>
            <DialogDescription>
              Historial completo para:{" "}
              <span className="font-bold text-gray-900">
                {historyItem?.name}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="relative border-l border-gray-200 ml-3 space-y-8 mt-4">
            {historyRecords
              .slice()
              .reverse()
              .map((record, index) => (
                <div key={index} className="relative pl-6">
                  <span
                    className={`absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-white ${
                      record.action === "create"
                        ? "bg-green-500"
                        : record.action === "update"
                          ? "bg-blue-500"
                          : record.action === "delete"
                            ? "bg-red-500"
                            : "bg-gray-400"
                    }`}
                  />

                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 font-mono">
                      {format(new Date(record.date), "PPP p")}
                    </span>
                    <span className="font-medium text-gray-900">
                      {record.action === "create"
                        ? "Creación"
                        : record.action === "update"
                          ? "Modificación/Venta"
                          : record.action === "delete"
                            ? "Eliminación"
                            : record.action}
                    </span>
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md border border-gray-100">
                      {record.details}
                    </p>
                    <div className="flex items-center gap-4 text-xs mt-1">
                      <span className="text-gray-500 flex items-center gap-1">
                        Usuario:{" "}
                        <span className="font-medium text-gray-700">
                          {record.user}
                        </span>
                      </span>
                      {record.previousStock !== undefined &&
                        record.newStock !== undefined && (
                          <span className="flex items-center gap-1 text-gray-600 bg-blue-50 px-2 py-0.5 rounded">
                            Stock: {record.previousStock}{" "}
                            <ArrowRight className="w-3 h-3" /> {record.newStock}
                          </span>
                        )}
                    </div>
                  </div>
                </div>
              ))}
            {historyLoading && (
              <p className="text-sm text-gray-500 pl-6">
                Cargando historial...
              </p>
            )}
            {!historyLoading && historyRecords.length === 0 && (
              <p className="text-sm text-gray-500 pl-6">
                No hay historial registrado.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
