/**
 * Same-origin proxy to the CPMS backend.
 *
 * The browser calls `/api/cpms/<...>` and this handler forwards the request to
 * `${BACKEND_API_URL}/<...>` (preserving method, query string and JSON body),
 * then streams the upstream status and body back. Keeps the browser on a single
 * HTTPS origin while the (HTTP) backend stays server-side.
 */
import { NextRequest } from "next/server";

import { BACKEND_API_URL, BACKEND_API_URL_IS_DEFAULT, USE_MOCK } from "@/lib/config";
import { forwardResponseHeaders, responseHasBody } from "@/lib/proxy";

export const dynamic = "force-dynamic";

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;

  // CPMS_MOCK=1 үед API v2-ыг санах ой дээрх өгөгдлөөс хариулна. Динамик
  // импорт — жинхэнэ backend руу ажиллаж байгаа үед mock багц ачаалагдахгүй.
  if (USE_MOCK) {
    const { handleMock } = await import("@/lib/mock/handler");
    const body =
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await req.text().then((t) => (t ? JSON.parse(t) : undefined));
    const res = handleMock(req.method, path, req.nextUrl.search, body);
    return Response.json(res.body, { status: res.status });
  }

  const target = `${BACKEND_API_URL}/${path.join("/")}${req.nextUrl.search}`;

  // Нэвтрэлтийн толгойг заавал дамжуулна — эс бөгөөс backend бүх хүсэлтийг
  // 401 гэж буцаана. Бусад толгойг дамжуулахгүй (Host, Cookie г.м).
  const forwarded: Record<string, string> = { Accept: "application/json" };
  const auth = req.headers.get("authorization");
  if (auth) forwarded.Authorization = auth;

  const init: RequestInit = { method: req.method, headers: forwarded };
  if (req.method !== "GET" && req.method !== "HEAD") {
    // ArrayBuffer-ээр дамжуулна, текстээр БИШ. `req.text()` нь хоёртын
    // өгөгдлийг UTF-8 болгож хувиргаад зургийн файлыг эвдэнэ. Multipart-ын
    // хилийн тэмдэг нь Content-Type толгойд байдаг тул түүнийг хэвээр дамжуулна.
    const body = await req.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
      forwarded["Content-Type"] = req.headers.get("content-type") ?? "application/json";
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    // Хаягийг мессежид оруулна — «unreachable» гэдэг ганцаараа ямар хаяг
    // руу оролдсоныг хэлэхгүй тул байрлуулалтын алдаа олоход хэцүү болдог.
    const origin = new URL(BACKEND_API_URL).origin;
    const hint = BACKEND_API_URL_IS_DEFAULT
      ? " CPMS_API_URL орчны хувьсагч тавигдаагүй тул анхдагч хаяг руу хандав."
      : "";

    return Response.json(
      {
        error: {
          name: "NetworkError",
          message: `CPMS backend (${origin}) руу холбогдож чадсангүй.${hint}`,
        },
      },
      { status: 502 },
    );
  }

  /*
   * Хариуг ХООРТНООР дамжуулна, текстээр БИШ.
   *
   * `upstream.text()` нь бүх байтыг UTF-8 гэж уншдаг. Excel файл (.xlsx нь
   * ZIP архив), зураг зэрэг хоёртын өгөгдөлд UTF-8-д тохирохгүй байт олон
   * байдаг ба тэдгээр нь U+FFFD болж солигдоно — файл эвдэрч, Excel
   * «corrupted» гэж мэдэгдэнэ.
   *
   * Хүсэлтийн чиглэлд энэ алдааг дээр (`req.arrayBuffer()`) аль хэдийн
   * зассан байсан ч ХАРИУН чиглэлд үлдсэн байв.
   */
  return new Response(responseHasBody(upstream.status) ? upstream.body : null, {
    status: upstream.status,
    headers: forwardResponseHeaders(upstream.headers),
  });
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
