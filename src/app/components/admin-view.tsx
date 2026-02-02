import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InventoryForm } from "./inventory-form";
import { InventoryTable } from "./inventory-table";
import { useApp, InventoryItem } from "../context/app-context";
import { useAuth } from "../context/auth-context";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { DollarSign, Euro, History, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

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
  const { items, addItem, updateItem, deleteItem, rates, updateRates } =
    useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);

  useEffect(() => {
    if (currentUser?.role !== "admin") {
      navigate("/search"); // Redirect non-admins
    }
  }, [currentUser, navigate]);

  const handleAddItem = (
    item: Omit<InventoryItem, "id" | "history">,
    notes?: string,
  ) => {
    addItem(item, currentUser?.name || "Desconocido");
  };

  const handleUpdateItem = (
    item: Omit<InventoryItem, "id" | "history">,
    notes?: string,
  ) => {
    if (editingItem) {
      updateItem(
        { ...item, id: editingItem.id, history: editingItem.history },
        currentUser?.name || "Desconocido",
        notes,
      );
      onCancelEdit();
    }
  };

  if (!currentUser || currentUser.role !== "admin") return null;

  return (
    <div className="space-y-8">
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
                value={rates.USD}
                onChange={(e) =>
                  updateRates(parseFloat(e.target.value) || 1, rates.EUR)
                }
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
                value={rates.EUR}
                onChange={(e) =>
                  updateRates(rates.USD, parseFloat(e.target.value) || 1)
                }
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>

      <InventoryForm
        onSubmit={editingItem ? handleUpdateItem : handleAddItem}
        editItem={editingItem}
        onCancelEdit={onCancelEdit}
        rates={rates}
      />

      <InventoryTable
        items={items}
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
