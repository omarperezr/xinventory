import { useState } from "react";
import {
  Package,
  LayoutGrid,
  Search,
  ShoppingCart,
  History,
  BarChart2,
  LogIn,
  LogOut,
  User,
  Users,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  Shield,
  Tag,
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
import { useAuth, UserRole } from "../context/auth-context";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

// ─── Login Dialog ─────────────────────────────────────────────────────────────
function LoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = () => {
    setError("");
    const ok = login(email, password);
    if (ok) {
      onOpenChange(false);
      setEmail("");
      setPassword("");
    } else {
      setError("Correo o contraseña incorrectos");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="w-5 h-5 text-[#2196F3]" />
            Iniciar Sesión
          </DialogTitle>
          <DialogDescription>
            Ingresa tus credenciales para continuar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Correo Electrónico</Label>
            <Input
              type="email"
              placeholder="usuario@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Contraseña</Label>
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPass ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md border border-red-100">
              {error}
            </p>
          )}

          <Button
            onClick={handleSubmit}
            className="w-full bg-[#2196F3] hover:bg-[#1976D2] text-white"
          >
            Entrar
          </Button>

          <p className="text-xs text-gray-400 text-center">
            Admin demo: admin@inventario.com / admin123
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── User Management Dialog ───────────────────────────────────────────────────
function UserManagementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { users, addUser, deleteUser, currentUser } = useAuth();
  const [tab, setTab] = useState<"list" | "create">("list");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [role, setRole] = useState<UserRole>("seller");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("seller");
    setError("");
    setSuccess("");
  };

  const handleCreate = () => {
    setError("");
    setSuccess("");
    const result = addUser(name, email, password, role);
    if (result.success) {
      setSuccess("Usuario creado exitosamente");
      resetForm();
    } else {
      setError(result.error || "Error al crear usuario");
    }
  };

  const roleLabel = (r: UserRole) =>
    r === "admin" ? "Administrador" : "Vendedor";
  const RoleIcon = ({ r }: { r: UserRole }) =>
    r === "admin" ? (
      <Shield className="w-3 h-3" />
    ) : (
      <Tag className="w-3 h-3" />
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetForm();
      }}
    >
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#2196F3]" />
            Gestión de Usuarios
          </DialogTitle>
          <DialogDescription>
            Administra los usuarios del sistema
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mt-1">
          <button
            onClick={() => setTab("list")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
              tab === "list"
                ? "bg-white text-[#2196F3] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Usuarios ({users.length})
          </button>
          <button
            onClick={() => setTab("create")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
              tab === "create"
                ? "bg-white text-[#2196F3] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Crear Usuario
          </button>
        </div>

        {/* Users List */}
        {tab === "list" && (
          <div className="space-y-2 max-h-80 overflow-y-auto mt-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      u.role === "admin"
                        ? "bg-blue-100 text-[#2196F3]"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate flex items-center gap-1.5">
                      {u.name}
                      {u.id === currentUser?.id && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                          Tú
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {u.email}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      u.role === "admin"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-green-50 text-green-700"
                    }`}
                  >
                    <RoleIcon r={u.role} />
                    {roleLabel(u.role)}
                  </span>
                  {u.id !== currentUser?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteUser(u.id)}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7 p-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create User Form */}
        {tab === "create" && (
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nombre Completo</Label>
              <Input
                placeholder="Ej: Juan Pérez"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Correo Electrónico</Label>
              <Input
                type="email"
                placeholder="usuario@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña</Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as UserRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">
                    <span className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-green-600" />
                      Vendedor
                    </span>
                  </SelectItem>
                  <SelectItem value="admin">
                    <span className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-blue-600" />
                      Administrador
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md border border-red-100">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md border border-green-100">
                {success}
              </p>
            )}

            <Button
              onClick={handleCreate}
              className="w-full bg-[#2196F3] hover:bg-[#1976D2] text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Crear Usuario
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Header ──────────────────────────────────────────────────────────────
export function InventoryHeader() {
  const location = useLocation();
  const { currency, setCurrency } = useApp();
  const { currentUser, logout } = useAuth();

  const [showLogin, setShowLogin] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showUserMgmt, setShowUserMgmt] = useState(false);

  const isAdmin = currentUser?.role === "admin";
  const isDashboard = location.pathname === "/";
  const isSearch = location.pathname === "/search";
  const isTotal = location.pathname === "/total";
  const isHistory = location.pathname === "/history";
  const isReports = location.pathname === "/reports";

  const roleLabel = currentUser?.role === "admin" ? "Admin" : "Vendedor";
  const roleColor =
    currentUser?.role === "admin"
      ? "bg-blue-50 text-blue-700"
      : "bg-green-50 text-green-700";

  return (
    <>
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 md:py-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-6 justify-between md:justify-start w-full md:w-auto">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#2196F3] rounded-lg flex items-center justify-center">
                  <Package className="w-4 h-4 text-white" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-[#1A1A1A] tracking-tight text-base font-semibold leading-none">
                    Inventario
                  </h1>
                  <p className="text-xs text-gray-400 font-light mt-0.5">
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

            {/* Right Controls */}
            <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
              {/* Currency Selector */}
              <Select
                value={currency}
                onValueChange={(val: any) => setCurrency(val)}
              >
                <SelectTrigger className="w-[90px] md:w-[100px] border-gray-300 rounded-lg h-8 text-xs md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BS">Bs (VES)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                </SelectContent>
              </Select>

              {/* User Area */}
              {currentUser ? (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 h-8 px-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm"
                  >
                    <div className="w-5 h-5 rounded-full bg-[#2196F3] flex items-center justify-center flex-shrink-0">
                      <User className="w-3 h-3 text-white" />
                    </div>
                    <span className="hidden sm:block text-gray-700 font-medium max-w-[100px] truncate">
                      {currentUser.name.split(" ")[0]}
                    </span>
                    <span
                      className={`hidden sm:block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleColor}`}
                    >
                      {roleLabel}
                    </span>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </button>

                  {/* Dropdown */}
                  {showUserMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setShowUserMenu(false)}
                      />
                      <div className="absolute right-0 mt-1 w-52 bg-white rounded-lg border border-gray-200 shadow-lg z-30 overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <p className="font-medium text-sm text-gray-900 truncate">
                            {currentUser.name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {currentUser.email}
                          </p>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              setShowUserMgmt(true);
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Users className="w-4 h-4 text-gray-500" />
                            Gestionar Usuarios
                          </button>
                        )}
                        <button
                          onClick={() => {
                            logout();
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
                        >
                          <LogOut className="w-4 h-4" />
                          Cerrar Sesión
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowLogin(true)}
                  className="flex items-center gap-2 h-8 px-3 rounded-lg bg-[#2196F3] hover:bg-[#1976D2] text-white text-sm font-medium transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  <span className="hidden sm:block">Iniciar Sesión</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 pb-safe">
        <div className="flex justify-around items-center h-14 px-1">
          {isAdmin && (
            <Link
              to="/"
              className={`flex flex-col items-center justify-center flex-1 h-full space-y-0.5 ${
                isDashboard ? "text-[#2196F3]" : "text-gray-500"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="text-[9px] font-medium">Admin</span>
            </Link>
          )}
          <Link
            to="/search"
            className={`flex flex-col items-center justify-center flex-1 h-full space-y-0.5 ${
              isSearch ? "text-[#2196F3]" : "text-gray-500"
            }`}
          >
            <Search className="w-4 h-4" />
            <span className="text-[9px] font-medium">Buscar</span>
          </Link>
          <Link
            to="/total"
            className={`flex flex-col items-center justify-center flex-1 h-full space-y-0.5 ${
              isTotal ? "text-[#2196F3]" : "text-gray-500"
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="text-[9px] font-medium">Total</span>
          </Link>
          <Link
            to="/history"
            className={`flex flex-col items-center justify-center flex-1 h-full space-y-0.5 ${
              isHistory ? "text-[#2196F3]" : "text-gray-500"
            }`}
          >
            <History className="w-4 h-4" />
            <span className="text-[9px] font-medium">Historial</span>
          </Link>
          <Link
            to="/reports"
            className={`flex flex-col items-center justify-center flex-1 h-full space-y-0.5 ${
              isReports ? "text-[#2196F3]" : "text-gray-500"
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span className="text-[9px] font-medium">Reportes</span>
          </Link>
        </div>
      </div>

      {/* Spacer for bottom nav on mobile */}
      <div className="md:hidden h-14" />

      {/* Dialogs */}
      <LoginDialog open={showLogin} onOpenChange={setShowLogin} />
      <UserManagementDialog
        open={showUserMgmt}
        onOpenChange={setShowUserMgmt}
      />
    </>
  );
}
