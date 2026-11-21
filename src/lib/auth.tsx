import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery as useTanstackQuery, useQueryClient } from "@tanstack/react-query";
import { onUnauthenticated, request } from "@/lib/api.ts";
import { canEditSection, canViewSection } from "@shared/constants.ts";
import type { Permissions, Role, Section } from "@shared/constants.ts";

export type SessionUser = {
  _id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permissions;
};

export type BusinessSettings = {
  businessName: string;
  currency: string;
  locale: string;
  timezone: string;
};

type Me = {
  user: SessionUser | null;
  adminModeUntil?: number | null;
  needsSetup: boolean;
  settings: BusinessSettings;
};

export const ME_KEY = ["auth", "me"] as const;

type AuthContextValue = {
  /** undefined while the first check is in flight */
  me: Me | undefined;
  user: SessionUser | null;
  settings: BusinessSettings;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  setup: (input: { name: string; email: string; password: string }) => Promise<void>;
  acceptLink: (token: string, input: { password: string; name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  adminModeUntil: number | null;
  enterAdminMode: (password: string) => Promise<void>;
  exitAdminMode: () => Promise<void>;
};

const DEFAULT_SETTINGS: BusinessSettings = { businessName: "Auriance Ops", currency: "USD", locale: "en-US", timezone: "UTC" };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: me } = useTanstackQuery({
    queryKey: ME_KEY,
    queryFn: () => request<Me>("GET", "/api/auth/me"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 3,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ME_KEY });
  }, [queryClient]);

  // Signed in fresh (or out): drop every cached result from the previous session
  const restart = useCallback(async () => {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
    await refresh();
  }, [queryClient, refresh]);

  useEffect(() => onUnauthenticated(() => void refresh()), [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      user: me?.user ?? null,
      settings: me?.settings ?? DEFAULT_SETTINGS,
      refresh,
      login: async (email, password) => {
        await request("POST", "/api/auth/login", { email, password });
        await restart();
      },
      setup: async (input) => {
        await request("POST", "/api/auth/setup", input);
        await restart();
      },
      acceptLink: async (token, input) => {
        await request("POST", `/api/auth/link/${encodeURIComponent(token)}`, input);
        await restart();
      },
      logout: async () => {
        try {
          await request("POST", "/api/auth/logout");
        } finally {
          queryClient.clear();
          await refresh();
        }
      },
      changePassword: async (currentPassword, newPassword) => {
        await request("POST", "/api/auth/change-password", { currentPassword, newPassword });
      },
      adminModeUntil: me?.adminModeUntil ?? null,
      enterAdminMode: async (password) => {
        const res = await request<{ adminModeUntil: number }>("POST", "/api/auth/admin-mode", { password });
        queryClient.setQueryData<Me>(ME_KEY, (old) => (old ? { ...old, adminModeUntil: res.adminModeUntil } : old));
      },
      exitAdminMode: async () => {
        queryClient.setQueryData<Me>(ME_KEY, (old) => (old ? { ...old, adminModeUntil: null } : old));
        await request("DELETE", "/api/auth/admin-mode");
      },
    }),
    [me, refresh, restart, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** The signed-in user with permission helpers. */
export function useCurrentUser() {
  const { user } = useAuth();
  const permissions = user?.permissions;
  return {
    user,
    permissions,
    isLoading: false,
    isAdmin: user?.role === "admin",
    /** Orders: Edit (create, edit, cancel, hold, swap, re-record). */
    canChangeStatus: permissions ? canEditSection(permissions, "orders") : false,
    /** Ship orders and record returns. */
    canShip: permissions
      ? canEditSection(permissions, "orders") && permissions.canShipAndReturn
      : false,
    /** At least View access. */
    canAccess: (section: Section) =>
      permissions ? canViewSection(permissions, section) : false,
    canEdit: (section: Section) =>
      permissions ? canEditSection(permissions, section) : false,
    /** Cost prices and stock value. */
    canSeeCost: permissions
      ? canViewSection(permissions, "finance") ||
        canEditSection(permissions, "inventory")
      : false,
  };
}

/** Current time, ticking every `ms` (for countdowns). */
function useNow(ms: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}

/**
 * Admin Mode: an admin re-enters their password to unlock destructive actions
 * for 15 minutes. The server enforces it; this mirrors the state for the UI.
 */
export function useAdminMode() {
  const { user, adminModeUntil, enterAdminMode, exitAdminMode, refresh } = useAuth();
  const now = useNow(1000, adminModeUntil !== null);
  const remainingMs = adminModeUntil ? Math.max(0, adminModeUntil - now) : 0;
  const isAdminMode = user?.role === "admin" && remainingMs > 0;
  useEffect(() => {
    // Expired locally: re-sync with the server
    if (adminModeUntil !== null && remainingMs === 0) void refresh();
  }, [adminModeUntil, remainingMs, refresh]);
  return { isAdminMode, remainingMs, enterAdminMode, exitAdminMode };
}
