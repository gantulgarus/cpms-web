"use client";

/**
 * App-level role / sign-in (client-side simulation; the API has no auth yet).
 *
 * The web console is used only by the head company to oversee its
 * subcontractors, so the roles here are:
 *
 *  - `admin`    — manages companies (create / edit / delete) plus everything a
 *                 director can do.
 *  - `director` — oversees projects and approves/returns reported progress.
 *  - `contractor` — records work progress (kept for compatibility; not part of
 *                 the web sign-in).
 *
 * Role starts `null` (logged out) so the login screen shows first. Once a real
 * login API exists this provider is the single place to swap it in. The choice
 * is persisted in localStorage so a refresh keeps the session.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Role = "admin" | "director" | "contractor";

const STORAGE_KEY = "cpms.role";

function isRole(value: unknown): value is Role {
  return value === "admin" || value === "director" || value === "contractor";
}

interface RoleContextValue {
  role: Role | null;
  /** True once we've read the persisted role (avoids an SSR/login flash). */
  hydrated: boolean;
  login: (role: Role) => void;
  logout: () => void;
  isAdmin: boolean;
  /** Admins can do everything directors can. */
  isDirector: boolean;
  isContractor: boolean;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount. Reading storage must happen post-
  // mount (it's unavailable during SSR), so the setState-in-effect is intended.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isRole(stored)) setRole(stored);
    setHydrated(true);
  }, []);

  const login = useCallback((next: Role) => {
    setRole(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const logout = useCallback(() => {
    setRole(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      hydrated,
      login,
      logout,
      isAdmin: role === "admin",
      isDirector: role === "admin" || role === "director",
      isContractor: role === "contractor",
    }),
    [role, hydrated, login, logout],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Админ",
  director: "Төслийн захирал",
  contractor: "Туслан гүйцэтгэгч",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Компани үүсгэх, засах болон бүх төслийг хянана.",
  director: "Төслүүдийн явцыг хянаж, гүйцэтгэлийг баталгаажуулна.",
  contractor: "Хариуцсан ажлынхаа гүйцэтгэлийг бүртгэнэ.",
};
