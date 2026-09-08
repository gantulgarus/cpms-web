/**
 * Backend прокси руу дамжуулах толгойн дүрэм.
 *
 * Маршрутын файлаас ТУСГААРЛАСАН шалтгаан: `app/api/**` доторх код нь
 * Next.js-ийн ажиллах орчинг шаарддаг тул тестээр шалгах боломжгүй. Энэ
 * хоёр функц нь цэвэр (pure) тул `verify-mock` дотор шууд шалгагдана.
 *
 * ЯАГААД ЭНЭ ЧУХАЛ ВЭ: прокси нэгэн үе хариуг `upstream.text()`-ээр уншиж
 * байсан. Тэр нь бүх байтыг UTF-8 гэж тайлдаг тул Excel файл (.xlsx нь ZIP
 * архив) эвдэрч, «corrupted» болдог байв. Мөн `Content-Disposition`
 * дамжуулагдахгүй тул татсан файл ерөнхий нэртэй хадгалагддаг байлаа.
 */

/** Backend-ээс хэрэглэгч рүү дамжих ёстой толгойнууд. */
export const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  // Татаж авах файлын нэр — энэ байхгүй бол хөтөч ерөнхий нэр өгнө.
  "content-disposition",
  "content-length",
  "cache-control",
] as const;

export function forwardResponseHeaders(upstream: Headers): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.get(name);
    if (value) headers.set(name, value);
  }

  if (!headers.has("content-type")) headers.set("content-type", "application/json");

  return headers;
}

/** 204/304-д их бие байх ёсгүй — байвал хөтөч алдаа өгнө. */
export function responseHasBody(status: number): boolean {
  return status !== 204 && status !== 304;
}
