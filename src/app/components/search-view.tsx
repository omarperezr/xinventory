import { useMemo, useState } from "react";
import { Search, Plus, SlidersHorizontal } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ProductCard } from "./product-card";
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
import { InventorySortControl } from "./inventory-sort-control";
import { sortInventory, SortOption } from "../utils/sortInventory";

interface SearchViewProps {
  onEditItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
}

const STOCK_FILTERS = [
  { value: "all", label: "Todo el stock" },
  { value: "in", label: "Disponible" },
  { value: "low", label: "Stock bajo (<10)" },
  { value: "out", label: "Agotado" },
];

export function SearchView({ onEditItem: _onEditItem, onDeleteItem: _onDeleteItem }: SearchViewProps) {
  const { items, addToCart, totalAmount, formatPrice } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption[]>([]);

  const isAdmin = currentUser?.role === "admin";

  const types = useMemo(
    () => Array.from(new Set(items.map((i) => i.type || "N/A"))).sort(),
    [items],
  );
  const brands = useMemo(
    () => Array.from(new Set(items.map((i) => i.brand || "GENERICO"))).sort(),
    [items],
  );

  // Smart search: tokenizes the query and matches each token as a LIKE
  // (substring, case-insensitive) against the relevant field(s) instead of
  // requiring an exact/equal match - every token must match somewhere.
  const filteredItems = useMemo(() => {
    const tokens = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      if (tokens.length > 0) {
        const haystacks =
          filterBy === "name"
            ? [item.name.toLowerCase()]
            : filterBy === "barcode"
              ? [item.barcode.toLowerCase()]
              : [
                  item.name.toLowerCase(),
                  item.barcode.toLowerCase(),
                  (item.brand || "").toLowerCase(),
                  (item.type || "").toLowerCase(),
                ];
        const matches = tokens.every((token) =>
          haystacks.some((field) => field.includes(token)),
        );
        if (!matches) return false;
      }
      if (typeFilter !== "all" && (item.type || "N/A") !== typeFilter)
        return false;
      if (brandFilter !== "all" && (item.brand || "GENERICO") !== brandFilter)
        return false;
      if (stockFilter === "in" && item.quantity <= 0) return false;
      if (stockFilter === "low" && !(item.quantity > 0 && item.quantity < 10))
        return false;
      if (stockFilter === "out" && item.quantity !== 0) return false;
      return true;
    });
  }, [items, searchTerm, filterBy, typeFilter, brandFilter, stockFilter]);

  const visibleItems = useMemo(
    () => sortInventory(filteredItems, sortBy),
    [filteredItems, sortBy],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6 space-y-3 md:space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-gray-400" />
            Buscar Inventario
          </h2>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => navigate("/")}
              className="md:hidden h-8 px-3 text-xs flex items-center gap-1.5"
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
              className="pl-9 h-9 md:h-10 text-sm"
            />
          </div>
          <Select value={filterBy} onValueChange={setFilterBy}>
            <SelectTrigger className="w-full sm:w-[140px] h-9 md:h-10 text-sm">
              <SelectValue placeholder="Buscar por" />
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
            className="h-9 md:h-10 sm:w-[180px]"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las marcas</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stockFilter} onValueChange={setStockFilter}>
            <SelectTrigger className="h-9 text-sm col-span-2 sm:col-span-1">
              <SelectValue placeholder="Stock" />
            </SelectTrigger>
            <SelectContent>
              {STOCK_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-gray-500">
          {visibleItems.length} resultado{visibleItems.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Product Grid */}
      {visibleItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 md:p-14 text-center">
          <h3 className="text-gray-900 text-sm mb-1">
            No hay productos encontrados
          </h3>
          <p className="text-xs text-gray-500">
            Agrega productos o ajusta tus filtros
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {visibleItems.map((item) => (
            <ProductCard key={item.id} item={item} onAddToCart={addToCart} />
          ))}
        </div>
      )}

      {/* Total bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 shadow-lg z-40 md:relative md:bg-gray-900 md:text-white md:rounded-2xl md:shadow-md md:border-0 md:mt-8 md:z-auto md:px-6 md:py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center md:px-0">
          <div className="text-xs md:text-lg font-medium text-gray-900 md:text-white">
            Valor Total (Con Impuestos)
          </div>
          <div className="text-lg md:text-3xl font-bold text-gray-900 md:text-white">
            {formatPrice(totalAmount)}
          </div>
        </div>
      </div>

      <div className="md:hidden h-28" />
    </div>
  );
}
