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
    requestPasswordReset,
    confirmPasswordReset,
  } = useAuth();

  const [name, setName] = useState(currentUser?.name || "");
  const [nameMsg, setNameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [codeRequested, setCodeRequested] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  if (!currentUser) return null;

  const reset = () => {
    setName(currentUser.name);
    setNameMsg(null);
    setNewEmail("");
    setEmailMsg(null);
    setCodeRequested(false);
    setCode("");
    setNewPassword("");
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

  const handleRequestCode = async () => {
    setPassMsg(null);
    const result = await requestPasswordReset();
    if (result.success) {
      setCodeRequested(true);
      setPassMsg({ type: "ok", text: "Se envió un código a tu correo" });
    } else {
      setPassMsg({ type: "err", text: result.error || "Error al enviar código" });
    }
  };

  const handleConfirmPassword = async () => {
    setPassMsg(null);
    const result = await confirmPasswordReset(code, newPassword);
    if (result.success) {
      setPassMsg({ type: "ok", text: "Contraseña actualizada" });
      setCodeRequested(false);
      setCode("");
      setNewPassword("");
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
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#2196F3]" />
            Mi Perfil
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
                className="bg-[#2196F3] hover:bg-[#1976D2] text-white shrink-0"
              >
                <Save className="w-4 h-4" />
              </Button>
            </div>
            {nameMsg && (
              <p
                className={`text-xs px-2 py-1.5 rounded-md ${
                  nameMsg.type === "ok"
                    ? "text-green-700 bg-green-50 border border-green-100"
                    : "text-red-600 bg-red-50 border border-red-100"
                }`}
              >
                {nameMsg.text}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5 border-t border-gray-100 pt-4">
            <Label className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-gray-400" />
              Cambiar Correo (actual: {currentUser.email})
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
                className="bg-[#2196F3] hover:bg-[#1976D2] text-white shrink-0"
              >
                Enviar
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              Recibirás un enlace de confirmación en la nueva dirección.
            </p>
            {emailMsg && (
              <p
                className={`text-xs px-2 py-1.5 rounded-md ${
                  emailMsg.type === "ok"
                    ? "text-green-700 bg-green-50 border border-green-100"
                    : "text-red-600 bg-red-50 border border-red-100"
                }`}
              >
                {emailMsg.text}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5 border-t border-gray-100 pt-4">
            <Label className="flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-gray-400" />
              Cambiar Contraseña
            </Label>

            {!codeRequested ? (
              <Button
                onClick={handleRequestCode}
                variant="outline"
                className="w-full"
              >
                Enviar código a mi correo
              </Button>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Código de 6 dígitos"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPass ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <Button
                  onClick={handleConfirmPassword}
                  disabled={!code.trim() || newPassword.length < 6}
                  className="w-full bg-[#2196F3] hover:bg-[#1976D2] text-white"
                >
                  Confirmar Nueva Contraseña
                </Button>
              </div>
            )}

            {passMsg && (
              <p
                className={`text-xs px-2 py-1.5 rounded-md ${
                  passMsg.type === "ok"
                    ? "text-green-700 bg-green-50 border border-green-100"
                    : "text-red-600 bg-red-50 border border-red-100"
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
