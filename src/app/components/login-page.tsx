import { useState } from "react";
import { Package, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "../context/auth-context";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

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
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-primary rounded-xl flex items-center justify-center shadow-lg mb-4">
            <Package className="w-7 h-7 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Inventario
          </h1>
          <p className="text-sm text-gray-500 font-light mt-1">
            Gestión de productos
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Iniciar sesión
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Ingresa tu correo y contraseña para continuar
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
              >
                Correo electrónico
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
              >
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 pr-10"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-10 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Ingresando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  Ingresar
                </span>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              Contacta a tu administrador para obtener acceso
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
