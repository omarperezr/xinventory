import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { InventoryTable } from "./inventory-table";
import { useApp, InventoryItem } from "../context/app-context";
import { useAuth } from "../context/auth-context";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface SearchViewProps {
  onEditItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
}

export function SearchView({ onEditItem, onDeleteItem }: SearchViewProps) {
  const { items, addToCart, totalAmount, formatPrice } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState("all");

  const isAdmin = currentUser?.role === "admin";

  const filteredItems = items.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    if (filterBy === "name") return item.name.toLowerCase().includes(term);
    if (filterBy === "barcode")
      return item.barcode.toLowerCase().includes(term);
    return (
      item.name.toLowerCase().includes(term) ||
      item.barcode.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search Bar */}
      <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200 shadow-sm space-y-3 md:space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base md:text-lg font-semibold text-gray-900">
            Buscar Inventario
          </h2>
          {/* Admin: quick add button visible next to title on mobile */}
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => navigate("/")}
              className="md:hidden bg-[#2196F3] hover:bg-[#1976D2] text-white h-8 px-3 text-xs flex items-center gap-1.5 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 md:h-10 border-gray-300 focus:border-[#2196F3] text-sm"
            />
          </div>
          <Select value={filterBy} onValueChange={setFilterBy}>
            <SelectTrigger className="w-full sm:w-[160px] h-9 md:h-10 border-gray-300 text-sm">
              <SelectValue placeholder="Filtrar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo</SelectItem>
              <SelectItem value="name">Nombre</SelectItem>
              <SelectItem value="barcode">Código</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {searchTerm && (
          <p className="text-xs text-gray-500">
            {filteredItems.length} resultado
            {filteredItems.length !== 1 ? "s" : ""} para «{searchTerm}»
          </p>
        )}
      </div>

      {/* Inventory Table */}
      <InventoryTable
        items={filteredItems}
        onEdit={onEditItem}
        onDelete={onDeleteItem}
        onAddToCart={addToCart}
        showBuyingPrice={isAdmin}
      />

      {/* Total bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 shadow-lg z-40 md:relative md:bg-[#2196F3] md:text-white md:rounded-lg md:shadow-md md:border-0 md:mt-8 md:z-auto md:px-6 md:py-4">
        {/* On mobile: leave space for nav bar at bottom */}
        <div className="max-w-7xl mx-auto flex justify-between items-center md:px-0">
          <div className="text-xs md:text-lg font-medium text-gray-900 md:text-white">
            Valor Total (Con Impuestos)
          </div>
          <div className="text-lg md:text-3xl font-bold text-[#2196F3] md:text-white">
            {formatPrice(totalAmount)}
          </div>
        </div>
      </div>

      {/* Mobile bottom spacer (nav + total bar) */}
      <div className="md:hidden h-28" />
    </div>
  );
}
