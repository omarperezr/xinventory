import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

export type UserRole = "admin" | "user";

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  login: (userId: string) => void;
  logout: () => void;
  addUser: (name: string, role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_USERS: User[] = [
  { id: "1", name: "Administrador Principal", role: "admin" },
  { id: "2", name: "Vendedor 1", role: "user" },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>(DEFAULT_USERS);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUsers = localStorage.getItem("app_users");
    const storedCurrent = localStorage.getItem("app_current_user");

    if (storedUsers) setUsers(JSON.parse(storedUsers));
    if (storedCurrent) setCurrentUser(JSON.parse(storedCurrent));
    else setCurrentUser(DEFAULT_USERS[0]); // Default to admin for convenience
  }, []);

  useEffect(() => {
    localStorage.setItem("app_users", JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("app_current_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("app_current_user");
    }
  }, [currentUser]);

  const login = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (user) setCurrentUser(user);
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const addUser = (name: string, role: UserRole) => {
    const newUser: User = {
      id: Date.now().toString(),
      name,
      role,
    };
    setUsers([...users, newUser]);
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, users, login, logout, addUser }}
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
