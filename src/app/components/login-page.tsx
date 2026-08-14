import { useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useAuth } from "../context/auth-context";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Spinner } from "./ui/spinner";

export function LoginPage() {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Small delay for UX feel
    await new Promise((r) => setTimeout(r, 150));

    const result = await login(email.trim(), password);
    if (!result.success) {
      setError(result.error || "Error al iniciar sesión");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.svg" alt="" className="size-16 shadow-raised rounded-[24%] mb-4" aria-hidden="true" />
          <h1 className="text-[1.75rem] font-bold text-foreground tracking-tight">
            Inventario
          </h1>
          <p className="text-base text-muted-foreground mt-1">
            Inicia sesión para empezar el día
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl border border-border shadow-card p-6 md:p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-13"
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-13 pr-12"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={showPassword}
                  className="tap-target absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="size-5" aria-hidden="true" />
                  ) : (
                    <Eye className="size-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-destructive-soft rounded-xl px-4 py-3 text-[0.9375rem] text-destructive-soft-foreground">
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={loading || !email || !password}
              className="w-full mt-1"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Ingresando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="size-5" aria-hidden="true" />
                  Entrar
                </span>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              ¿No tienes acceso? Pídele una cuenta a tu administrador.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
