import { useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  X,
  Check,
  ShieldCheck,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth, UserRole, User as UserType } from "../context/auth-context";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
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

export function UserManagementPanel() {
  const { users, currentUser, registerUser, deleteUser, updateUser } =
    useAuth();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<UserRole>("seller");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [showCreatePwd, setShowCreatePwd] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("seller");
  const [editError, setEditError] = useState("");
  const [showEditPwd, setShowEditPwd] = useState(false);

  const handleCreate = () => {
    setCreateError("");
    setCreateSuccess("");
    const result = registerUser(
      createName,
      createEmail,
      createPassword,
      createRole,
    );
    if (!result.success) {
      setCreateError(result.error || "Error al crear usuario");
      return;
    }
    setCreateSuccess("Usuario creado exitosamente");
    setCreateName("");
    setCreateEmail("");
    setCreatePassword("");
    setCreateRole("seller");
    setTimeout(() => {
      setIsCreateOpen(false);
      setCreateSuccess("");
    }, 1200);
  };

  const openEdit = (user: UserType) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPassword("");
    setEditRole(user.role);
    setEditError("");
  };

  const handleEdit = () => {
    if (!editingUser) return;
    setEditError("");
    const updates: Partial<Omit<UserType, "id">> = {
      name: editName,
      email: editEmail,
      role: editRole,
    };
    if (editPassword) updates.password = editPassword;

    const result = updateUser(editingUser.id, updates);
    if (!result.success) {
      setEditError(result.error || "Error al actualizar");
      return;
    }
    setEditingUser(null);
  };

  const handleDelete = (id: string) => {
    const result = deleteUser(id);
    if (!result.success) {
      alert(result.error);
    }
    setConfirmDeleteId(null);
  };

  const roleLabel = (role: UserRole) =>
    role === "admin" ? "Administrador" : "Vendedor";

  const roleBadge = (role: UserRole) =>
    role === "admin" ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 font-medium">
        <ShieldCheck className="w-3 h-3" />
        Admin
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 font-medium">
        <User className="w-3 h-3" />
        Vendedor
      </span>
    );

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#2196F3]" />
          <h2 className="text-base font-semibold text-[#1A1A1A]">
            Gestión de Usuarios
          </h2>
          <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
            {users.length}
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setIsCreateOpen(true);
            setCreateError("");
            setCreateSuccess("");
          }}
          className="bg-[#2196F3] hover:bg-[#1976D2] text-white h-8 px-3 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Nuevo Usuario
        </Button>
      </div>

      {/* User List */}
      <div className="divide-y divide-gray-100">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50/60 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-blue-700">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {user.name}
                  </span>
                  {user.id === currentUser?.id && (
                    <span className="text-xs text-gray-400">(tú)</span>
                  )}
                  {roleBadge(user.role)}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-500 truncate">
                    {user.email}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(user)}
                className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDeleteId(user.id)}
                disabled={user.id === currentUser?.id}
                className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* CREATE Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#2196F3]" />
              Crear Nuevo Usuario
            </DialogTitle>
            <DialogDescription>
              Completa los datos para registrar un nuevo usuario en el sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Nombre completo</Label>
              <Input
                placeholder="Ej: Juan Pérez"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Correo electrónico</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="h-9 pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  type={showCreatePwd ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="h-9 pl-9 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCreatePwd ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Rol</Label>
              <Select
                value={createRole}
                onValueChange={(v: UserRole) => setCreateRole(v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="seller">Vendedor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {createError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {createError}
              </div>
            )}
            {createSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 flex items-center gap-2">
                <Check className="w-4 h-4" /> {createSuccess}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                className="flex-1 h-9"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!createName || !createEmail || !createPassword}
                className="flex-1 h-9 bg-[#2196F3] hover:bg-[#1976D2] text-white"
              >
                Crear Usuario
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT Dialog */}
      <Dialog
        open={!!editingUser}
        onOpenChange={(o) => !o && setEditingUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-[#2196F3]" />
              Editar Usuario
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Nombre completo</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Correo electrónico</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="h-9 pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">
                Nueva contraseña (dejar vacío para no cambiar)
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  type={showEditPwd ? "text" : "password"}
                  placeholder="Nueva contraseña..."
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="h-9 pl-9 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowEditPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showEditPwd ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Rol</Label>
              <Select
                value={editRole}
                onValueChange={(v: UserRole) => setEditRole(v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="seller">Vendedor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {editError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setEditingUser(null)}
                className="flex-1 h-9"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleEdit}
                className="flex-1 h-9 bg-[#2196F3] hover:bg-[#1976D2] text-white"
              >
                Guardar Cambios
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CONFIRM DELETE Dialog */}
      <Dialog
        open={!!confirmDeleteId}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">
              ¿Eliminar usuario?
            </DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. El usuario perderá todo acceso
              al sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteId(null)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// We need this icon locally
function UserPlus({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}
