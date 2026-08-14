import { useState } from "react";
import {
  Store,
  ShoppingCart,
  History,
  Boxes,
  Menu,
  BarChart2,
  Banknote,
  Megaphone,
  LogOut,
  User,
  Users,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Shield,
  Tag,
  Check,
  RefreshCcw,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  useApp,
  isReferenceLens,
  formatMoneyValue,
  DisplayCurrency,
} from "../context/app-context";
import { useAuth, UserRole } from "../context/auth-context";
import { MODULE_FINANZAS, MODULE_REPORTES, MODULE_REDES } from "../modules";
import { ProfileDialog } from "./profile-dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

// Desktop nav pill. Active = soft green, unmistakable at a glance.
const navPillClasses = (active: boolean) =>
  `flex shrink-0 items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
    active
      ? "bg-primary-soft text-primary-soft-foreground"
      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
  }`;

// Dialog tab strip pill (user management).
const pillClasses = (active: boolean) =>
  `flex items-center justify-center px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
    active ? "bg-white text-primary shadow-card" : "text-muted-foreground hover:text-foreground"
  }`;

const mobileTabClasses = (active: boolean) =>
  `relative flex flex-col items-center justify-center flex-1 h-full gap-1 rounded-xl transition-colors ${
    active ? "text-primary" : "text-muted-foreground"
  }`;

// The count alone reads as a bare number to a screen reader, so the badge
// carries its own wording and the digits are left to sighted users.
function CartBadge({ count }: { count: number }) {
  return (
    <span className="absolute -top-2 -right-2.5 min-w-[20px] h-5 px-1 flex items-center justify-center text-meta font-bold text-white bg-destructive rounded-full">
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{count} artículos en el total</span>
    </span>
  );
}

const CURRENCY_OPTIONS: {
  value: DisplayCurrency;
  title: string;
  detail: (rates: { USD: number; EUR: number; USDT: number }, honest: number) => string;
  reference?: boolean;
}[] = [
  {
    value: "USD",
    title: "Dólares ($)",
    detail: () => "Precios en dólares",
  },
  {
    value: "BS",
    title: "Bolívares (tasa real)",
    detail: (_r, honest) => `Bs ${formatMoneyValue(honest)} por $1`,
  },
  {
    value: "BCV",
    title: "Bs a tasa BCV",
    detail: (r) => `Bs ${formatMoneyValue(r.USD)} por $1`,
    reference: true,
  },
  {
    value: "EUR",
    title: "Bs a tasa EUR (BCV)",
    detail: (r) => `Bs ${formatMoneyValue(r.EUR)} por €1`,
    reference: true,
  },
  {
    value: "USDT",
    title: "Bs a tasa Binance",
    detail: (r) => `Bs ${formatMoneyValue(r.USDT)} por $1`,
    reference: true,
  },
];

// Currency picker: one big labeled row per option instead of a dense select.
// Reference lenses are visibly a separate, "look but don't charge" group.
function CurrencyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { currency, setCurrency, rates, honestRate } = useApp();

  const row = (opt: (typeof CURRENCY_OPTIONS)[number]) => {
    const active = currency === opt.value;
    return (
      <button
        key={opt.value}
        type="button"
        onClick={() => {
          setCurrency(opt.value);
          onOpenChange(false);
        }}
        aria-pressed={active}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors ${
          active
            ? "border-primary bg-primary-soft"
            : "border-border bg-white hover:bg-secondary"
        }`}
      >
        <span className="min-w-0">
          <span className="block font-semibold text-foreground">{opt.title}</span>
          <span className="block text-sm text-muted-foreground" data-money>
            {opt.detail(rates, honestRate)}
          </span>
        </span>
        {active && <Check className="size-6 shrink-0 text-primary" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Cómo mostrar los precios?</DialogTitle>
          <DialogDescription>
            Los precios se guardan en dólares; el bolívar se calcula con la tasa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {CURRENCY_OPTIONS.filter((o) => !o.reference).map(row)}
        </div>

        <div className="mt-1 grid gap-2">
          <p className="text-sm font-semibold text-pending">
            Solo para consultar — con estas tasas no se puede cobrar
          </p>
          {CURRENCY_OPTIONS.filter((o) => o.reference).map(row)}
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gestión de Usuarios</DialogTitle>
          <DialogDescription>
            Administra quién entra al sistema y qué puede hacer
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div role="tablist" className="flex gap-1 bg-secondary p-1 rounded-lg mt-1">
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
                className="flex items-center justify-between p-3 bg-canvas rounded-xl border border-border"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      u.role === "admin"
                        ? "bg-secondary text-foreground"
                        : "bg-primary-soft text-primary-soft-foreground"
                    }`}
                  >
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-foreground truncate flex items-center gap-1.5">
                      {u.name}
                      {u.id === currentUser?.id && (
                        <span className="text-meta bg-primary-soft text-primary-soft-foreground px-1.5 py-0.5 rounded font-semibold">
                          Tú
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
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
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        Editar precio
                      </span>
                    </label>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${
                      u.role === "admin"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-primary-soft text-primary-soft-foreground"
                    }`}
                  >
                    <RoleIcon r={u.role} />
                    {roleLabel(u.role)}
                  </span>
                  {u.id !== currentUser?.id && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Eliminar usuario ${u.name}`}
                      onClick={async () => { await deleteUser(u.id); }}
                      className="tap-target text-destructive hover:text-destructive hover:bg-destructive-soft"
                    >
                      <Trash2 aria-hidden="true" />
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
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={
                    showPass ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={showPass}
                  className="tap-target absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPass ? (
                    <EyeOff className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    <Eye className="w-5 h-5" aria-hidden="true" />
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
                      <Tag className="w-4 h-4 text-primary" />
                      Vendedor
                    </span>
                  </SelectItem>
                  <SelectItem value="admin">
                    <span className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-foreground" />
                      Administrador
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {role === "seller" && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none bg-canvas border border-border rounded-xl px-3.5 py-3">
                <Checkbox
                  checked={canEditPrice}
                  onCheckedChange={(c) => setCanEditPrice(c as boolean)}
                />
                <span className="text-[0.9375rem] text-foreground">
                  Permitir modificar precio de venta
                </span>
              </label>
            )}

            {error && (
              <p className="text-sm text-destructive-soft-foreground bg-destructive-soft px-3.5 py-2.5 rounded-lg">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-primary-soft-foreground bg-primary-soft px-3.5 py-2.5 rounded-lg">
                {success}
              </p>
            )}

            <Button onClick={handleCreate} className="w-full">
              <Plus aria-hidden="true" />
              Crear Usuario
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// "Más" sheet: everything that does not deserve a permanent tab. Modules,
// profile, currency, session — each a full-width labeled row.
function MoreSheet({
  open,
  onOpenChange,
  onOpenCurrency,
  onOpenProfile,
  onOpenUserMgmt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenCurrency: () => void;
  onOpenProfile: () => void;
  onOpenUserMgmt: () => void;
}) {
  const location = useLocation();
  const { currency, honestRate } = useApp();
  const { currentUser, logout } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const close = () => onOpenChange(false);

  const linkRow = (
    to: string,
    icon: React.ReactNode,
    title: string,
    detail: string,
  ) => (
    <Link
      to={to}
      onClick={close}
      aria-current={location.pathname === to ? "page" : undefined}
      className="flex items-center gap-3.5 rounded-xl border border-border bg-white px-4 py-3.5 transition-colors hover:bg-secondary"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-border-strong" aria-hidden="true" />
    </Link>
  );

  const actionRow = (
    onClick: () => void,
    icon: React.ReactNode,
    title: string,
    detail: string,
  ) => (
    <button
      type="button"
      onClick={() => {
        close();
        onClick();
      }}
      className="flex w-full items-center gap-3.5 rounded-xl border border-border bg-white px-4 py-3.5 text-left transition-colors hover:bg-secondary"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-border-strong" aria-hidden="true" />
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Más opciones</DialogTitle>
          {currentUser && (
            <DialogDescription>
              {currentUser.name} ·{" "}
              {isAdmin ? "Administrador" : "Vendedor"}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid gap-2">
          {MODULE_FINANZAS &&
            linkRow(
              "/finance",
              <Banknote className="size-5" aria-hidden="true" />,
              "Finanzas",
              "Cuentas, gastos y compras",
            )}
          {MODULE_REPORTES &&
            isAdmin &&
            linkRow(
              "/reports",
              <BarChart2 className="size-5" aria-hidden="true" />,
              "Reportes",
              "Ventas, productos y proyección",
            )}
          {MODULE_REDES &&
            isAdmin &&
            linkRow(
              "/social",
              <Megaphone className="size-5" aria-hidden="true" />,
              "Redes",
              "Calendario de publicaciones",
            )}

          {actionRow(
            onOpenCurrency,
            <RefreshCcw className="size-5" aria-hidden="true" />,
            "Moneda y tasa",
            isReferenceLens(currency)
              ? "Viendo tasa de referencia"
              : `Bs ${formatMoneyValue(honestRate)} por $1`,
          )}
          {actionRow(
            onOpenProfile,
            <User className="size-5" aria-hidden="true" />,
            "Mi perfil",
            "Tu nombre y contraseña",
          )}
          {isAdmin &&
            actionRow(
              onOpenUserMgmt,
              <Users className="size-5" aria-hidden="true" />,
              "Usuarios",
              "Crear y administrar personal",
            )}

          <button
            type="button"
            onClick={() => {
              close();
              logout();
            }}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-3.5 font-semibold text-destructive transition-colors hover:bg-destructive-soft"
          >
            <LogOut className="size-5" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Main Header
export function InventoryHeader() {
  const location = useLocation();
  const { currency, cartItems, honestRate } = useApp();
  const { currentUser, logout } = useAuth();

  const cartCount = cartItems.reduce((sum, i) => sum + i.cartQuantity, 0);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const isAdmin = currentUser?.role === "admin";
  const isDashboard = location.pathname === "/";
  const isSearch = location.pathname === "/search";
  const isTotal = location.pathname === "/total";
  const isHistory = location.pathname === "/history";
  const isReports = location.pathname === "/reports";
  const isFinance = location.pathname === "/finance";
  const isSocial = location.pathname === "/social";

  const lens = isReferenceLens(currency);

  return (
    <>
      {/* Top Header */}
      <header className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 md:h-[4.5rem] flex items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3 xl:gap-5 min-w-0">
            <Link to="/search" className="flex items-center gap-2.5 shrink-0">
              <img src="/logo.svg" alt="" className="size-10" aria-hidden="true" />
              <span className="text-lg font-bold tracking-tight text-foreground">
                Inventario
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav aria-label="Principal" className="hidden md:flex items-center gap-0.5 xl:gap-1 min-w-0 overflow-x-auto">
              <Link
                to="/search"
                aria-current={isSearch ? "page" : undefined}
                className={navPillClasses(isSearch)}
              >
                <Store className="size-[1.125rem]" aria-hidden="true" />
                Vender
              </Link>
              <Link
                to="/total"
                aria-current={isTotal ? "page" : undefined}
                className={`relative ${navPillClasses(isTotal)}`}
              >
                <span className="relative">
                  <ShoppingCart className="size-[1.125rem]" aria-hidden="true" />
                  {cartCount > 0 && <CartBadge count={cartCount} />}
                </span>
                Cobrar
              </Link>
              <Link
                to="/history"
                aria-current={isHistory ? "page" : undefined}
                className={navPillClasses(isHistory)}
              >
                <History className="size-[1.125rem]" aria-hidden="true" />
                Historial
              </Link>
              {isAdmin && (
                <Link
                  to="/"
                  aria-current={isDashboard ? "page" : undefined}
                  className={navPillClasses(isDashboard)}
                >
                  <Boxes className="size-[1.125rem]" aria-hidden="true" />
                  Inventario
                </Link>
              )}
              {MODULE_FINANZAS && (
                <Link
                  to="/finance"
                  aria-current={isFinance ? "page" : undefined}
                  className={navPillClasses(isFinance)}
                >
                  <Banknote className="size-[1.125rem]" aria-hidden="true" />
                  Finanzas
                </Link>
              )}
              {MODULE_REPORTES && isAdmin && (
                <Link
                  to="/reports"
                  aria-current={isReports ? "page" : undefined}
                  className={navPillClasses(isReports)}
                >
                  <BarChart2 className="size-[1.125rem]" aria-hidden="true" />
                  Reportes
                </Link>
              )}
              {MODULE_REDES && isAdmin && (
                <Link
                  to="/social"
                  aria-current={isSocial ? "page" : undefined}
                  className={navPillClasses(isSocial)}
                >
                  <Megaphone className="size-[1.125rem]" aria-hidden="true" />
                  Redes
                </Link>
              )}
            </nav>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Day-rate chip: the number staff quotes all day, one tap away
                from changing how prices are shown. */}
            <button
              type="button"
              onClick={() => setShowCurrency(true)}
              aria-label="Cambiar moneda y tasa"
              data-money
              className={`flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                lens
                  ? "border-pending-strong bg-pending-soft text-pending"
                  : "border-border bg-white text-foreground hover:bg-secondary"
              }`}
            >
              {lens ? (
                <>Referencia</>
              ) : (
                <>
                  $1
                  <span className="text-border-strong" aria-hidden="true">=</span>
                  Bs {formatMoneyValue(honestRate)}
                </>
              )}
              <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
            </button>

            {/* User menu (desktop; phones reach these through Más) */}
            {currentUser && (
              <div className="relative hidden md:block">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  aria-haspopup="menu"
                  aria-expanded={showUserMenu}
                  aria-label={`Menú de ${currentUser.name}`}
                  className="flex items-center gap-2 h-10 px-2.5 rounded-lg border border-border hover:bg-secondary transition-colors text-sm"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-foreground font-semibold max-w-[110px] truncate">
                    {currentUser.name.split(" ")[0]}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                </button>

                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setShowUserMenu(false)}
                    />
                    <div
                      role="menu"
                      className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl border border-border shadow-raised z-30 overflow-hidden"
                    >
                      <div className="px-4 py-3 bg-canvas border-b border-border">
                        <p className="font-semibold text-sm text-foreground truncate">
                          {currentUser.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {currentUser.email} · {isAdmin ? "Administrador" : "Vendedor"}
                        </p>
                      </div>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowProfile(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-[0.9375rem] text-foreground hover:bg-secondary transition-colors"
                      >
                        <User className="size-4.5 text-muted-foreground" aria-hidden="true" />
                        Mi Perfil
                      </button>
                      {isAdmin && (
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowUserMgmt(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-4 py-3 text-[0.9375rem] text-foreground hover:bg-secondary transition-colors"
                        >
                          <Users className="size-4.5 text-muted-foreground" aria-hidden="true" />
                          Gestionar Usuarios
                        </button>
                      )}
                      <button
                        role="menuitem"
                        onClick={() => {
                          logout();
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-[0.9375rem] text-destructive hover:bg-destructive-soft transition-colors border-t border-border"
                      >
                        <LogOut className="size-4.5" aria-hidden="true" />
                        Cerrar Sesión
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Reference lenses are view-only: prices are shown at a rate we do not
          treat as the real worth of a bolivar, so money entry is disabled. */}
      {lens && (
        <div
          role="status"
          className="bg-pending-soft border-b border-pending-strong/40 text-pending text-sm font-medium px-4 py-2 text-center"
        >
          Estás viendo precios de <strong>referencia</strong>. Para cobrar,
          cambia a <strong>$</strong> o <strong>Bs (tasa real)</strong>.
        </div>
      )}

      {/* Mobile Bottom Navigation: at most five doors, every door labeled. */}
      <nav
        aria-label="Principal"
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50 pb-safe"
      >
        <div className="flex items-stretch justify-around h-[4.25rem] px-1.5 py-1.5 gap-1">
          <Link
            to="/search"
            aria-current={isSearch ? "page" : undefined}
            className={mobileTabClasses(isSearch)}
          >
            <Store className="size-6" aria-hidden="true" strokeWidth={isSearch ? 2.25 : 1.75} />
            <span className={`text-meta ${isSearch ? "font-bold" : "font-medium"}`}>Vender</span>
          </Link>
          <Link
            to="/total"
            aria-current={isTotal ? "page" : undefined}
            className={mobileTabClasses(isTotal)}
          >
            <span className="relative">
              <ShoppingCart className="size-6" aria-hidden="true" strokeWidth={isTotal ? 2.25 : 1.75} />
              {cartCount > 0 && <CartBadge count={cartCount} />}
            </span>
            <span className={`text-meta ${isTotal ? "font-bold" : "font-medium"}`}>Cobrar</span>
          </Link>
          <Link
            to="/history"
            aria-current={isHistory ? "page" : undefined}
            className={mobileTabClasses(isHistory)}
          >
            <History className="size-6" aria-hidden="true" strokeWidth={isHistory ? 2.25 : 1.75} />
            <span className={`text-meta ${isHistory ? "font-bold" : "font-medium"}`}>Historial</span>
          </Link>
          {isAdmin && (
            <Link
              to="/"
              aria-current={isDashboard ? "page" : undefined}
              className={mobileTabClasses(isDashboard)}
            >
              <Boxes className="size-6" aria-hidden="true" strokeWidth={isDashboard ? 2.25 : 1.75} />
              <span className={`text-meta ${isDashboard ? "font-bold" : "font-medium"}`}>Inventario</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setShowMore(true)}
            aria-haspopup="dialog"
            className={mobileTabClasses(showMore)}
          >
            <Menu className="size-6" aria-hidden="true" strokeWidth={1.75} />
            <span className="text-meta font-medium">Más</span>
          </button>
        </div>
      </nav>

      {/* Bottom-nav clearance lives on <main> (padding-bottom in App.tsx): a
          spacer here sits at the TOP of the page flow and just pushes the
          first content down without protecting the last row. */}

      {/* Dialogs */}
      <CurrencyDialog open={showCurrency} onOpenChange={setShowCurrency} />
      <MoreSheet
        open={showMore}
        onOpenChange={setShowMore}
        onOpenCurrency={() => setShowCurrency(true)}
        onOpenProfile={() => setShowProfile(true)}
        onOpenUserMgmt={() => setShowUserMgmt(true)}
      />
      <UserManagementDialog
        open={showUserMgmt}
        onOpenChange={setShowUserMgmt}
      />
      <ProfileDialog open={showProfile} onOpenChange={setShowProfile} />
    </>
  );
}
