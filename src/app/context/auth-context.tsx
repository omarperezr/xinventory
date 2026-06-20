import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { supabase } from "../services/supabase";

export type UserRole = "admin" | "seller";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

type Result = { success: boolean; error?: string };

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  login: (email: string, password: string) => Promise<Result>;
  logout: () => void;
  registerUser: (
    name: string,
    email: string,
    password: string,
    role: UserRole,
  ) => Promise<Result>;
  deleteUser: (id: string) => Promise<Result>;
  updateUser: (
    id: string,
    updates: Partial<{ name: string; email: string; password: string; role: UserRole }>,
  ) => Promise<Result>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function rpcErrorMessage(message: string): string {
  switch (message) {
    case "NOT_AUTHORIZED":
      return "No tienes permisos de administrador para esta acción";
    case "EMAIL_EXISTS":
      return "Ya existe un usuario con ese correo";
    case "CANNOT_DELETE_SELF":
      return "No puedes eliminar tu propio usuario";
    default:
      return message;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const refreshUsers = async (adminId: string) => {
    const { data, error } = await supabase.rpc("list_users", {
      p_admin_id: adminId,
    });
    if (!error && data) setUsers(data as User[]);
  };

  useEffect(() => {
    const stored = localStorage.getItem("app_current_user_v2");
    if (stored) {
      const user = JSON.parse(stored) as User;
      setCurrentUser(user);
      if (user.role === "admin") refreshUsers(user.id);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("app_current_user_v2", JSON.stringify(currentUser));
      if (currentUser.role === "admin") refreshUsers(currentUser.id);
    } else {
      localStorage.removeItem("app_current_user_v2");
      setUsers([]);
    }
  }, [currentUser]);

  const login = async (email: string, password: string): Promise<Result> => {
    const { data, error } = await supabase.rpc("login_user", {
      p_email: email,
      p_password: password,
    });
    if (error || !data || data.length === 0) {
      return { success: false, error: "Correo o contraseña incorrectos" };
    }
    setCurrentUser(data[0] as User);
    return { success: true };
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const registerUser = async (
    name: string,
    email: string,
    password: string,
    role: UserRole,
  ): Promise<Result> => {
    if (!currentUser) return { success: false, error: "No autenticado" };
    if (!name.trim()) return { success: false, error: "El nombre es requerido" };
    if (!email.trim()) return { success: false, error: "El correo es requerido" };
    if (password.length < 6)
      return {
        success: false,
        error: "La contraseña debe tener al menos 6 caracteres",
      };

    const { error } = await supabase.rpc("admin_create_user", {
      p_admin_id: currentUser.id,
      p_name: name,
      p_email: email,
      p_password: password,
      p_role: role,
    });
    if (error) return { success: false, error: rpcErrorMessage(error.message) };

    await refreshUsers(currentUser.id);
    return { success: true };
  };

  const updateUser = async (
    id: string,
    updates: Partial<{ name: string; email: string; password: string; role: UserRole }>,
  ): Promise<Result> => {
    if (!currentUser) return { success: false, error: "No autenticado" };
    const target = users.find((u) => u.id === id);
    if (!target) return { success: false, error: "Usuario no encontrado" };

    const { error } = await supabase.rpc("admin_update_user", {
      p_admin_id: currentUser.id,
      p_user_id: id,
      p_name: updates.name ?? target.name,
      p_email: updates.email ?? target.email,
      p_password: updates.password || null,
      p_role: updates.role ?? target.role,
    });
    if (error) return { success: false, error: rpcErrorMessage(error.message) };

    await refreshUsers(currentUser.id);
    if (currentUser.id === id) {
      setCurrentUser((prev) =>
        prev ? { ...prev, ...updates, password: undefined } as User : prev,
      );
    }
    return { success: true };
  };

  const deleteUser = async (id: string): Promise<Result> => {
    if (!currentUser) return { success: false, error: "No autenticado" };

    const { error } = await supabase.rpc("admin_delete_user", {
      p_admin_id: currentUser.id,
      p_user_id: id,
    });
    if (error) return { success: false, error: rpcErrorMessage(error.message) };

    await refreshUsers(currentUser.id);
    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        login,
        logout,
        registerUser,
        deleteUser,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
