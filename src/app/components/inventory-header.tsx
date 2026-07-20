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
import {
  useApp,
  isDisplayCurrency,
  isReferenceLens,
} from "../context/app-context";
import { useAuth, UserRole } from "../context/auth-context";
import { ProfileDialog } from "./profile-dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

// One definition of the "pill" look shared by the desktop nav and the dialog
// tab strips. They had drifted apart into three near-identical copies.
const pillClasses = (active: boolean) =>
  `flex items-center justify-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
    active
      ? "bg-white text-primary shadow-sm"
      : "text-gray-600 hover:text-gray-900"
  }`;

const mobileTabClasses = (active: boolean) =>
  `flex flex-col items-center justify-center flex-1 h-full gap-0.5 ${
    active ? "text-primary" : "text-gray-600"
  }`;

// The count alone reads as a bare number to a screen reader, so the badge
// carries its own wording and the digits are left to sighted users.
function CartBadge({ count }: { count: number }) {
  return (
    <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-meta font-bold text-white bg-red-600 rounded-full">
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{count} artículos en el total</span>
    </span>
  );
}

// Login Dialog
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

  const handleSubmit = async () => {
    setError("");
    const result = await login(email, password);
    if (result.success) {
      onOpenChange(false);
      setEmail("");
      setPassword("");
    } else {
      setError(result.error || "Correo o contraseña incorrectos");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="w-5 h-5 text-primary" />
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
                aria-label={
                  showPass ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                aria-pressed={showPass}
                className="tap-target absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPass ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
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
            className="w-full"
          >
            Entrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// User Management Dialog
function UserManagementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { users, registerUser, deleteUser, updateUser, currentUser } = useAuth();
  const [tab, setTab] = useState<"list" | "create">("list");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [role, setRole] = useState<UserRole>("seller");
  const [canEditPrice, setCanEditPrice] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("seller");
    setCanEditPrice(false);
    setError("");
    setSuccess("");
  };

  const handleCreate = async () => {
    setError("");
    setSuccess("");
    const result = await registerUser(name, email, password, role, canEditPrice);
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
            <Users className="w-5 h-5 text-primary" />
            Gestión de Usuarios
          </DialogTitle>
          <DialogDescription>
            Administra los usuarios del sistema
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div role="tablist" className="flex gap-1 bg-gray-100 p-1 rounded-lg mt-1">
          <button
            role="tab"
            aria-selected={tab === "list"}
            onClick={() => setTab("list")}
            className={`flex-1 min-h-11 ${pillClasses(tab === "list")}`}
          >
            Usuarios ({users.length})
          </button>
          <button
            role="tab"
            aria-selected={tab === "create"}
            onClick={() => setTab("create")}
            className={`flex-1 min-h-11 ${pillClasses(tab === "create")}`}
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
                        ? "bg-blue-100 text-primary"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate flex items-center gap-1.5">
                      {u.name}
                      {u.id === currentUser?.id && (
                        <span className="text-meta bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
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
                  {u.role === "seller" && (
                    <label
                      className="flex items-center gap-1.5 cursor-pointer select-none"
                      title="Permitir que este vendedor modifique el precio de venta"
                    >
                      <Checkbox
                        checked={u.canEditPrice}
                        onCheckedChange={(c) =>
                          updateUser(u.id, { canEditPrice: c as boolean })
                        }
                      />
                      <span className="text-xs text-gray-500 hidden sm:inline">
                        Editar precio
                      </span>
                    </label>
                  )}
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
                      aria-label={`Eliminar usuario ${u.name}`}
                      onClick={async () => { await deleteUser(u.id); }}
                      className="tap-target text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
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
                  aria-label={
                    showPass ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={showPass}
                  className="tap-target absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPass ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
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

            {role === "seller" && (
              <label className="flex items-center gap-2 cursor-pointer select-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                <Checkbox
                  checked={canEditPrice}
                  onCheckedChange={(c) => setCanEditPrice(c as boolean)}
                />
                <span className="text-sm text-gray-700">
                  Permitir modificar precio de venta
                </span>
              </label>
            )}

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
              className="w-full"
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

// Main Header
export function InventoryHeader() {
  const location = useLocation();
  const { currency, setCurrency, cartItems, totalAmount, formatPrice } = useApp();
  const { currentUser, logout } = useAuth();

  const cartCount = cartItems.reduce((sum, i) => sum + i.cartQuantity, 0);

  const [showLogin, setShowLogin] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

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
                <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                  <Package className="w-4 h-4 text-white" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-gray-900 tracking-tight text-base font-semibold leading-none">
                    Inventario
                  </h1>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Gestión de productos
                  </p>
                </div>
              </div>

              {/* Desktop Nav */}
              <nav
                aria-label="Principal"
                className="hidden md:flex items-center bg-gray-100/80 p-1 rounded-lg"
              >
                {isAdmin && (
                  <Link
                    to="/"
                    aria-current={isDashboard ? "page" : undefined}
                    className={pillClasses(isDashboard)}
                  >
                    <LayoutGrid className="w-4 h-4 mr-2" aria-hidden="true" />
                    Admin
                  </Link>
                )}
                <Link
                  to="/search"
                  aria-current={isSearch ? "page" : undefined}
                  className={pillClasses(isSearch)}
                >
                  <Search className="w-4 h-4 mr-2" aria-hidden="true" />
                  Buscar
                </Link>
                <Link
                  to="/total"
                  aria-current={isTotal ? "page" : undefined}
                  className={`relative ${pillClasses(isTotal)}`}
                >
                  <span className="relative mr-2">
                    <ShoppingCart className="w-4 h-4" aria-hidden="true" />
                    {cartCount > 0 && <CartBadge count={cartCount} />}
                  </span>
                  Total
                  {totalAmount > 0 && (
                    <span className="ml-2 text-xs font-semibold text-primary">
                      {formatPrice(totalAmount)}
                    </span>
                  )}
                </Link>
                <Link
                  to="/history"
                  aria-current={isHistory ? "page" : undefined}
                  className={pillClasses(isHistory)}
                >
                  <History className="w-4 h-4 mr-2" aria-hidden="true" />
                  Historial
                </Link>
                {isAdmin && (
                  <Link
                    to="/reports"
                    aria-current={isReports ? "page" : undefined}
                    className={pillClasses(isReports)}
                  >
                    <BarChart2 className="w-4 h-4 mr-2" aria-hidden="true" />
                    Reportes
                  </Link>
                )}
              </nav>
            </div>

            {/* Right Controls */}
            <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
              {/* Currency Selector */}
              <Select
                value={currency}
                onValueChange={(val) => {
                  if (isDisplayCurrency(val)) setCurrency(val);
                }}
              >
                <SelectTrigger
                  aria-label="Moneda mostrada"
                  className="w-[120px] md:w-[140px] h-9 text-xs md:text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="BS">Bs (real)</SelectItem>
                  {/* Reference lenses: they restate the price at a rate we do
                      not treat as the real worth of a bolivar, so money cannot
                      be entered while one of these is selected. */}
                  <SelectItem value="BCV">Bs (BCV) · referencia</SelectItem>
                  <SelectItem value="EUR">Bs (EUR BCV) · referencia</SelectItem>
                  <SelectItem value="USDT">
                    Bs (Binance) · referencia
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* User Area */}
              {currentUser ? (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    aria-haspopup="menu"
                    aria-expanded={showUserMenu}
                    aria-label={`Menú de ${currentUser.name}`}
                    className="flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <User className="w-3 h-3 text-white" aria-hidden="true" />
                    </div>
                    <span className="hidden sm:block text-gray-700 font-medium max-w-[100px] truncate">
                      {currentUser.name.split(" ")[0]}
                    </span>
                    <span
                      className={`hidden sm:block text-meta px-1.5 py-0.5 rounded-full font-medium ${roleColor}`}
                    >
                      {roleLabel}
                    </span>
                    <ChevronDown className="w-3 h-3 text-gray-500" aria-hidden="true" />
                  </button>

                  {/* Dropdown */}
                  {showUserMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setShowUserMenu(false)}
                      />
                      <div
                        role="menu"
                        className="absolute right-0 mt-1 w-52 bg-white rounded-lg border border-gray-200 shadow-lg z-30 overflow-hidden"
                      >
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <p className="font-medium text-sm text-gray-900 truncate">
                            {currentUser.name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {currentUser.email}
                          </p>
                        </div>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowProfile(true);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <User className="w-4 h-4 text-gray-500" />
                          Mi Perfil
                        </button>
                        {isAdmin && (
                          <button
                            role="menuitem"
                            onClick={() => {
                              setShowUserMenu(false);
                              setShowUserMgmt(true);
                            }}
                            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Users className="w-4 h-4 text-gray-500" />
                            Gestionar Usuarios
                          </button>
                        )}
                        <button
                          role="menuitem"
                          onClick={() => {
                            logout();
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
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
                  className="flex items-center gap-2 h-9 px-3 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors"
                >
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden sm:block">Iniciar Sesión</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Reference lenses are view-only: prices are shown at a rate we do not
          treat as the real worth of a bolivar, so money entry is disabled. */}
      {isReferenceLens(currency) && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-2 text-center"
        >
          Viendo precios de <strong>referencia</strong>. Para cobrar o editar
          precios, cambia a <strong>USD ($)</strong> o <strong>Bs (real)</strong>.
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Principal"
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 pb-safe"
      >
        <div className="flex justify-around items-center h-14 px-1">
          {isAdmin && (
            <Link
              to="/"
              aria-current={isDashboard ? "page" : undefined}
              className={mobileTabClasses(isDashboard)}
            >
              <LayoutGrid className="w-5 h-5" aria-hidden="true" />
              <span className="text-meta font-medium">Admin</span>
            </Link>
          )}
          <Link
            to="/search"
            aria-current={isSearch ? "page" : undefined}
            className={mobileTabClasses(isSearch)}
          >
            <Search className="w-5 h-5" aria-hidden="true" />
            <span className="text-meta font-medium">Buscar</span>
          </Link>
          <Link
            to="/total"
            aria-current={isTotal ? "page" : undefined}
            className={`relative ${mobileTabClasses(isTotal)}`}
          >
            <span className="relative">
              <ShoppingCart className="w-5 h-5" aria-hidden="true" />
              {cartCount > 0 && <CartBadge count={cartCount} />}
            </span>
            <span className="text-meta font-medium">
              {totalAmount > 0 ? formatPrice(totalAmount) : "Total"}
            </span>
          </Link>
          <Link
            to="/history"
            aria-current={isHistory ? "page" : undefined}
            className={mobileTabClasses(isHistory)}
          >
            <History className="w-5 h-5" aria-hidden="true" />
            <span className="text-meta font-medium">Historial</span>
          </Link>
          {isAdmin && (
            <Link
              to="/reports"
              aria-current={isReports ? "page" : undefined}
              className={mobileTabClasses(isReports)}
            >
              <BarChart2 className="w-5 h-5" aria-hidden="true" />
              <span className="text-meta font-medium">Reportes</span>
            </Link>
          )}
        </div>
      </nav>

      {/* Spacer for the bottom nav. Must match the bar's height *and* its
          safe-area padding, or the last row of content sits under it. */}
      <div className="md:hidden h-nav-safe" />

      {/* Dialogs */}
      <LoginDialog open={showLogin} onOpenChange={setShowLogin} />
      <UserManagementDialog
        open={showUserMgmt}
        onOpenChange={setShowUserMgmt}
      />
      <ProfileDialog open={showProfile} onOpenChange={setShowProfile} />
    </>
  );
}
