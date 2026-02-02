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

export function InventoryHeader() {
  const location = useLocation();
  const { currency, setCurrency } = useApp();
  const { currentUser, users, login, logout } = useAuth();

  const isAdmin = currentUser?.role === "admin";
  const isDashboard = location.pathname === "/";
  const isSearch = location.pathname === "/search";
  const isTotal = location.pathname === "/total";
  const isHistory = location.pathname === "/history";
  const isReports = location.pathname === "/reports";

  return (
    <>
      {/* Top Header (Logo + Controls) */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-8 justify-between md:justify-start w-full md:w-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#2196F3] rounded-lg flex items-center justify-center">
                  <Package className="w-5 h-5 text-white" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-[#1A1A1A] tracking-tight">Inventario</h1>
                  <p className="text-sm text-gray-500 font-light">
                    Gestión de productos
                  </p>
                </div>
              </div>

              {/* Desktop Nav */}
              <nav className="hidden md:flex items-center bg-gray-100/80 p-1 rounded-lg">
                {isAdmin && (
                  <Link
                    to="/"
                    className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      isDashboard
                        ? "bg-white text-[#2196F3] shadow-sm"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4 mr-2" />
                    Admin
                  </Link>
                )}
                <Link
                  to="/search"
                  className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    isSearch
                      ? "bg-white text-[#2196F3] shadow-sm"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <Search className="w-4 h-4 mr-2" />
                  Buscar
                </Link>
                <Link
                  to="/total"
                  className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    isTotal
                      ? "bg-white text-[#2196F3] shadow-sm"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Total
                </Link>
                <Link
                  to="/history"
                  className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    isHistory
                      ? "bg-white text-[#2196F3] shadow-sm"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <History className="w-4 h-4 mr-2" />
                  Historial
                </Link>
                <Link
                  to="/reports"
                  className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    isReports
                      ? "bg-white text-[#2196F3] shadow-sm"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <BarChart2 className="w-4 h-4 mr-2" />
                  Reportes
                </Link>
              </nav>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto">
              {/* Controls (Currency + User) - Visible on Mobile too */}
              <div className="flex items-center gap-3 w-full md:w-auto">
                <Select
                  value={currency}
                  onValueChange={(val: any) => setCurrency(val)}
                >
                  <SelectTrigger className="flex-1 md:w-[100px] border-gray-300 rounded-lg h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BS">Bs (VES)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={currentUser?.id}
                  onValueChange={(val) => login(val)}
                >
                  <SelectTrigger className="flex-1 md:w-[140px] border-gray-300 rounded-lg h-9 text-sm">
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
        </div>
      </header>

      {/* Mobile Bottom Navigation (Fixed) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 pb-safe">
        <div className="flex justify-around items-center h-16 px-2">
          {isAdmin && (
            <Link
              to="/"
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                isDashboard ? "text-[#2196F3]" : "text-gray-500"
              }`}
            >
              <LayoutGrid className="w-5 h-5" />
              <span className="text-[10px] font-medium">Admin</span>
            </Link>
          )}
          <Link
            to="/search"
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              isSearch ? "text-[#2196F3]" : "text-gray-500"
            }`}
          >
            <Search className="w-5 h-5" />
            <span className="text-[10px] font-medium">Buscar</span>
          </Link>
          <Link
            to="/total"
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              isTotal ? "text-[#2196F3]" : "text-gray-500"
            }`}
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="text-[10px] font-medium">Total</span>
          </Link>
          <Link
            to="/history"
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              isHistory ? "text-[#2196F3]" : "text-gray-500"
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-[10px] font-medium">Historial</span>
          </Link>
          <Link
            to="/reports"
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              isReports ? "text-[#2196F3]" : "text-gray-500"
            }`}
          >
            <BarChart2 className="w-5 h-5" />
            <span className="text-[10px] font-medium">Reportes</span>
          </Link>
        </div>
      </div>

      {/* Spacer for bottom nav on mobile */}
      <div className="md:hidden h-16" />
    </>
  );
}
