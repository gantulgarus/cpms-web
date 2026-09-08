/**
 * Client talks to the CPMS REST API through a same-origin Next.js proxy
 * (app/api/cpms/[...path]). This avoids CORS and HTTPS→HTTP mixed-content
 * issues: the browser only ever calls our own origin, and the Next server
 * forwards to the backend over HTTP.
 */
export const API_BASE = "/api/cpms";

/** Server-side backend origin used by the proxy route handler. */
export const BACKEND_API_URL = (
  process.env.CPMS_API_URL ?? "http://103.11.195.81:4000/api/v1"
).replace(/\/$/, "");

export const DEFAULT_PAGE_SIZE = 50;

/**
 * `CPMS_MOCK=1` үед proxy нь backend руу дамжуулахын оронд `lib/mock`-оос
 * хариулна. API v2 бэлэн болтол UI-г бодит хэмжээний өгөгдөл дээр барихад
 * зориулав. Зөвхөн серверийн орчинд уншигдана.
 */
export const USE_MOCK = process.env.CPMS_MOCK === "1";

/**
 * `NEXT_PUBLIC_CPMS_V2=1` үед API v2 дээр баригдсан дэлгэцүүд цэсэнд гарна.
 * v1 backend рүү ажиллаж байхад эдгээр хуудас хоосон буцаах тул анхдагчаар
 * нуугдсан. Mock-той хамт: `CPMS_MOCK=1 NEXT_PUBLIC_CPMS_V2=1 npm run dev`
 */
export const SHOW_V2_UI = process.env.NEXT_PUBLIC_CPMS_V2 === "1";
