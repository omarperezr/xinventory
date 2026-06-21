import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InventoryForm } from "./inventory-form";
import { InventoryTable } from "./inventory-table";
import { useApp, InventoryItem } from "../context/app-context";
import { useAuth } from "../context/auth-context";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { toast } from "sonner";
import {
  DollarSign,
  Euro,
  History,
  ArrowRight,
  Search,
  Check,
  Package,
  AlertTriangle,
  Wallet,
  TrendingUp,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Card, CardContent } from "./ui/card";

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
  const { items, addItem, updateItem, deleteItem, rates, updateRates, formatPrice } =
    useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState("all");

  // Editable rate drafts — only committed to Supabase when "Actualizar" is
  // clicked, so typing/clearing a field doesn't fire a request per keystroke.
  const [usdInput, setUsdInput] = useState("");
  const [eurInput, setEurInput] = useState("");

  useEffect(() => {
    setUsdInput(rates.USD.toString());
    setEurInput(rates.EUR.toString());
  }, [rates.USD, rates.EUR]);

  const handleUpdateRates = () => {
    const usd = parseFloat(usdInput);
    const eur = parseFloat(eurInput);
    if (isNaN(usd) || usd <= 0 || isNaN(eur) || eur <= 0) {
      toast.error("Ingrese tasas válidas mayores a cero");
      return;
    }
    updateRates(usd, eur);
  };

  const ratesChanged =
    usdInput !== rates.USD.toString() || eurInput !== rates.EUR.toString();

  useEffect(() => {
    if (currentUser?.role !== "admin") {
      navigate("/search");
    }
  }, [currentUser, navigate]);

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

  // Filter items based on search term
  const filteredItems = items.filter((item) => {
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
  });

  if (!currentUser || currentUser.role !== "admin") return null;

  const inventoryCost = items.reduce(
    (sum, i) => sum + i.buyingPrice * i.quantity,
    0,
  );
  const inventoryValue = items.reduce(
    (sum, i) => sum + i.sellingPrice * i.quantity,
    0,
  );
  const lowStockItems = items.filter((i) => i.quantity > 0 && i.quantity < 10);
  const outOfStockItems = items.filter((i) => i.quantity === 0);
  const avgMargin =
    items.length > 0
      ? items.reduce(
          (sum, i) =>
            sum +
            (i.sellingPrice > 0
              ? ((i.sellingPrice - i.buyingPrice) / i.sellingPrice) * 100
              : 0),
          0,
        ) / items.length
      : 0;

  return (
    <div className="space-y-8">
      {/* Inventory Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
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
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
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
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
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
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                Margen Promedio
              </p>
              <Package className="w-3.5 h-3.5 text-[#2196F3] flex-shrink-0" />
            </div>
            <p className="text-base md:text-xl font-bold text-gray-900">
              {avgMargin.toFixed(0)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Exchange Rates Section */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Tasas de Cambio (Hoy)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">
              Precio USD Hoy (Bs/USD)
            </Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={usdInput}
                onChange={(e) => setUsdInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUpdateRates()}
                placeholder="0.00"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">
              Precio EUR Hoy (Bs/EUR)
            </Label>
            <div className="relative">
              <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={eurInput}
                onChange={(e) => setEurInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUpdateRates()}
                placeholder="0.00"
                className="pl-9"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button
            type="button"
            onClick={handleUpdateRates}
            disabled={!ratesChanged}
            className="bg-[#2196F3] hover:bg-[#1976D2] text-white rounded-lg px-6 disabled:opacity-50"
          >
            <Check className="w-4 h-4 mr-2" />
            Actualizar Tasas
          </Button>
        </div>
      </div>

      <InventoryForm
        onSubmit={editingItem ? handleUpdateItem : handleAddItem}
        editItem={editingItem}
        onCancelEdit={onCancelEdit}
        rates={rates}
      />

      {/* Admin Inventory Search Bar */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <h3 className="text-base font-medium text-gray-900 whitespace-nowrap">
            Inventario
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({filteredItems.length} de {items.length} productos)
            </span>
          </h3>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:ml-auto sm:max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar en inventario..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={filterBy} onValueChange={setFilterBy}>
              <SelectTrigger className="w-full sm:w-[150px] h-9 text-sm border-gray-300">
                <SelectValue placeholder="Filtrar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo</SelectItem>
                <SelectItem value="name">Nombre</SelectItem>
                <SelectItem value="barcode">Código</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <InventoryTable
        items={filteredItems}
        onEdit={onEditItem}
        onDelete={(id) => deleteItem(id, currentUser?.name || "Admin")}
        showBuyingPrice
        onViewHistory={setHistoryItem}
      />

      {/* History Dialog */}
      <Dialog
        open={!!historyItem}
        onOpenChange={(open) => !open && setHistoryItem(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-[#2196F3]" />
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
            {historyItem?.history
              ?.slice()
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
                    <span className="text-xs text-gray-400 font-mono">
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
            {(!historyItem?.history || historyItem.history.length === 0) && (
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
