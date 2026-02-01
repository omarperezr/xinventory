import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "./ui/input";
import { InventoryTable } from "./inventory-table";
import { useApp, InventoryItem } from "../context/app-context";
import { useAuth } from "../context/auth-context";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState("all");

  const filteredItems = items.filter((item) => {
    if (!searchTerm) return true;

    const term = searchTerm.toLowerCase();

    if (filterBy === "name") {
      return item.name.toLowerCase().includes(term);
    }

    if (filterBy === "barcode") {
      return item.barcode.toLowerCase().includes(term);
    }

    // 'all'
    return (
      item.name.toLowerCase().includes(term) ||
      item.barcode.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-lg font-medium text-gray-900">Buscar Inventario</h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterBy} onValueChange={setFilterBy}>
            <SelectTrigger className="w-full sm:w-[180px]">
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

      <InventoryTable
        items={filteredItems}
        onEdit={onEditItem}
        onDelete={onDeleteItem}
        onAddToCart={addToCart}
        showBuyingPrice={currentUser?.role === "admin"}
        searchView={true}
      />

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg md:relative md:bg-[#2196F3] md:text-white md:rounded-lg md:shadow-md md:border-0 md:mt-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-4 md:px-0">
          <div className="text-sm md:text-lg font-medium text-gray-900 md:text-white">
            Valor Total Actual (Con Impuestos)
          </div>
          <div className="text-xl md:text-3xl font-bold text-[#2196F3] md:text-white">
            {formatPrice(totalAmount)}
          </div>
        </div>
      </div>
    </div>
  );
}
