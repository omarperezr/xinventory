import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { supabase } from "../services/supabase";
import { idbSet } from "../utils/localdb";

export type UserRole = "admin" | "seller";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  // Sellers can only edit the selling price of a cart/historical line item
  // when this is true; admins for whom this is irrelevant are always allowed.
  canEditPrice: boolean;
}

type Result = { success: boolean; error?: string };

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  login: (email: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
  registerUser: (
    name: string,
    email: string,
    password: string,
    role: UserRole,
    canEditPrice?: boolean,
  ) => Promise<Result>;
  deleteUser: (id: string) => Promise<Result>;
  updateUser: (
    id: string,
    updates: Partial<{
      name: string;
      email: string;
      password: string;
      role: UserRole;
      canEditPrice: boolean;
    }>,
  ) => Promise<Result>;
  // Self-service profile management
  updateOwnName: (name: string) => Promise<Result>;
  requestEmailChange: (newEmail: string) => Promise<Result>;
  updateOwnPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<Result>;
  loaded: boolean;
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
    case "INVALID_INPUT":
      return "Datos inválidos";
    case "NOT_AUTHENTICATED":
      return "Sesión expirada, inicia sesión de nuevo";
    default:
      return message;
  }
}

async function callAdminUsers(body: Record<string, unknown>): Promise<Result> {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body,
  });
  if (error) {
    const message =
      readErrorField(data) ?? error.message ?? "Error desconocido";
    return { success: false, error: rpcErrorMessage(message) };
  }
  if (data?.error) {
    return { success: false, error: rpcErrorMessage(data.error) };
  }
  return { success: true };
}

/** The `profiles` row as it comes back from the database. */
interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  can_edit_price: boolean | null;
}

function mapProfile(profile: ProfileRow): User {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    canEditPrice: !!profile.can_edit_price,
  };
}

/**
 * Edge functions answer with a JSON body we do not control, so it arrives
 * untyped. Read the one field we care about rather than asserting a shape
 * onto the whole response.
 */
function readErrorField(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const value = (data as { error?: unknown }).error;
  return typeof value === "string" ? value : undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, role, can_edit_price")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) {
      setCurrentUser(null);
      return;
    }
    setCurrentUser(mapProfile(data));
  };

  const refreshUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, role, can_edit_price")
      .order("created_at");
    if (!error && data) setUsers(data.map(mapProfile));
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoaded(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setCurrentUser(null);
        setUsers([]);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loaded && currentUser?.role === "admin") refreshUsers();
  }, [loaded, currentUser?.id, currentUser?.role]);

  const login = async (email: string, password: string): Promise<Result> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { success: false, error: "Correo o contraseña incorrectos" };
    }
    return { success: true };
  };

  // Shared-till logout: the next login may be a different person, so besides
  // ending the session this wipes everything the device kept readable - the
  // open cart and saved carts (or seller B closes seller A's sale as their
  // own) and the IndexedDB caches (catalogue with buying prices, movement
  // history, ledger). The outbox keys stay untouched: queued writes replay
  // only under the session that created them (see offlineStore), so wiping
  // them would destroy unsynced sales.
  // ponytail: cache key names duplicated from offlineStore, which owns them;
  // a clearCaches() helper there is the right home for this list.
  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Server-side revocation failed (offline till); the local wipe below
      // must happen anyway.
      console.warn("No se pudo cerrar la sesión en el servidor", e);
    }
    localStorage.removeItem("xinventory-active-cart");
    localStorage.removeItem("savedCarts");
    for (const key of ["items", "item_history", "finance_entries", "finance_catalog"]) {
      try {
        // undefined reads back as a cache miss; every consumer falls back on
        // its own empty shape.
        await idbSet(key, undefined);
      } catch {
        // No IndexedDB (private mode) - then no cache was ever written.
      }
    }
    // The providers above the login screen stay mounted, so the cart, item
    // and ledger state also live on in React memory; a reload is the one
    // reliable way to drop all of it.
    window.location.reload();
  };

  const registerUser = async (
    name: string,
    email: string,
    password: string,
    role: UserRole,
    canEditPrice?: boolean,
  ): Promise<Result> => {
    if (!name.trim()) return { success: false, error: "El nombre es requerido" };
    if (!email.trim()) return { success: false, error: "El correo es requerido" };
    if (password.length < 6)
      return {
        success: false,
        error: "La contraseña debe tener al menos 6 caracteres",
      };

    const result = await callAdminUsers({
      action: "create",
      name,
      email,
      password,
      role,
      canEditPrice: !!canEditPrice,
    });
    if (result.success) await refreshUsers();
    return result;
  };

  const updateUser = async (
    id: string,
    updates: Partial<{
      name: string;
      email: string;
      password: string;
      role: UserRole;
      canEditPrice: boolean;
    }>,
  ): Promise<Result> => {
    if (updates.password && updates.password.length < 6) {
      return {
        success: false,
        error: "La contraseña debe tener al menos 6 caracteres",
      };
    }
    const result = await callAdminUsers({ action: "update", id, ...updates });
    if (result.success) {
      await refreshUsers();
      if (currentUser?.id === id) await loadProfile(id);
    }
    return result;
  };

  const deleteUser = async (id: string): Promise<Result> => {
    const result = await callAdminUsers({ action: "delete", id });
    if (result.success) await refreshUsers();
    return result;
  };

  // Self-service profile management

  const updateOwnName = async (name: string): Promise<Result> => {
    if (!currentUser) return { success: false, error: "No autenticado" };
    if (!name.trim()) return { success: false, error: "El nombre es requerido" };
    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim() })
      .eq("id", currentUser.id);
    if (error) return { success: false, error: error.message };
    await loadProfile(currentUser.id);
    return { success: true };
  };

  // Supabase sends a confirmation link to the NEW address; the email only
  // updates (and our profiles row syncs via trigger) once the user clicks it.
  const requestEmailChange = async (newEmail: string): Promise<Result> => {
    if (!newEmail.trim()) return { success: false, error: "El correo es requerido" };
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  // A session alone must not be enough to change the password: Supabase's
  // "secure password change" is off by default, so an unattended logged-in
  // till would otherwise be a one-minute account takeover. Re-proving the
  // current password (a fresh sign-in with the same account) closes that.
  const updateOwnPassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<Result> => {
    if (!currentUser) return { success: false, error: "No autenticado" };
    if (newPassword.length < 6)
      return {
        success: false,
        error: "La contraseña debe tener al menos 6 caracteres",
      };
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword,
    });
    if (reauthError)
      return { success: false, error: "La contraseña actual es incorrecta" };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: error.message };
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
        updateOwnName,
        requestEmailChange,
        updateOwnPassword,
        loaded
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
