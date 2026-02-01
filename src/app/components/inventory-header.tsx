import {
  Package,
  LayoutGrid,
  Search,
  ShoppingCart,
  History,
  BarChart2,
  User,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useApp } from "../context/app-context";
import { useAuth } from "../context/auth-context";

// 1. Configuration to share logic between Desktop and Mobile views
const NAV_ITEMS = [
  { label: "Admin", path: "/", icon: LayoutGrid, adminOnly: true },
  { label: "Buscar", path: "/search", icon: Search, adminOnly: false },
  { label: "Total", path: "/total", icon: ShoppingCart, adminOnly: false },
  { label: "Historial", path: "/history", icon: History, adminOnly: false },
  { label: "Reportes", path: "/reports", icon: BarChart2, adminOnly: true },
];

export function InventoryHeader() {
  const location = useLocation();
  const { currency, setCurrency } = useApp();
  const { currentUser, users, login } = useAuth();

  const isAdmin = currentUser?.role === "admin";

  // Helper to check active state
  const isActivePath = (path: string) => location.pathname === path;

  return (
    <>
      {/* --- MAIN HEADER --- */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-8 md:py-6">
          <div className="flex items-center justify-between gap-4">
            {/* Left Section: Logo & Desktop Nav */}
            <div className="flex items-center gap-4 md:gap-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#2196F3] rounded-lg flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-white" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-[#1A1A1A] tracking-tight font-semibold">
                    XInventory
                  </h1>
                  <p className="hidden sm:block text-sm text-gray-500 font-light">
                    Gestión de productos
                  </p>
                </div>
              </div>

              {/* DESKTOP NAVIGATION (Hidden on Mobile) */}
              <nav className="hidden md:flex items-center bg-gray-100/80 p-1 rounded-lg">
                {NAV_ITEMS.map((item) => {
                  if (item.adminOnly && !isAdmin) return null;
                  const active = isActivePath(item.path);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        active
                          ? "bg-white text-[#2196F3] shadow-sm"
                          : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Right Section: Controls */}
            <div className="flex items-center gap-2 md:gap-3">
              <Select
                value={currency}
                onValueChange={(val: any) => setCurrency(val)}
              >
                <SelectTrigger className="w-[80px] md:w-[100px] border-gray-300 rounded-lg h-9 text-xs md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BS">Bs (VES)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                </SelectContent>
              </Select>

              {/* User Selector (Mock Auth) */}
              <Select
                value={currentUser?.id}
                onValueChange={(val) => login(val)}
              >
                <SelectTrigger className="w-[140px] border-gray-300 rounded-lg h-9 text-sm">
                  <User className="w-4 h-4 mr-2 text-gray-500" />
                  <span className="truncate">
                    {currentUser?.name.split(" ")[0] || "Login"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      {/* --- MOBILE BOTTOM NAVIGATION (Hidden on Desktop) --- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex justify-around items-center h-16">
          {NAV_ITEMS.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const active = isActivePath(item.path);
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                  active ? "text-[#2196F3]" : "text-gray-400"
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${active ? "fill-current" : ""}`}
                  strokeWidth={active ? 2 : 1.5}
                />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Spacer to prevent content being hidden behind bottom nav on mobile */}
      {/* <div className="h-20 md:hidden" /> */}
    </>
  );
}
