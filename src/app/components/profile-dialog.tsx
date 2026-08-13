import { useState } from "react";
import { User, Mail, KeyRound, Save, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/auth-context";
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

export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const {
    currentUser,
    updateOwnName,
    requestEmailChange,
    updateOwnPassword,
  } = useAuth();

  const [name, setName] = useState(currentUser?.name || "");
  const [nameMsg, setNameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  if (!currentUser) return null;

  const reset = () => {
    setName(currentUser.name);
    setNameMsg(null);
    setNewEmail("");
    setEmailMsg(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPassMsg(null);
  };

  const handleSaveName = async () => {
    setNameMsg(null);
    const result = await updateOwnName(name);
    setNameMsg(
      result.success
        ? { type: "ok", text: "Nombre actualizado" }
        : { type: "err", text: result.error || "Error al actualizar nombre" },
    );
  };

  const handleRequestEmail = async () => {
    setEmailMsg(null);
    const result = await requestEmailChange(newEmail);
    setEmailMsg(
      result.success
        ? { type: "ok", text: "Se envió un correo de confirmación a la nueva dirección" }
        : { type: "err", text: result.error || "Error al solicitar cambio de correo" },
    );
  };

  const handleUpdatePassword = async () => {
    setPassMsg(null);
    if (newPassword !== confirmPassword) {
      setPassMsg({ type: "err", text: "Las contraseñas no coinciden" });
      return;
    }
    const result = await updateOwnPassword(currentPassword, newPassword);
    if (result.success) {
      setPassMsg({ type: "ok", text: "Contraseña actualizada" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setPassMsg({ type: "err", text: result.error || "Error al actualizar contraseña" });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="size-5 text-primary" aria-hidden="true" />
            Mi perfil
          </DialogTitle>
          <DialogDescription>
            Actualiza tu nombre, correo o contraseña
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Button
                onClick={handleSaveName}
                disabled={!name.trim() || name === currentUser.name}
                className="shrink-0"
              >
                <Save className="size-4" aria-hidden="true" />
              </Button>
            </div>
            {nameMsg && (
              <p
                className={`text-sm px-3.5 py-2.5 rounded-lg ${
                  nameMsg.type === "ok"
                    ? "text-primary-soft-foreground bg-primary-soft"
                    : "text-destructive-soft-foreground bg-destructive-soft"
                }`}
              >
                {nameMsg.text}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5 border-t border-border pt-4">
            <Label className="flex items-center gap-1.5">
              <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Cambiar correo (actual: {currentUser.email})
            </Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="nuevo@correo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <Button
                onClick={handleRequestEmail}
                disabled={!newEmail.trim()}
                className="shrink-0"
              >
                Enviar
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Recibirás un enlace de confirmación en la nueva dirección.
            </p>
            {emailMsg && (
              <p
                className={`text-sm px-3.5 py-2.5 rounded-lg ${
                  emailMsg.type === "ok"
                    ? "text-primary-soft-foreground bg-primary-soft"
                    : "text-destructive-soft-foreground bg-destructive-soft"
                }`}
              >
                {emailMsg.text}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5 border-t border-border pt-4">
            <Label className="flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Cambiar contraseña
            </Label>

            <div className="space-y-2">
              {/* The current password is required server-side (re-auth in
                  updateOwnPassword), so an unattended session can't be
                  hijacked into a new password. */}
              <Input
                type={showPass ? "text" : "password"}
                placeholder="Contraseña actual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="Nueva contraseña"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPass}
                  className="tap-target absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPass ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <Input
                type={showPass ? "text" : "password"}
                placeholder="Confirmar contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <Button
                onClick={handleUpdatePassword}
                disabled={
                  !currentPassword ||
                  newPassword.length < 6 ||
                  newPassword !== confirmPassword
                }
                className="w-full"
              >
                Actualizar contraseña
              </Button>
            </div>

            {passMsg && (
              <p
                className={`text-sm px-3.5 py-2.5 rounded-lg ${
                  passMsg.type === "ok"
                    ? "text-primary-soft-foreground bg-primary-soft"
                    : "text-destructive-soft-foreground bg-destructive-soft"
                }`}
              >
                {passMsg.text}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
