import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

export type UserRole = "admin" | "seller";

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  login: (email: string, password: string) => boolean;
  logout: () => void;
  addUser: (
    name: string,
    email: string,
    password: string,
    role: UserRole,
  ) => { success: boolean; error?: string };
  deleteUser: (id: string) => void;
  updateUser: (id: string, updates: Partial<Omit<User, "id">>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_USERS: User[] = [
  {
    id: "1",
    name: "Administrador Principal",
    email: "admin@inventario.com",
    password: "admin123",
    role: "admin",
  },
  {
    id: "2",
    name: "Vendedor 1",
    email: "vendedor@inventario.com",
    password: "vendedor123",
    role: "seller",
  },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>(DEFAULT_USERS);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUsers = localStorage.getItem("app_users_v2");
    const storedCurrent = localStorage.getItem("app_current_user_v2");

    if (storedUsers) {
      setUsers(JSON.parse(storedUsers));
    } else {
      // First run — seed defaults
      setUsers(DEFAULT_USERS);
      localStorage.setItem("app_users_v2", JSON.stringify(DEFAULT_USERS));
    }

    if (storedCurrent) {
      setCurrentUser(JSON.parse(storedCurrent));
    }
    // Don't auto-login; user must log in explicitly
  }, []);

  useEffect(() => {
    localStorage.setItem("app_users_v2", JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("app_current_user_v2", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("app_current_user_v2");
    }
  }, [currentUser]);

  const login = (email: string, password: string): boolean => {
    const user = users.find(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase() &&
        u.password === password,
    );
    if (user) {
      setCurrentUser(user);
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const addUser = (
    name: string,
    email: string,
    password: string,
    role: UserRole,
  ): { success: boolean; error?: string } => {
    if (!name.trim())
      return { success: false, error: "El nombre es requerido" };
    if (!email.trim())
      return { success: false, error: "El correo es requerido" };
    if (!password.trim())
      return { success: false, error: "La contraseña es requerida" };
    if (password.length < 6)
      return {
        success: false,
        error: "La contraseña debe tener al menos 6 caracteres",
      };

    const emailExists = users.some(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    );
    if (emailExists) {
      return { success: false, error: "Ya existe un usuario con ese correo" };
    }

    const newUser: User = {
      id: Date.now().toString(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role,
    };
    setUsers((prev) => [...prev, newUser]);
    return { success: true };
  };

  const deleteUser = (id: string) => {
    if (currentUser?.id === id) return; // Can't delete yourself
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const updateUser = (id: string, updates: Partial<Omit<User, "id">>) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updates } : u)),
    );
    // Keep current user in sync
    if (currentUser?.id === id) {
      setCurrentUser((prev) => (prev ? { ...prev, ...updates } : prev));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        login,
        logout,
        addUser,
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
