/**
 * Human-facing labels and badge tones for CPMS domain enums (web).
 *
 * `tone` maps to a Tailwind color family consumed by <ToneBadge>.
 */
import type { DependencyType, ProjectStatus, WorkStatus } from "@/lib/api";

export type Tone = "gray" | "blue" | "amber" | "green" | "red";

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  planned: { label: "Planned", tone: "gray" },
  active: { label: "Active", tone: "blue" },
  on_hold: { label: "On hold", tone: "amber" },
  completed: { label: "Completed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export const WORK_STATUS: Record<WorkStatus, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "gray" },
  in_progress: { label: "In progress", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
  on_hold: { label: "On hold", tone: "amber" },
  cancelled: { label: "Cancelled", tone: "red" },
};

/**
 * Хяналтын төлвийн нэр.
 *
 * Хоёр шаттай каскадын зургаан төлөв, дээр нь хуучин v1 дэлгэцийн хоёр
 * (`pending`, `returned`). Нэрийг ТОДОРХОЙ бичнэ: «Хүлээгдэж буй» гэвэл
 * хэрэглэгч хэнийг хүлээж байгааг мэдэхгүй — талбайн инженер үү, хяналтын
 * инженер үү гэдэг нь өөр хүний ажил.
 */
export const REVIEW_STATE: Record<string, { label: string; tone: Tone }> = {
  none: { label: "Явцгүй", tone: "gray" },
  pending_check: { label: "Шалгалт хүлээж буй", tone: "amber" },
  pending_approval: { label: "Батлалт хүлээж буй", tone: "blue" },
  returned_by_site: { label: "Талбайн инженер буцаасан", tone: "red" },
  returned_by_final: { label: "Хяналтын инженер буцаасан", tone: "red" },
  approved: { label: "Батлагдсан", tone: "green" },

  // Хуучин v1 дэлгэц (даалгавар, үйл ажиллагаа) эдгээрийг хэрэглэсээр байна.
  pending: { label: "Хүлээгдэж буй", tone: "amber" },
  returned: { label: "Буцаагдсан", tone: "red" },
};

/**
 * Шалгалтын шатны нэр.
 *
 * Сервер `stageLabel`-ээр өгдөг; энэ нь зөвхөн хуучин бичлэг эсвэл
 * сервер талбарыг нь ачаалаагүй үед хэрэглэгдэх НӨӨЦ.
 */
export const INSPECTION_STAGE: Record<string, string> = {
  site_check: "Талбайн инженер шалгасан",
  final_approval: "Хяналтын инженер баталсан",
};

/**
 * Шат бүрийн ҮЙЛДЛИЙН үг.
 *
 * `INSPECTION_STAGE` нь ӨНГӨРСӨН цагийн шошго (түүхэнд «шалгасан»).
 * Товч, талбарын нэр, мэдэгдэлд ОДООГИЙН үйлдлийн үг хэрэгтэй.
 *
 * ЯАГААД САЛГАВ: 1-р шатанд ч товч «Батлах» гэж бичигдсэн байсан тул
 * дарсны дараа төлөв «шалгасан» болоход хэрэглэгч систем буруу
 * ажиллаж байна гэж ойлгодог байв. Үйлдэл зөв, үг худал байсан.
 */
export const INSPECTION_ACTION: Record<string, {
  title: string;
  verb: string;
  partial: string;
  done: string;
  pool: string;
  qty: string;
}> = {
  site_check: {
    title: "1-р шат · Шалгах",
    verb: "Шалгасан",
    partial: "Хэсэгчлэн шалгах",
    done: "Шалгалаа — хяналтын инженер рүү шилжлээ",
    pool: "Шалгах ажил",
    qty: "Шалгасан тоо хэмжээ",
  },
  final_approval: {
    title: "2-р шат · Батлах",
    verb: "Батлах",
    partial: "Хэсэгчлэн батлах",
    done: "Батлагдлаа — актад орох боломжтой",
    pool: "Батлах ажил",
    qty: "Батлах тоо хэмжээ",
  },
};

export const DEPENDENCY_TYPE: Record<DependencyType, { label: string; full: string }> = {
  FS: { label: "FS", full: "Finish → Start" },
  SS: { label: "SS", full: "Start → Start" },
  FF: { label: "FF", full: "Finish → Finish" },
  SF: { label: "SF", full: "Start → Finish" },
};

export const PROJECT_STATUS_OPTIONS = Object.keys(PROJECT_STATUS) as ProjectStatus[];
export const WORK_STATUS_OPTIONS = Object.keys(WORK_STATUS) as WorkStatus[];
export const DEPENDENCY_TYPE_OPTIONS = Object.keys(DEPENDENCY_TYPE) as DependencyType[];

/**
 * Төслийн цагийн бүс.
 *
 * ЯАГААД ТОГТМОЛ БҮС, ХӨТЧИЙНХ БИШ:
 *   1. Next.js хуудсыг СЕРВЕР дээр ч зурдаг. Серверийн бүс UTC, хэрэглэгчийн
 *      хөтөч UTC+8 бол ижил цаг хоёр өөр утга гаргаж hydration зөрнө.
 *   2. Талбайн утас, оффисын компьютер, гадаадад байгаа инженер — бүгд ИЖИЛ
 *      цаг харах ёстой. «14:20-д мэдээлсэн» гэдэг нь хэн харснаас хамаарч
 *      өөрчлөгдвөл маргаан шийдэх баримт болж чадахгүй.
 *
 * Сервер нь UTC-гээр хадгалдаг (зөв). Хөрвүүлэлт зөвхөн ХАРУУЛАХ үед.
 */
export const PROJECT_TIME_ZONE = "Asia/Ulaanbaatar";

/** Тоог бүлэглэх хэл — мянгатыг таслалаар тусгаарлана. */
export const PROJECT_LOCALE = "mn-MN";

/** `en-CA` нь YYYY-MM-DD хэлбэрийг өгдөг. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: PROJECT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: PROJECT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  // Зөвхөн хуанлийн огноо (төлөвлөсөн эхлэх/дуусах) — цагийн бүсгүй тул
  // хөрвүүлбэл өдөр нь нэгээр гулсана.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);

  return Number.isNaN(d.getTime()) ? value : DATE_FORMAT.format(d);
}

/**
 * Өнөөдрийн огноо ТӨСЛИЙН цагийн бүсээр.
 *
 * `new Date().toISOString()` нь UTC өгдөг тул Улаанбаатарын 00:00–08:00-ын
 * хооронд ӨЧИГДРИЙН огноог буцаана — маягтын анхны утга нэг өдрөөр хоцорно.
 */
export function todayInProjectZone(): string {
  return DATE_FORMAT.format(new Date());
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return `${DATE_FORMAT.format(d)} ${TIME_FORMAT.format(d)}`;
}

export function formatDays(n?: number | null): string {
  if (n === undefined || n === null) return "—";
  return `${n} хоног`;
}

/**
 * Тоо хэмжээний формат — МЯНГАТЫН орон хүртэл, түүнээс цааш үгүй.
 *
 * ЯАГААД ЯГ ГУРАВ ВЭ: барилгын хэмжилт мянгатаас нарийн гардаггүй. 12.5 м²
 * бол бодит хэмжилт, 12.500000000000002 м² бол хөвөгч таслалын алдаа.
 * Хэрэглэгч сүүлийнхийг хараад програмд итгэхээ болино.
 *
 * ЯАГААД НЭГ ГАЗАР ВЭ: урьд нь газар бүр өөрөөр бөөрөнхийлдөг байв —
 * дараалал 2 орон, блокийн хүснэгт огт бөөрөнхийлөхгүй, самбар 0 орон.
 * Нэг л тоо хоёр дэлгэц дээр өөр харагдвал аль нь зөв болохыг хэн ч
 * хэлж чадахгүй.
 *
 * Хойд тэг харуулахгүй: 12.000 биш 12 гэж бичнэ.
 */
const QTY_FORMAT = new Intl.NumberFormat(PROJECT_LOCALE, { maximumFractionDigits: 3 });

/**
 * @param value Тоо эсвэл Laravel-ийн decimal (мөр хэлбэрээр ирдэг).
 * @param unit Нэгжийг зэрэг бичих бол — "12.5 м²".
 */
export function formatQty(value?: number | string | null, unit?: string | null): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === undefined || n === null || Number.isNaN(n)) return "—";

  const text = QTY_FORMAT.format(n);

  return unit ? `${text} ${unit}` : text;
}

/**
 * Shift a plain calendar date (`YYYY-MM-DD`) by whole days.
 *
 * CPM returns day offsets from the project start, not dates. Turning those into
 * real dates is the difference between "8–12" and "10-р сарын 3 — 10-р сарын 7".
 * All arithmetic stays in UTC so a local timezone can never shift the day.
 */
export function addDays(isoDate: string | null | undefined, days: number): string | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Short label for a schedule date: "10-р сарын 3". */
export function formatShortDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  return `${Number(m[2])}-р сарын ${Number(m[3])}`;
}

/**
 * Мөнгөн дүн — төгрөгөөр, хоёр орны бутархайгүй.
 *
 * Гэрээний дүн 16,200,000₮ шиг том тоо тул бутархай нь шуугиан. Нэгж үнэ
 * хэрэгтэй үед `formatMoney(x, true)` гэж бутархайтай гаргана.
 */
export function formatMoney(value?: number | null, withCents = false): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";

  return (
    new Intl.NumberFormat(PROJECT_LOCALE, {
      minimumFractionDigits: withCents ? 2 : 0,
      maximumFractionDigits: withCents ? 2 : 0,
    }).format(value) + "₮"
  );
}

/** Ажлын ангилал — backend-ийн `Contractor::CATEGORIES`. */
export const CONTRACTOR_CATEGORIES: Record<string, string> = {
  structure: "Угсралт, бетон",
  masonry: "Өрлөг, шавардлага",
  finishing: "Дотор засал",
  facade: "Фасад, цонх",
  mep: "Цахилгаан, сантехник, ХАС",
  stone_floor: "Чулуу, шал",
  doors: "Хаалга, төмөр хийц",
  exterior: "Гадна ажил, тохижилт",
  survey: "Геодези, хэмжилт",
  other: "Бусад",
};

/** Төлөв — backend-ийн `Contractor::STATUSES`. */
export const CONTRACTOR_STATUSES: Record<string, string> = {
  active: "Ажиллаж байгаа",
  suspended: "Түр зогссон",
  terminated: "Гэрээ цуцлагдсан",
};

/**
 * Тохиролцоо бичихэд дутуу талбарууд — backend-ийн
 * `Contractor::missingContractFields()`-тэй ИЖИЛ дараалал.
 */
export function missingContractFields(c: {
  registrationNo?: string | null;
  bankAccount?: string | null;
  bankName?: string | null;
  phone?: string | null;
}): string[] {
  const out: string[] = [];
  if (!c.registrationNo) out.push("Регистрийн дугаар");
  if (!c.bankAccount) out.push("Дансны дугаар");
  if (!c.bankName) out.push("Банк");
  if (!c.phone) out.push("Холбоо барих утас");

  return out;
}

/**
 * Бетон захиалга БИЧИХ эрхтэй үүргүүд — backend-ийн
 * `ConcreteOrder::REQUESTER_ROLES`-тэй ижил байх ёстой.
 *
 * Гүйцэтгэгч ОРООГҮЙ: бетон бол захиалагчийн зардал.
 */
export const CONCRETE_ORDER_WRITER_ROLES = [
  "site_engineer",
  "project_manager",
  "general_engineer",
  "admin",
];

/**
 * БАТАЛГААЖУУЛАХ эрхтэй үүргүүд — `ConcreteOrder::CONFIRMER_ROLES`.
 *
 * Бланк дээр «Захиалагч талын хяналтын инженер» гэж бичигдсэн. Эрх
 * байсан ч ЗАХИАЛСАН ХҮН ӨӨРӨӨ баталгаажуулж чадахгүй — түүнийг сервер
 * шалгана.
 */
export const CONCRETE_ORDER_CONFIRMER_ROLES = ["inspector", "general_engineer", "admin"];

/**
 * ЗӨВХӨН ХАРАХ үүрэг эсэх (захирал).
 *
 * Серверийн ЭРХЭЭС гарна, үүргийн нэрээс биш: эрх өөрчлөгдвөл дэлгэц
 * дагаж өөрчлөгдөнө, хоёр газар жагсаалт бичихгүй.
 *
 * ЮУНД ХЭРЭГЛЭДЭГ ВЭ: үйлдлийн цэс, дарагддаг хайрцгийг нуух. Тоонууд
 * нь ҮЛДЭНЭ — «27 ажил батлахыг хүлээж байна» гэдэг нь захиралд
 * даалгавар биш, урсгал бөглөрч байгаагийн ДОХИО. Харин түүнийг
 * дарагддаг болговол хийж чадахгүй жагсаалт руу аваачна.
 */
export function isObserver(
  me: {
    canReportProgress: boolean;
    canCheck: boolean;
    canInspect: boolean;
    canApproveExtensions: boolean;
  } | null,
): boolean {
  if (!me) return false;

  return (
    !me.canReportProgress && !me.canCheck && !me.canInspect && !me.canApproveExtensions
  );
}

/**
 * Зөвшөөрөгдөх хэмжих нэгж — backend-ийн `MaterialBudgetImport::UNITS`-ийн толь.
 *
 * Энэ жагсаалтаас гадуур нэгжийг импорт татгалздаг тул гараар нэмэх үед
 * ч мөн адил хязгаарлана. Хоёр тал зөрвөл verify-mock барина.
 */
export const MATERIAL_UNITS = [
  "м",
  "м2",
  "м3",
  "ш",
  "тн",
  "кг",
  "литр",
  "шуудай",
  "б",
  "ж/х",
] as const;

/** Материалын захиалгын бланкны төрлүүд — backend-ийн `MaterialOrder::KINDS`. */
export const MATERIAL_ORDER_KINDS: Record<string, string> = {
  main: "Угсралтын үндсэн материал",
  aux: "Угсралтын туслах материал",
  timber: "Угсралтын модон материал",
  rebar: "Арматур",
};

/**
 * Материалын захиалга БИЧИХ эрх — `MaterialOrder::REQUESTER_ROLES`.
 *
 * Бетонтой ижил, зөвхөн захирал хасагдсан (тэр юу ч батлахгүй).
 */
export const MATERIAL_ORDER_WRITER_ROLES = [
  "site_engineer",
  "project_manager",
  "general_engineer",
  "admin",
];

/** БАТАЛГААЖУУЛАХ эрх — `MaterialOrder::CONFIRMER_ROLES`. */
export const MATERIAL_ORDER_CONFIRMER_ROLES = ["inspector", "general_engineer", "admin"];
