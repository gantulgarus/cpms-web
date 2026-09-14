/**
 * Fetch wrapper for the CPMS API, routed through the same-origin proxy.
 *
 * Unwrapping of the `{ data }` / `{ data, meta }` envelopes happens in the
 * endpoint helpers; this layer handles URL building, JSON bodies, and turning
 * the `{ error: { name, message } }` envelope into a thrown `ApiError`.
 */
import { getToken, notifyUnauthorized } from "@/lib/auth";
import { API_BASE } from "@/lib/config";
import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly apiName: string;
  readonly details?: unknown;

  constructor(status: number, name: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.apiName = name || "ApiError";
    this.details = details;
  }
}

type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { query, body, signal } = options;

  // Токеныг proxy руу дамжуулна; proxy нь backend руу цааш нь дамжуулна.
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      signal,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "NetworkError", "Could not reach the CPMS server.");
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();

  /*
   * Хариу JSON биш байж БОЛНО.
   *
   * Nginx-ийн 404/502 хуудас, Laravel-ийн сүйрлийн хуудас, эсвэл Next-ийн
   * өөрийн 404 нь бүгд HTML буцаадаг. `JSON.parse` шууд дуудвал
   * «Unexpected token '<'» гэсэн хэрэглэгчид ямар ч утгагүй мессеж гарч,
   * жинхэнэ шалтгаан (статус код) нуугдана.
   */
  let json: unknown;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
      throw new ApiError(
        response.status,
        "InvalidResponse",
        `Сервер JSON биш хариу буцаалаа (${response.status}). ` +
          `Хаяг эсвэл серверийн тохиргоог шалгана уу. Хариу: ${snippet}`,
      );
    }
  }

  if (!response.ok) {
    // Token хүчингүй болсон бол сесс цэвэрлэж, нэвтрэх дэлгэц рүү буцаана.
    // Хадгалагдсан token нь сервер дээр байхгүй байж болно (жишээ нь
    // `migrate:fresh` хийсний дараа) — тэр үед алдаа харуулах нь утгагүй.
    if (response.status === 401) notifyUnauthorized();

    const err = (json as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      response.status,
      err?.name ?? "ApiError",
      err?.message ?? `Request failed (${response.status})`,
      err?.details,
    );
  }

  return json as T;
}
