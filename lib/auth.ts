"use client";

/**
 * Sanctum token-ы хадгалалт.
 *
 * v1-ийн role сонголт (`lib/role.tsx`) нь client талын дүр эсгэлт байсан.
 * Энэ нь жинхэнэ нэвтрэлт: backend token өгнө, хүсэлт бүрд `Authorization`
 * толгойгоор явна, хамрах хүрээг backend мөрдүүлнэ.
 */

const TOKEN_KEY = "cpms.token";
const USER_KEY = "cpms.user";

export interface AuthUser {
  id: number | string;
  name: string;
  role: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: AuthUser): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // хувийн горимд localStorage хаалттай байж болно
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

/**
 * Token хүчингүй болсныг мэдэгдэх суваг.
 *
 * Token нь localStorage-д үлдсэн ч сервер талд устсан байж болно — жишээ нь
 * `migrate:fresh` хийхэд `personal_access_tokens` цэвэрлэгддэг. Тэр үед апп
 * алдааны дэлгэц харуулахын оронд нэвтрэх хуудас руу буцах ёстой.
 */
const UNAUTHORIZED_EVENT = "cpms:unauthorized";

export function notifyUnauthorized(): void {
  clearSession();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
}

export function onUnauthorized(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(UNAUTHORIZED_EVENT, handler);

  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
}
