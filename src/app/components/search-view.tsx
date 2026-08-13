import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  SlidersHorizontal,
  X,
  ArrowRight,
  PackageSearch,
} from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ProductCard } from "./product-card";
import { PriceTag } from "./price-tag";
import { useApp, InventoryItem, foldText } from "../context/app-context";
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
  const { items, addToCart, cartItems, totalAmount } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterBy, setFilterBy] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption[]>([]);

  const isAdmin = currentUser?.role === "admin";
  const cartCount = cartItems.reduce((sum, i) => sum + i.cartQuantity, 0);

  const types = useMemo(
    () => Array.from(new Set(items.map((i) => i.type || "N/A"))).sort(),
    [items],
  );
  const brands = useMemo(
    () => Array.from(new Set(items.map((i) => i.brand || "GENERICO"))).sort(),
    [items],
  );

  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) +
    (brandFilter !== "all" ? 1 : 0) +
    (stockFilter !== "all" ? 1 : 0) +
    (filterBy !== "all" ? 1 : 0) +
    (sortBy.length > 0 ? 1 : 0);

  const clearFilters = () => {
    setTypeFilter("all");
    setBrandFilter("all");
    setStockFilter("all");
    setFilterBy("all");
    setSortBy([]);
  };

  // Smart search: tokenizes the query and matches each token as a LIKE
  // (substring, case-insensitive) against the relevant field(s) instead of
  // requiring an exact/equal match - every token must match somewhere.
  const filteredItems = useMemo(() => {
    const tokens = foldText(searchTerm.trim()).split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      if (tokens.length > 0) {
        const haystacks =
          filterBy === "name"
            ? [foldText(item.name)]
            : filterBy === "barcode"
              ? [foldText(item.barcode)]
              : [
                  foldText(item.name),
                  foldText(item.barcode),
                  foldText(item.brand || ""),
                  foldText(item.type || ""),
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
    <div className="space-y-4 md:space-y-5">
      {/* One big search field: the screen's first and main act. */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Buscar productos"
              placeholder="Busca un producto…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-13 pl-11 pr-11 text-base rounded-xl shadow-card"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                aria-label="Borrar búsqueda"
                className="tap-target absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="h-13 rounded-xl shadow-card relative shrink-0 px-4"
          >
            <SlidersHorizontal aria-hidden="true" />
            <span className="hidden sm:inline">Filtros</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-meta font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {isAdmin && (
            <Button
              onClick={() => navigate("/")}
              className="h-13 rounded-xl shrink-0 px-4 md:hidden"
              aria-label="Agregar producto"
            >
              <Plus aria-hidden="true" />
              <span className="hidden sm:inline">Agregar</span>
            </Button>
          )}
        </div>

        {/* Filters fold away: most sales never need them. */}
        {showFilters && (
          <div className="rounded-xl border border-border bg-white p-4 shadow-card animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Select value={filterBy} onValueChange={setFilterBy}>
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Buscar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Buscar en todo</SelectItem>
                  <SelectItem value="name">Solo nombre</SelectItem>
                  <SelectItem value="barcode">Solo código</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger size="sm">
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
                <SelectTrigger size="sm">
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
                <SelectTrigger size="sm">
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

              <InventorySortControl
                value={sortBy}
                onChange={setSortBy}
                className="h-10 col-span-2 md:col-span-1"
              />
            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-sm font-semibold text-primary hover:text-primary-hover"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground" data-money>
          {visibleItems.length}{" "}
          {visibleItems.length === 1 ? "producto" : "productos"}
        </p>
      </div>

      {/* Products: rows on the phone, cards from md up. */}
      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-10 md:p-14 text-center shadow-card">
          <PackageSearch
            className="mx-auto mb-3 size-10 text-muted-foreground/50"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h3 className="text-base font-semibold text-foreground mb-1">
            No se encontró ningún producto
          </h3>
          <p className="text-sm text-muted-foreground">
            Revisa cómo lo escribiste{activeFilterCount > 0 ? " o limpia los filtros" : ""}.
          </p>
          {activeFilterCount > 0 && (
            <Button variant="soft" size="sm" onClick={clearFilters} className="mt-4">
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
          {visibleItems.map((item) => (
            <ProductCard key={item.id} item={item} onAddToCart={addToCart} />
          ))}
        </div>
      )}

      {/* The bridge to Cobrar: appears with the first item, rides above the
          tab bar, and its total pops on every add — the moment that says
          "lo agregué". */}
      {cartCount > 0 && (
        <>
          {/* Docked on md+ (a floating card occludes the grid mid-scroll);
              floating pill above the tab bar on phones. */}
          <div className="fixed left-3 right-3 z-40 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:left-0 md:right-0 md:bottom-0 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <button
              type="button"
              onClick={() => navigate("/total")}
              className="flex w-full items-center justify-between gap-4 rounded-2xl bg-primary px-5 py-3.5 text-left text-white shadow-raised transition-colors hover:bg-primary-hover md:rounded-none md:px-8 md:py-4"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white/85" data-money>
                  {cartCount} {cartCount === 1 ? "artículo" : "artículos"}
                </span>
                <PriceTag
                  key={totalAmount}
                  usd={totalAmount}
                  size="lg"
                  className="text-white [&_[aria-hidden]]:text-white/50 animate-in zoom-in-95 fade-in duration-200"
                />
              </span>
              <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-base font-bold text-primary">
                Cobrar
                <ArrowRight className="size-5" aria-hidden="true" />
              </span>
            </button>
          </div>
          {/* Keep the last product row reachable above the strip. */}
          <div className="h-20 md:h-24" />
        </>
      )}
    </div>
  );
}
