/**
 * Human-facing labels and badge tones for CPMS domain enums (web).
 *
 * `tone` maps to a Tailwind color family consumed by <ToneBadge>.
 */
import type { DependencyType, ProjectStatus, WorkStatus } from "@/lib/api";
import type { ReviewState } from "@/lib/approval";

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

export const REVIEW_STATE: Record<ReviewState, { label: string; tone: Tone }> = {
  none: { label: "Явцгүй", tone: "gray" },
  pending: { label: "Хүлээгдэж буй", tone: "amber" },
  approved: { label: "Батлагдсан", tone: "green" },
  returned: { label: "Буцаагдсан", tone: "red" },
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
