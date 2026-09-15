/**
 * Mock router — v2 endpoint-уудыг санах ой дээрх өгөгдлөөс хариулна.
 *
 * Санаатайгаар "жинхэнэ шиг" ажиллана: шүүлтүүр, хуудаслалт, `meta.total`,
 * сервер талын нэгтгэл бүгд хэрэгжсэн. Бүх мөрийг нэг дор буцаадаг хялбар
 * mock хийвэл хуудаслалтын алдааг нуух тул ашиггүй байх байсан.
 */
import {
  createBlock,
  getDb,
  inspectionsFor,
  mockId,
  MOCK_IDS,
  pollJob,
  progressFor,
  startApplyJob,
  taktWindow,
} from "./store";
import type {
  BlockSummary,
  Inspection,
  ItemCounts,
  StatusCounts,
  ProgressEntry,
  ProjectDashboard,
  SummaryGroup,
  SummaryGroupBy,
  WorkItem,
  WorkItemFilters,
  WorkType,
} from "@/lib/api/v2/types";

const MAX_PAGE_SIZE = 200;

// ---------------------------------------------------------------------------
// Mock сесс
// ---------------------------------------------------------------------------
/**
 * Хэн нэвтэрсэн байгаа.
 *
 * Mock-д token баталгаажуулалт байхгүй тул сессийг санах ойд хадгална. Гол
 * зорилго: ГҮЙЦЭТГЭГЧИЙН хамрах хүрээг mock ч мөрдүүлэх. Хэрэв mock хүрээ
 * үл хамааран бүх ажлыг буцаадаг байвал дэлгэц mock дээр "ажиллаж", жинхэнэ
 * backend дээр хоосон гарах болно — mock-ийн ач холбогдол тэр дор нь үгүй.
 */
interface MockSession {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  contractorId: string | null;
  canReportProgress: boolean;
  canInspect: boolean;
  canManageContractors: boolean;
  canManageUsers: boolean;
  canManageReferenceData: boolean;
  canEditPlan: boolean;
  /** Хариуцах блокууд. Хоосон = хязгаарлалтгүй (backend-ийн дүрэм). */
  scopeBlockIds: string[];
}

/*
 * Нэвтэрсэн ажилтан.
 *
 * `id` нь `mockUsers`-ийн ЗАХИРЛЫН мөртэй ЯГ таарна. Жинхэнэ backend дээр
 * `/me` нь `/users` жагсаалтад байдаг мөрийг буцаадаг; mock дээр өөр id
 * тавибал «өөрийгөө засах» урсгал mock дээр 404 өгөөд бодит систем дээр
 * ажиллана — яг эсрэгээр нь байх ёстой.
 */
const STAFF_SESSION: MockSession = {
  id: "usr-seed-1",
  name: "Б.Батбаяр",
  email: "director@cpms.test",
  role: "director",
  roleLabel: "Захирал",
  contractorId: null,
  // Ажилтны сессэд хоёуланг нь `true` болгосон — UI хөгжүүлэхэд мэдээлэх ба
  // батлах хоёр самбарыг зэрэг харах шаардлагатай.
  canReportProgress: true,
  canInspect: true,
  canManageContractors: true,
  canManageUsers: true,
  canManageReferenceData: true,
  canEditPlan: true,
  scopeBlockIds: [],
};

let session: MockSession = STAFF_SESSION;

/** Backend-ийн `User::ROLES`-тэй ижил дараалал. */
const MOCK_ROLES = [
  { value: "admin", label: "Системийн админ" },
  { value: "director", label: "Захирал" },
  { value: "general_engineer", label: "Ерөнхий инженер" },
  { value: "project_manager", label: "Төслийн менежер" },
  { value: "inspector", label: "Хяналтын инженер" },
  { value: "site_engineer", label: "Талбайн инженер" },
  { value: "machine_operator", label: "Машин механизмын оператор" },
  { value: "contractor", label: "Туслан гүйцэтгэгч" },
];

const REPORTER_ROLES = ["site_engineer", "contractor", "project_manager", "machine_operator"];
const INSPECTOR_ROLES = ["inspector", "general_engineer", "director", "admin"];
const UNRESTRICTED_ROLES = ["admin", "director", "general_engineer"];
/** Хэрэглэгч удирдах эрхтэй үүрэг — backend-ийн `USER_MANAGER_ROLES`. */
const USER_MANAGER_ROLES = ["admin", "director"];

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  scopeBlockIds: string[];
  contractorId: string | null;
  isActive: boolean;
  canReportProgress: boolean;
  canInspect: boolean;
}

// ---------------------------------------------------------------------------
// Чанарын шалгах хуудас
// ---------------------------------------------------------------------------
/**
 * Backend-ийн `ChecklistSeeder`-тэй ижил бүтэц. Бүлгийн нэрээр холбогдоно —
 * жинхэнэ систем дээр ч эхлээд бүлгийн түвшинд тохируулна.
 */
interface MockChecklistItem {
  id: string;
  sequenceNumber: number;
  text: string;
  guidance?: string | null;
  isRequired: boolean;
}

interface MockChecklistTemplate {
  id: string;
  name: string;
  workTypeId: string | null;
  groupId: string | null;
  groupName: string | null;
  isActive: boolean;
  items: MockChecklistItem[];
}

const CHECKLIST_SEED: Record<string, [string, boolean][]> = {
  Угсралт: [
    ["Арматурын диаметр, алхам зурагтай тохирч байна", true],
    ["Хэвний бэхэлгээ бат бөх, гажилтгүй", true],
    ["Хамгаалалтын давхаргын зузаан хангасан", true],
    ["Ажлын байрны цэвэрлэгээ хийгдсэн", false],
  ],
  Өрлөг: [
    ["Өрлөгийн эгнээ хэвтээ, босоо түвшин зөв", true],
    ["Заадасны зузаан жигд", true],
    ["Зуурмагийн харьцаа стандартын дагуу", true],
  ],
  Засал: [
    ["Гадаргуу тэгш, ан цавгүй", true],
    ["Өнгө, материал зурагт заасантай тохирч байна", true],
    ["Ажлын дараа хог цэвэрлэгдсэн", false],
  ],
};

let checklistTemplates: MockChecklistTemplate[] | null = null;

function getChecklistTemplates(): MockChecklistTemplate[] {
  if (checklistTemplates) return checklistTemplates;

  const db = getDb();
  checklistTemplates = Object.entries(CHECKLIST_SEED).flatMap(([groupName, items]) => {
    const group = db.groups.find((g) => g.name === groupName);
    if (!group) return [];

    return [
      {
        id: `clt-${group.id}`,
        name: `${groupName} — чанарын шалгалт`,
        workTypeId: null,
        groupId: group.id,
        groupName,
        isActive: true,
        items: items.map(([text, isRequired], i) => ({
          id: `cli-${group.id}-${i}`,
          sequenceNumber: i,
          text,
          isRequired,
        })),
      },
    ];
  });

  return checklistTemplates;
}

/** Тухайн ажилд ямар хуудас хамаарах вэ — backend-ийн `resolveFor` шиг. */
function resolveChecklist(item: WorkItem): MockChecklistTemplate | null {
  const db = getDb();
  const group = db.groups.find((g) => g.name === item.workType.groupName);
  if (!group) return null;

  return getChecklistTemplates().find((t) => t.isActive && t.groupId === group.id) ?? null;
}

/**
 * Батлах боломжтой эсэх — backend-ийн `ChecklistGate`-тэй ЯГ ижил дүрэм.
 *
 * Зөрвөл дэлгэц mock дээр батлуулаад, жинхэнэ сервер дээр 422 өгнө.
 */
function checklistError(
  item: WorkItem,
  result: string,
  answers: { itemId?: string; result?: string }[],
): string | null {
  const template = resolveChecklist(item);
  if (!template) return null;

  const byId = new Map(template.items.map((i) => [i.id, i]));
  const given = new Map(answers.map((a) => [a.itemId ?? "", a]));

  for (const key of given.keys()) {
    if (!byId.has(key)) return "Чанарын хуудсанд байхгүй зүйл илгээсэн байна.";
  }

  const required = template.items.filter((i) => i.isRequired);
  const missing = required.filter((i) => !given.has(i.id));
  if (missing.length > 0) {
    return "Чанарын хуудас дутуу: " + missing.map((i) => i.text).join(", ");
  }

  if (result !== "accepted") return null;

  const failed = required.filter((i) => given.get(i.id)?.result === "fail");
  if (failed.length > 0) {
    return (
      "Тэнцээгүй зүйл байхад батлах боломжгүй: " +
      failed.map((i) => i.text).join(", ") +
      ". Татгалзах эсвэл хэсэгчлэн батлана уу."
    );
  }

  return null;
}

/** Ажлын нэгжийн id → бүртгэсэн асуудлууд. */
const mockIssues = new Map<string, MockIssue[]>();

interface MockIssue {
  id: string;
  workItemId: string;
  workItemName: string;
  /** Backend-тэй ижил: төслийн жагсаалтад барилга, байршил хэрэгтэй. */
  blockName: string | null;
  locationPath: string | null;
  category: string;
  categoryLabel: string;
  severity: string;
  status: string;
  description: string;
  reportedBy: string;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * Асуудалд хавсаргах байршлын мэдээлэл.
 *
 * Backend нь `workItem.block`, `workItem.location`-ийг eager load-оор авдаг.
 * Mock нь энэ хоёрыг орхивол жагсаалт дээр «—» гарч, жинхэнэ сервер дээр
 * нэр гарна — mock нь худлаа хэлсэн болно.
 */
function issuePlace(item: { blockId: string; location?: { path?: string } }): {
  blockName: string | null;
  locationPath: string | null;
} {
  return {
    blockName: getDb().blocks.find((b) => b.id === item.blockId)?.name ?? null,
    locationPath: item.location?.path ?? null,
  };
}

const ISSUE_LABELS: Record<string, string> = {
  no_contractor: "Гүйцэтгэгч ирээгүй",
  contractor_late: "Гүйцэтгэгч хоцорсон",
  equipment_failure: "Техник эвдэрсэн",
  material_shortage: "Материал дутсан",
  weather: "Цаг агаар",
  complaint: "Гомдол",
  accident: "Осол",
};

const mockUsers: MockUser[] = ["admin", "director", "inspector", "site_engineer"].map(
  (role, i) => ({
    id: `usr-seed-${i}`,
    name: MOCK_ROLES.find((r) => r.value === role)!.label,
    email: `${role}@cpms.test`,
    role,
    roleLabel: MOCK_ROLES.find((r) => r.value === role)!.label,
    scopeBlockIds: [],
    contractorId: null,
    isActive: true,
    canReportProgress: REPORTER_ROLES.includes(role),
    canInspect: INSPECTOR_ROLES.includes(role),
  }),
);

/**
 * Бүртгэлийн мөрөөс нэвтрэлтийн сесс үүсгэнэ.
 *
 * Эрхүүд нь ҮҮРГЭЭС гарна — мөрөн дээрх утгыг хуулахгүй. Ингэснээр үүрэг
 * солигдоход эрх нь заавал дагаж өөрчлөгдөнө.
 */
function sessionFor(user: MockUser): MockSession {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: user.roleLabel,
    contractorId: user.contractorId,
    canReportProgress: REPORTER_ROLES.includes(user.role),
    canInspect: INSPECTOR_ROLES.includes(user.role),
    canManageContractors: USER_MANAGER_ROLES.includes(user.role),
    canManageUsers: USER_MANAGER_ROLES.includes(user.role),
    canManageReferenceData: UNRESTRICTED_ROLES.includes(user.role),
    canEditPlan: UNRESTRICTED_ROLES.includes(user.role) || user.role === "project_manager",
    scopeBlockIds: user.scopeBlockIds,
  };
}

function contractorSession(id: string, name: string): MockSession {
  return {
    id: `usr-${id}`,
    name,
    email: `contractor-${id}@cpms.local`,
    role: "contractor",
    roleLabel: "Туслан гүйцэтгэгч",
    contractorId: id,
    canReportProgress: true,
    // Гүйцэтгэгч өөрийгөө батлахгүй — backend-тэй ижил.
    canInspect: false,
    canManageContractors: false,
    canManageUsers: false,
    canManageReferenceData: false,
    // Гүйцэтгэгч төлөвлөгөө засахгүй — тоо хэмжээ бол гэрээний асуудал.
    canEditPlan: false,
    // Гүйцэтгэгчийн хүрээ нь БЛОКоор биш ГҮЙЦЭТГЭГЧээр тогтоно.
    scopeBlockIds: [],
  };
}

/** Гүйцэтгэгчийн сесс үү? */
const isRep = () => session.role === "contractor" && session.contractorId !== null;

/** Бүх блок харах эрхтэй юу — backend-ийн `User::canSeeAllBlocks()`. */
const seesAllBlocks = () =>
  !isRep() && (UNRESTRICTED_ROLES.includes(session.role) || session.scopeBlockIds.length === 0);

/**
 * Хамрах хүрээ — жагсаалт, нэгтгэл, dashboard бүгд ҮҮГЭЭР дамжина.
 *
 * ХОЁР ӨӨР хязгаарлалт:
 *  - Гүйцэтгэгч ГҮЙЦЭТГЭГЧээр (тэр 49 барилгад ажилладаг).
 *  - Талбайн инженер БЛОКоор (тэр 1–2 барилга хариуцна).
 *
 * Урьд нь энд зөвхөн эхнийх нь байсан тул нэг барилга хариуцсан инженер
 * хянах самбар дээр 75 барилгын тоог хардаг байв — карт дээр нь дарахад
 * 403 авна.
 */
function inScope(items: WorkItem[]): WorkItem[] {
  if (isRep()) return items.filter((w) => w.contractor?.id === session.contractorId);
  if (seesAllBlocks()) return items;

  return items.filter((w) => session.scopeBlockIds.includes(w.blockId));
}

export interface MockResponse {
  status: number;
  body: unknown;
}

const ok = (body: unknown): MockResponse => ({ status: 200, body });
const created = (data: unknown): MockResponse => ({ status: 201, body: { data } });
const fail = (status: number, name: string, message: string): MockResponse => ({
  status,
  body: { error: { name, message } },
});

/**
 * Тоо хэмжээг МЯНГАТЫН орон хүртэл — backend-ийн `round(\$x, 3)`-тай ижил.
 *
 * Урьд нь энд 2 орон байсан: mock 12.35 гэж хадгалахад жинхэнэ сервер
 * 12.347 гэж хадгалдаг байв. Дэлгэц mock дээр "ажиллаад" бодит дээр
 * өөр тоо харуулна — mock-ийн ач холбогдол тэр дор нь үгүй болно.
 */
const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Мөрүүдийн ДУНДАЖ явц — backend-ийн `WorkItem::progressSql()`-тэй ижил дүрэм.
 *
 * ЯАГААД ТОО ХЭМЖЭЭГЭЭР БИШ ВЭ: нэг бүлэгт м², м³, ширхэг зэрэгцэн орж ирдэг.
 * Тэдгээрийг нэмээд хувь гаргавал ширхгээр хэмжигддэг ажил руу татагдана.
 *
 * ЭНЭ ФУНКЦ НЭГ Л УДАА БИЧИГДЭНЭ: самбар, блокийн нэгтгэл, бүлэг бүр
 * үүнийг дуудна. Урьд нь самбар дундажаар, блокийн хуудас тоо хэмжээгээр
 * боддог байсан тул нэг блок 3% ба 11% гэж хоёр өөр харагдаж байв.
 */
function avgPercentage(rows: { plannedQty: number; acceptedQty: number }[]): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce(
    (s, w) => s + (w.plannedQty > 0 ? Math.min(w.acceptedQty / w.plannedQty, 1) : 0),
    0,
  );

  return Math.round((sum / rows.length) * 100);
}

/** Төлөвийн тоолол — гурав нь харилцан үл огтлолцоно. */
function statusCounts(rows: { status: string }[]): StatusCounts {
  const completedItems = rows.filter((w) => w.status === "completed").length;
  const inProgressItems = rows.filter((w) => w.status === "in_progress").length;

  return {
    completedItems,
    inProgressItems,
    notStartedItems: Math.max(rows.length - completedItems - inProgressItems, 0),
  };
}

/**
 * Төлөвлөгөө өөрчлөгдөхөд хамаарах утгуудыг дахин бодно.
 *
 * Backend-ийн `WorkItem::recalculate()`-тэй ижил дүрэм: үлдэгдэл ба хувь нь
 * ЗӨВХӨН батлагдсанаас бодогдоно.
 */
function applyPlannedQty(item: WorkItem, qty: number): void {
  item.plannedQty = round(qty);
  item.acceptedQty = round(Math.min(item.acceptedQty, qty));
  item.remainingQty = round(Math.max(qty - item.acceptedQty, 0));
  item.percentage = qty > 0 ? Math.round((item.acceptedQty / qty) * 100) : 0;
  item.status =
    item.acceptedQty >= qty && qty > 0
      ? "completed"
      : item.reportedQty > 0
        ? "in_progress"
        : "not_started";
}

/** Хамгийн эрт товлосон эхлэх огноо — "хэзээ эхлэх ёстой вэ". */
function minDate(rows: WorkItem[]): string | null {
  let min: string | null = null;
  for (const w of rows) {
    if (w.plannedStartDate && (min === null || w.plannedStartDate < min)) min = w.plannedStartDate;
  }

  return min;
}

/** Хамгийн сүүлийн товлосон дуусах огноо — "хэзээ дуусах ёстой вэ". */
function maxDate(rows: WorkItem[]): string | null {
  let max: string | null = null;
  for (const w of rows) {
    if (w.plannedEndDate && (max === null || w.plannedEndDate > max)) max = w.plannedEndDate;
  }

  return max;
}

function paginate<T>(rows: T[], q: URLSearchParams) {
  const page = Math.max(1, Number(q.get("page") ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.get("pageSize") ?? 50)));
  const start = (page - 1) * pageSize;
  return {
    data: rows.slice(start, start + pageSize),
    meta: { total: rows.length, page, pageSize },
  };
}

// ---------------------------------------------------------------------------
// WorkItem шүүлтүүр
// ---------------------------------------------------------------------------
function filterWorkItems(items: WorkItem[], q: URLSearchParams): WorkItem[] {
  const db = getDb();
  // Хамрах хүрээ ХАМГИЙН ЭХЭНД: доорх нь хэрэглэгчийн хүсэлт, энэ нь хориг.
  // `contractorId=<өөр компани>` илгээсэн ч хоосон гарна.
  let rows = inScope(items);

  const locationId = q.get("locationId");
  if (locationId) {
    const scope =
      q.get("includeDescendants") === "true"
        ? (db.descendants.get(locationId) ?? new Set([locationId]))
        : new Set([locationId]);
    rows = rows.filter((w) => scope.has(w.locationId));
  }

  const eq = (key: string, pick: (w: WorkItem) => string | null | undefined) => {
    const v = q.get(key);
    if (v) rows = rows.filter((w) => pick(w) === v);
  };
  eq("workTypeId", (w) => w.workTypeId);
  eq("status", (w) => w.status);
  eq("reviewState", (w) => w.reviewState);

  // `contractorId=none` — хариуцагч оноогдоогүй ажлууд.
  const contractorId = q.get("contractorId");
  if (contractorId === "none") rows = rows.filter((w) => !w.contractor);
  else if (contractorId) rows = rows.filter((w) => w.contractor?.id === contractorId);

  const groupId = q.get("workTypeGroupId");
  if (groupId) {
    const group = db.groups.find((g) => g.id === groupId);
    if (group) rows = rows.filter((w) => w.workType.groupName === group.name);
  }

  const overdue = Number(q.get("overdueDays") ?? 0);
  if (overdue > 0) rows = rows.filter((w) => w.overdueDays >= overdue);

  const search = q.get("search")?.toLowerCase();
  if (search) {
    rows = rows.filter(
      (w) =>
        w.name.toLowerCase().includes(search) || w.location.path.toLowerCase().includes(search),
    );
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Нэгтгэл
// ---------------------------------------------------------------------------
function summarize(items: WorkItem[], groupBy: SummaryGroupBy): SummaryGroup[] {
  const db = getDb();
  const buckets = new Map<
    string,
    { label: string; seq: number; filter: WorkItemFilters; rows: WorkItem[] }
  >();

  for (const w of items) {
    let key: string;
    let label: string;
    let seq = 0;
    let filter: WorkItemFilters;

    if (groupBy === "workType") {
      key = w.workTypeId;
      label = w.workType.name;
      filter = { workTypeId: key };
    } else if (groupBy === "workTypeGroup") {
      key = db.groups.find((g) => g.name === w.workType.groupName)?.id ?? w.workType.groupName;
      label = w.workType.groupName;
      filter = { workTypeGroupId: key };
    } else if (groupBy === "contractor") {
      key = w.contractor?.id ?? "none";
      label = w.contractor?.name ?? "Хариуцагчгүй";
      filter = { contractorId: key };
    } else {
      // floor — айлын ажлыг эцэг давхарт нь хамааруулна. Блокийн үндэс
      // зангилаа бүх зүйлийн эцэг тул удмаа хамруулахгүй, эс бөгөөс
      // "барилга бүхэлдээ" бүлэг дарахад бүх мөр гарч ирнэ.
      const loc = db.locations.find((l) => l.id === w.locationId);
      const floor = loc?.level === "unit" ? db.locations.find((l) => l.id === loc.parentId) : loc;
      const isRoot = floor?.level === "block";
      key = floor?.id ?? "loc-block";
      label = isRoot ? "Барилга бүхэлдээ" : (floor?.name ?? "Блок");
      seq = isRoot ? -1 : (floor?.sequenceNumber ?? 0);
      filter = { locationId: key, includeDescendants: !isRoot };
    }

    const b = buckets.get(key) ?? { label, seq, filter, rows: [] };
    b.rows.push(w);
    buckets.set(key, b);
  }

  return [...buckets.entries()]
    .map(([key, b]) => {
      const plannedQty = b.rows.reduce((a, w) => a + w.plannedQty, 0);
      const acceptedQty = b.rows.reduce((a, w) => a + w.acceptedQty, 0);
      const group: SummaryGroup = {
        key,
        label: b.label,
        filter: b.filter,
        workItems: b.rows.length,
        plannedQty: round(plannedQty),
        reportedQty: round(b.rows.reduce((a, w) => a + w.reportedQty, 0)),
        acceptedQty: round(acceptedQty),
        percentage: avgPercentage(b.rows),
        ...statusCounts(b.rows),
        pendingInspections: b.rows.filter((w) => w.reviewState === "pending").length,
        overdue: b.rows.filter((w) => w.overdueDays > 0).length,
        plannedStartDate: minDate(b.rows),
        plannedEndDate: maxDate(b.rows),
      };
      return { group, seq: b.seq };
    })
    .sort((a, b) => a.seq - b.seq || b.group.workItems - a.group.workItems)
    .map((x) => x.group);
}

// ---------------------------------------------------------------------------
// Мутаци — POST хийхэд WorkItem-ийн дүн шинэчлэгдэнэ
// ---------------------------------------------------------------------------
const extraProgress = new Map<string, ProgressEntry[]>();
const extraInspections = new Map<string, Inspection[]>();

/**
 * Хянагдах төлөв — backend-ийн `WorkItem::recalculate()`-тэй ЯГ ижил дүрэм.
 *
 * `reportedQty` нь ТАТГАЛЗСАН хэмжээг хассан цэвэр дүн тул засвараа дахин
 * мэдээлмэгц хүлээгдэж буй хэмжээ гарч ирж, төлөв нь өөрөө `pending` болно.
 */
function recalcReview(item: WorkItem) {
  const latest = (extraInspections.get(item.id) ?? [])[0];
  const pending = item.reportedQty - item.acceptedQty;

  item.reviewState =
    pending > 0.0005
      ? "pending"
      : (latest?.rejectedQty ?? 0) > 0
        ? "returned"
        : item.reportedQty <= 0
          ? "none"
          : "approved";
}

function recalc(item: WorkItem) {
  item.remainingQty = round(Math.max(item.plannedQty - item.acceptedQty, 0));
  item.percentage =
    item.plannedQty > 0 ? Math.round((item.acceptedQty / item.plannedQty) * 100) : 0;
  item.status =
    item.acceptedQty >= item.plannedQty
      ? "completed"
      : item.reportedQty > 0
        ? "in_progress"
        : "not_started";

  // Дууссан ажил хоцорсонд тооцогдохгүй — backend-ийн `getOverdueDaysAttribute`
  // мөн адил 0 буцаадаг. Энэ мөр байхгүй үед самбар «99 хоцорсон» гээд
  // дараалал 98 мөр нээж, хоёр тоо зөрдөг байв.
  if (item.status === "completed") item.overdueDays = 0;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export function handleMock(
  method: string,
  segments: string[],
  search: string,
  body: unknown,
): MockResponse {
  const db = getDb();
  const q = new URLSearchParams(search);
  const [a, b, c] = segments;

  // --- нэвтрэлт ---
  // AuthGate token-ыг сервер дээр шалгадаг тул mock ч хариулах ёстой.
  if (a === "me") {
    return ok({ data: session });
  }

  if (a === "auth" && b === "login" && method === "POST") {
    /*
     * Имэйлээр нь бүртгэлтэй хэрэглэгчийг олно.
     *
     * Урьд нь хэн нэвтэрсэн ч ЗАХИРЛЫН сесс үүсдэг байсан тул хамрах
     * хүрээтэй инженерийн урсгалыг mock дээр огт туршиж болдоггүй байв.
     */
    const email = (body as { email?: string })?.email?.trim();
    const found = email ? mockUsers.find((u) => u.email === email && u.isActive) : undefined;

    session = found ? sessionFor(found) : STAFF_SESSION;

    return ok({
      data: {
        token: "mock-token",
        user: { id: session.id, name: session.name, role: session.role },
      },
    });
  }

  if (a === "auth" && b === "contractor-login" && method === "POST") {
    const code = (body as { code?: string })?.code?.trim();
    const contractor = db.contractors.find((x) => x.accessCode && x.accessCode === code);

    if (!contractor) {
      return fail(422, "ValidationError", "Код буруу эсвэл хугацаа нь дууссан байна.");
    }

    session = contractorSession(contractor.id, contractor.name);

    return ok({
      data: {
        token: `mock-token-${contractor.id}`,
        user: { id: session.id, name: session.name, role: session.role },
      },
    });
  }

  if (a === "auth" && b === "logout") {
    session = STAFF_SESSION;

    return { status: 204, body: null };
  }

  // --- contractors ---
  if (a === "contractors") {
    if (!b) {
      if (method === "POST") {
        const p = body as { name?: string; tradeSpecialty?: string };
        const created = {
          id: mockId("ctr"),
          name: p?.name ?? "Шинэ гүйцэтгэгч",
          tradeSpecialty: p?.tradeSpecialty,
          accessCode: null,
          accessCodeExpiresAt: null,
          hasValidAccessCode: false,
        };
        db.contractors.push(created);

        return { status: 201, body: { data: created } };
      }

      return ok({
        data: db.contractors,
        meta: { total: db.contractors.length, page: 1, pageSize: 50 },
      });
    }
    const contractor = db.contractors.find((x) => x.id === b);
    if (!contractor) return fail(404, "NotFound", "Гүйцэтгэгч олдсонгүй.");
    // v1 дэлгэц гүйцэтгэгчийн төслүүдийг асуудаг — v2-д блокоор буцаана.
    if (c === "projects") return ok({ data: [], meta: { total: 0, page: 1, pageSize: 50 } });

    // Нэвтрэх код олгох / хаах — mock-д санах ойд хадгална.
    if (c === "access-code") {
      if (method === "POST") {
        contractor.accessCode = `${contractor.name.slice(0, 3).toUpperCase()}-MOCK01`;
        contractor.accessCodeExpiresAt = "2027-08-17";
      } else if (method === "DELETE") {
        contractor.accessCode = null;
        contractor.accessCodeExpiresAt = null;
      }
    }

    return ok({ data: contractor });
  }

  // --- хэрэглэгч (админ) ---
  if (a === "users") {
    if (!session.canManageUsers) {
      return fail(403, "Forbidden", "Танд хэрэглэгч удирдах эрх байхгүй.");
    }

    if (b === "roles") {
      return ok({
        data: MOCK_ROLES.map((r) => ({
          value: r.value,
          label: r.label,
          canReportProgress: REPORTER_ROLES.includes(r.value),
          canInspect: INSPECTOR_ROLES.includes(r.value),
          seesAllBlocks: UNRESTRICTED_ROLES.includes(r.value),
          canManageUsers: USER_MANAGER_ROLES.includes(r.value),
        })),
      });
    }

    if (!b) {
      if (method === "POST") {
        const p = body as {
          name?: string;
          email?: string;
          role?: string;
          password?: string;
          scopeBlockIds?: string[];
        };
        if (!p?.name?.trim()) return fail(422, "ValidationError", "Нэр заавал.");
        if (!p?.email?.trim()) return fail(422, "ValidationError", "Имэйл заавал.");
        if (mockUsers.some((u) => u.email === p.email?.trim())) {
          return fail(422, "ValidationError", "Энэ имэйл бүртгэлтэй байна.");
        }

        const role = p.role ?? "site_engineer";
        const user: MockUser = {
          id: mockId("usr"),
          name: p.name.trim(),
          email: p.email.trim(),
          role,
          roleLabel: MOCK_ROLES.find((r) => r.value === role)?.label ?? role,
          // Урьд нь энд хатуу `[]` байсан тул mock дээр хамрах хүрээ огт
          // хадгалагддаггүй байв — жинхэнэ сервер хадгалдаг.
          scopeBlockIds: p.scopeBlockIds ?? [],
          contractorId: null,
          isActive: true,
          canReportProgress: REPORTER_ROLES.includes(role),
          canInspect: INSPECTOR_ROLES.includes(role),
        };
        mockUsers.push(user);

        // Түр нууц үг зөвхөн үүсгэх хариултад нэг удаа гарна.
        return {
          status: 201,
          body: { data: user, meta: { temporaryPassword: p.password || "MOCK-TEMP-1234" } },
        };
      }

      return ok({ data: mockUsers, meta: { total: mockUsers.length, page: 1, pageSize: 50 } });
    }

    const user = mockUsers.find((u) => u.id === b);
    if (!user) return fail(404, "NotFound", "Хэрэглэгч олдсонгүй.");

    if (c === "reset-password") return ok({ data: { temporaryPassword: "MOCK-RESET-5678" } });

    // Идэвхгүй болгоно — устгахгүй. Түүний мэдээлсэн явц эзэнгүй үлдэх ёсгүй.
    if (method === "DELETE") {
      user.isActive = false;

      return ok({ data: user });
    }
    if (method === "PATCH") {
      const p = body as Partial<{
        name: string;
        email: string;
        role: string;
        scopeBlockIds: string[];
        isActive: boolean;
      }>;

      if (p.name !== undefined && !p.name.trim()) {
        return fail(422, "ValidationError", "Нэр заавал.");
      }
      if (p.email !== undefined) {
        const email = p.email.trim();
        if (!email) return fail(422, "ValidationError", "Имэйл заавал.");
        // Өөрөөсөө БУСАД хүнтэй давхцахыг хориглоно.
        if (mockUsers.some((u) => u.id !== user.id && u.email === email)) {
          return fail(422, "ValidationError", "Энэ имэйл бүртгэлтэй байна.");
        }
        user.email = email;
      }
      if (p.role !== undefined && !MOCK_ROLES.some((r) => r.value === p.role)) {
        return fail(422, "ValidationError", "Үүрэг буруу байна.");
      }

      /*
       * Өөрийн эрхээ бууруулахыг хориглоно — backend-ийн `guardSelfDemotion`.
       *
       * Сүүлчийн админ өөрийгөө инженер болговол хэрэглэгч удирдах хаалга
       * бүрмөсөн хаагдаж, өгөгдлийн сангаас засахаас өөр арга үлдэхгүй.
       */
      if (
        p.role !== undefined &&
        user.id === session.id &&
        USER_MANAGER_ROLES.includes(user.role) &&
        !USER_MANAGER_ROLES.includes(p.role)
      ) {
        return fail(422, "ValidationError", "Өөрийн эрхээ бууруулах боломжгүй.");
      }

      if (p.name !== undefined) user.name = p.name.trim();
      if (p.scopeBlockIds !== undefined) user.scopeBlockIds = p.scopeBlockIds;
      if (p.isActive !== undefined) user.isActive = p.isActive;

      if (p.role !== undefined) {
        // Үүрэг солиход ТҮҮНЭЭС ГАРАХ эрхүүд хамт шинэчлэгдэнэ. Урьд нь
        // `Object.assign` хийдэг байсан тул шошго, эрх нь хуучнаараа
        // үлдэж, mock дээр «Захирал · мэдээлнэ» гэсэн боломжгүй хослол
        // үүсдэг байв.
        user.role = p.role;
        user.roleLabel = MOCK_ROLES.find((r) => r.value === p.role)?.label ?? p.role;
        user.canReportProgress = REPORTER_ROLES.includes(p.role);
        user.canInspect = INSPECTOR_ROLES.includes(p.role);
      }

      return ok({ data: user });
    }

    return ok({ data: user });
  }

  // --- чанарын шалгах хуудас ---
  if (a === "checklist-templates" && !b) {
    const rows = getChecklistTemplates();

    return ok({ data: rows, meta: { total: rows.length, page: 1, pageSize: 50 } });
  }

  // --- work type library ---
  if (a === "work-type-groups") {
    if (method === "POST") {
      if (!session.canManageReferenceData) {
        return fail(403, "Forbidden", "Танд лавлах сан засах эрх байхгүй.");
      }
      const p = body as { name?: string };
      if (!p?.name?.trim()) return fail(422, "ValidationError", "Бүлгийн нэр заавал.");

      const group = {
        id: mockId("wtg"),
        name: p.name.trim(),
        sequenceNumber: db.groups.length,
      };
      db.groups.push(group);

      return created(group);
    }

    const rows = db.groups.map((g) => ({
      ...g,
      workTypeCount: db.workTypes.filter((w) => w.groupId === g.id).length,
    }));

    return ok({ data: rows, meta: { total: rows.length, page: 1, pageSize: 50 } });
  }

  if (a === "work-types" && !b) {
    if (method === "POST") {
      if (!session.canManageReferenceData) {
        return fail(403, "Forbidden", "Танд лавлах сан засах эрх байхгүй.");
      }
      const p = body as { groupId?: string; name?: string; unit?: string; level?: string };
      if (!p?.name?.trim() || !p?.unit?.trim()) {
        return fail(422, "ValidationError", "Нэр ба нэгж заавал.");
      }

      const group = db.groups.find((g) => g.id === p.groupId) ?? db.groups[0];
      const newType = {
        id: mockId("wt"),
        groupId: group.id,
        groupName: group.name,
        name: p.name.trim(),
        unit: p.unit.trim(),
        level: (p.level ?? "floor") as WorkType["level"],
      };
      db.workTypes.push(newType);

      return created(newType);
    }

    let rows = db.workTypes.map((w) => ({
      ...w,
      // Ашиглагдаж эхэлсэн эсэх — жинхэнэ backend-тэй ижил дүрэм.
      inUse: db.workItems.some((i) => i.workTypeId === w.id),
    }));
    const groupId = q.get("groupId");
    if (groupId) rows = rows.filter((w) => w.groupId === groupId);
    const s = q.get("search")?.toLowerCase();
    if (s) rows = rows.filter((w) => w.name.toLowerCase().includes(s));

    return ok(paginate(rows, q));
  }

  if (a === "work-types" && b && method === "DELETE") {
    if (!session.canManageReferenceData) {
      return fail(403, "Forbidden", "Танд лавлах сан засах эрх байхгүй.");
    }
    // Ашиглагдаж эхэлсэн төрөл нь мянган ажлын эцэг — устгавал түүх эзэнгүй болно.
    const used = db.workItems.filter((i) => i.workTypeId === b).length;
    if (used > 0) {
      return fail(409, "Conflict", `Энэ төрлөөр ${used} ажил үүссэн тул устгах боломжгүй.`);
    }
    const idx = db.workTypes.findIndex((w) => w.id === b);
    if (idx >= 0) db.workTypes.splice(idx, 1);

    return { status: 204, body: null };
  }

  // --- block designs ---
  if (a === "block-designs") {
    if (!b)
      return ok({
        data: db.designs,
        meta: { total: db.designs.length, page: 1, pageSize: 50 },
      });
    const design = db.designs.find((d) => d.id === b);
    if (!design) return fail(404, "NotFound", "Загвар олдсонгүй.");
    if (c === "apply" && method === "POST") {
      const p = body as { blockId?: string; startDate?: string };
      if (!p?.blockId) return fail(422, "ValidationError", "blockId заавал.");
      const job = startApplyJob(p.blockId, p.startDate ?? new Date().toISOString().slice(0, 10), b);
      if (!job) return fail(404, "NotFound", "Блок олдсонгүй.");
      return { status: 202, body: { data: job } };
    }
    return ok({ data: design });
  }

  // --- jobs ---
  if (a === "jobs" && b) {
    const job = pollJob(b);
    return job ? ok({ data: job }) : fail(404, "NotFound", "Ажил олдсонгүй.");
  }

  // --- projects ---
  // Frontend төслийн ID-г эндээс олж авдаг (хатуу бичихгүй) тул жагсаалт
  // заавал байх ёстой — жинхэнэ backend-тэй ижил зан төлөв.
  if (a === "projects" && !b) {
    const project = {
      id: MOCK_IDS.projectId,
      companyId: "cmp-inel",
      companyName: "Инэл ХХК",
      name: "75 барилгын цогцолбор",
      code: "INL-75",
      location: "Улаанбаатар",
      status: "active",
    };

    return ok({ data: [project], meta: { total: 1, page: 1, pageSize: 50 } });
  }

  if (a === "projects" && b) {
    if (c === "blocks") {
      if (method === "POST") {
        const p = body as {
          name?: string;
          buildingNo?: string;
          designId?: string;
          startDate?: string;
          purpose?: string;
          floors?: number;
          unitsPerFloor?: number;
          taktDays?: number;
        };
        if (!p?.name?.trim()) return fail(422, "ValidationError", "Блокийн нэр заавал.");

        // Загвар нь ЗААВАЛ БИШ — загваргүй бол давхрын тоо шаардлагатай, эс
        // бөгөөс байршил үүсгэх мэдээлэлгүй хоосон блок үлдэнэ.
        if (!p?.designId && !(Number(p?.floors) > 0)) {
          return fail(422, "ValidationError", "Загвар сонгоогүй бол давхрын тоог оруулна уу.");
        }

        const block = createBlock({
          name: p.name.trim(),
          buildingNo: p.buildingNo?.trim() || "—",
          designId: p.designId,
          purpose: p.purpose,
          floors: Number(p.floors) || undefined,
          unitsPerFloor: Number(p.unitsPerFloor) || 0,
          startDate: p.startDate ?? new Date().toISOString().slice(0, 10),
          taktDays: Number(p.taktDays) || undefined,
        });
        if (!block) return fail(422, "ValidationError", "Ийм загвар алга.");

        return created(block);
      }
      /*
       * Дарахад 403 авах "хуурамч" мөр жагсаалтад байх ёсгүй.
       *
       * Гүйцэтгэгчид ажил байгаа барилга л харагдана. Хамрах хүрээтэй
       * инженерт зөвхөн оноосон барилга харагдана.
       */
      const visible = isRep()
        ? db.blocks.filter((bl) => inScope(db.workItems).some((w) => w.blockId === bl.id))
        : seesAllBlocks()
          ? db.blocks
          : db.blocks.filter((bl) => session.scopeBlockIds.includes(bl.id));

      return ok({
        data: visible,
        meta: { total: visible.length, page: 1, pageSize: 50 },
      });
    }

    if (c === "dashboard") {
      const items = inScope(db.workItems);
      const planned = items.reduce((s, w) => s + w.plannedQty, 0);
      const accepted = items.reduce((s, w) => s + w.acceptedQty, 0);
      const reported = items.reduce((s, w) => s + w.reportedQty, 0);
      const openIssueRows = [...mockIssues.values()]
        .flat()
        .filter((i) => i.status === "open" && new Set(items.map((w) => w.id)).has(i.workItemId));
      const byCategory = new Map<string, number>();
      for (const i of openIssueRows)
        byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + 1);

      /*
       * Явц нь АЖЛЫН МӨРӨӨР — backend-тэй ижил.
       *
       * `status` нь гурван харилцан үл огтлолцох утгатай тул нийлбэр нь
       * үргэлж нийт тоотой тэнцэнэ. Хэмжээг нэмбэл м², м³, ширхэг холилдоно.
       */
      const countItems = (rows: typeof items): ItemCounts => ({
        totalItems: rows.length,
        ...statusCounts(rows),
      });

      const totals = countItems(items);

      const dash: ProjectDashboard = {
        ...totals,
        percentage: avgPercentage(items),
        plannedQty: round(planned),
        reportedQty: round(reported),
        acceptedQty: round(accepted),
        blocks: db.blocks
          .filter((bl) => items.some((w) => w.blockId === bl.id))
          .map((bl) => {
            const rows = items.filter((w) => w.blockId === bl.id);
            const p = rows.reduce((s, w) => s + w.plannedQty, 0);
            const acc = rows.reduce((s, w) => s + w.acceptedQty, 0);
            const c = countItems(rows);
            return {
              id: bl.id,
              name: bl.name,
              ...c,
              percentage: avgPercentage(rows),
              plannedQty: round(p),
              reportedQty: round(rows.reduce((s, w) => s + w.reportedQty, 0)),
              acceptedQty: round(acc),
              pendingInspections: rows.filter((w) => w.reviewState === "pending").length,
              overdue: rows.filter((w) => w.overdueDays > 0).length,
            };
          }),
        pendingInspections: items.filter((w) => w.reviewState === "pending").length,
        // Босго нь блокийн картынхтай ИЖИЛ байх ёстой (`> 0`). Урьд нь энд
        // `>= 3` байсан тул самбар "52 хоцорсон" гэж бичээд, блокуудын нийлбэр
        // 56 гардаг байв — хэрэглэгч алины нь зөв болохыг мэдэхгүй.
        overdueWorkItems: items.filter((w) => w.overdueDays > 0).length,
        // Урьд нь хатуу 0 байсан — жинхэнэ backend-тэй ижил болгов.
        openIssues: openIssueRows.length,
        issuesByCategory: [...byCategory.entries()]
          .map(([category, count]) => ({
            category: category as ProjectDashboard["issuesByCategory"][number]["category"],
            categoryLabel: ISSUE_LABELS[category] ?? category,
            count,
          }))
          .sort((a, b) => b.count - a.count),
      };
      return ok({ data: dash });
    }

    if (c === "inspections") {
      const rows = inScope(db.workItems).filter((w) => w.reviewState === "pending");
      return ok(paginate(rows, q));
    }

    // Mock горимд хоёртын файл үүсгэхгүй — mock нь JSON л буцаадаг.
    if (c === "reports" && segments[3] === "acceptance.xlsx") {
      return fail(
        501,
        "NotImplemented",
        "Mock горимд Excel үүсгэхгүй. Жинхэнэ backend руу холбогдоно уу.",
      );
    }

    // --- Тайлан: гүйцэтгэлийн акт ---
    // Backend-тэй ижил дүрэм: ШАЛГАЛТААС гарна (ажлаас биш), батлагдсан
    // хэмжээ 0-ээс их, огноогоор шүүгдэнэ, нэгж тус бүрээр дүн гарна.
    if (c === "reports" && segments[3] === "acceptance") {
      const from = q.get("from") ?? "";
      const to = q.get("to") ?? "";
      if (!from || !to || from > to) {
        return fail(422, "ValidationError", "Дуусах огноо эхлэхээсээ өмнө байж болохгүй.");
      }

      const stage = q.get("stage") ?? "client";
      const contractorId = q.get("contractorId");
      const blockId = q.get("blockId");

      const groups = new Map<
        string,
        { name: string; rows: unknown[]; totals: Map<string, number> }
      >();
      const totals = new Map<string, number>();
      const workItems = new Set<string>();
      let inspectionCount = 0;

      for (const item of inScope(db.workItems)) {
        if (contractorId && item.contractor?.id !== contractorId) continue;
        if (blockId && item.blockId !== blockId) continue;

        const inspections = [
          ...(extraInspections.get(item.id) ?? []),
          ...inspectionsFor(item),
        ].filter(
          (i) =>
            i.stage === stage &&
            i.acceptedQty > 0 &&
            i.inspectedAt.slice(0, 10) >= from &&
            i.inspectedAt.slice(0, 10) <= to,
        );

        for (const insp of inspections) {
          const groupName = item.workType.groupName || "Бусад";
          const block = db.blocks.find((b) => b.id === item.blockId);
          const qty = round(insp.acceptedQty);

          if (!groups.has(groupName)) {
            groups.set(groupName, { name: groupName, rows: [], totals: new Map() });
          }
          const g = groups.get(groupName)!;
          g.rows.push({
            inspectionId: insp.id,
            workItemId: item.id,
            blockName: block?.name ?? "—",
            locationPath: item.location.path,
            workTypeName: item.workType.name,
            unit: item.unit,
            acceptedQty: qty,
            inspectedAt: insp.inspectedAt,
            inspectorName: insp.inspector?.name ?? null,
          });
          g.totals.set(item.unit, round((g.totals.get(item.unit) ?? 0) + qty));
          totals.set(item.unit, round((totals.get(item.unit) ?? 0) + qty));
          workItems.add(item.id);
          inspectionCount++;
        }
      }

      const unitTotals = (m: Map<string, number>) =>
        [...m.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([unit, qty]) => ({ unit, qty }));

      const contractor = db.contractors.find((x) => x.id === contractorId);

      return ok({
        data: {
          contractor: contractor ? { id: contractor.id, name: contractor.name } : null,
          project: { id: MOCK_IDS.projectId, name: "75 барилгын цогцолбор" },
          period: { from, to },
          stage,
          groups: [...groups.values()].map((g) => ({
            name: g.name,
            rows: g.rows,
            totals: unitTotals(g.totals),
          })),
          totals: unitTotals(totals),
          workItemCount: workItems.size,
          inspectionCount,
        },
      });
    }

    // --- "Надаас юу хүлээж байна" дараалал ---
    if (c === "queue") {
      const pick = (t: string) =>
        inScope(db.workItems).filter((w) =>
          t === "returned"
            ? w.reviewState === "returned"
            : t === "overdue"
              ? w.overdueDays > 0 && w.status !== "completed"
              : w.reviewState === "pending",
        );

      // Табын тоо ба жагсаалт өөр код замаар бодогдвол зөрнө — нэг эх сурвалж.
      if (segments[3] === "counts") {
        return ok({
          data: {
            inspection: pick("inspection").length,
            returned: pick("returned").length,
            overdue: pick("overdue").length,
          },
        });
      }

      const rows = pick(q.get("type") ?? "inspection");

      return ok(paginate(rows, q));
    }

    // --- Асуудал (төслийн хэмжээнд) ---
    if (c === "issues") {
      // Блокийн шүүлт нь ХАРАХ ЭРХЭЭС өмнө биш, дараа нь тавигдана — эс
      // бөгөөс гүйцэтгэгч өөр блокийн id өгөөд бусдын саатлыг харна.
      const blockId = q.get("blockId");
      const visible = new Set(
        inScope(db.workItems)
          .filter((w) => !blockId || w.blockId === blockId)
          .map((w) => w.id),
      );
      let rows = [...mockIssues.values()].flat().filter((i) => visible.has(i.workItemId));

      for (const key of ["status", "category", "severity"] as const) {
        const value = q.get(key);
        if (value) rows = rows.filter((i) => i[key] === value);
      }

      // Нээлттэй нь эхэнд, дараа нь шинэ нь эхэнд — backend-ийн эрэмбэтэй ижил.
      rows = [...rows].sort(
        (a, b) =>
          (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) ||
          b.createdAt.localeCompare(a.createdAt),
      );

      return ok(paginate(rows, q));
    }
  }

  // --- Асуудлын төлөв өөрчлөх ---
  if (a === "issues" && b && method === "PATCH") {
    const issue = [...mockIssues.values()].flat().find((i) => i.id === b);
    if (!issue) return fail(404, "NotFound", "Асуудал олдсонгүй.");
    const p = body as { status?: string };
    issue.status = p?.status ?? "resolved";
    issue.resolvedAt = issue.status === "resolved" ? new Date().toISOString() : null;

    return ok({ data: issue });
  }

  // --- blocks ---
  if (a === "blocks" && b) {
    const block = db.blocks.find((x) => x.id === b);
    if (!block) return fail(404, "NotFound", "Блок олдсонгүй.");
    // Блокийн доорх өгөгдлийг зөвхөн тухайн блокоор хязгаарлана.
    const blockItems = db.workItems.filter((w) => w.blockId === b);

    // Жагсаалтад харагдахгүй блокийг шууд хаягаар нээхийг ч хориглоно —
    // эс бөгөөс хязгаарлалт нь зөвхөн гоо сайхны зүйл болно.
    const blocked = isRep()
      ? inScope(blockItems).length === 0
      : !seesAllBlocks() && !session.scopeBlockIds.includes(b);

    if (blocked) {
      return fail(403, "Forbidden", "Танд энэ блокийг харах эрх байхгүй.");
    }

    if (!c) return ok({ data: block });

    if (c === "locations") {
      let rows = db.locations.filter((l) => l.blockId === b);
      const level = q.get("level");
      if (level) rows = rows.filter((l) => l.level === level);
      const parentId = q.get("parentId");
      if (parentId) rows = rows.filter((l) => l.parentId === parentId);
      return ok({
        data: rows,
        meta: { total: rows.length, page: 1, pageSize: rows.length },
      });
    }

    // Ажлын бүлэг бүр хэнд оноогдсон — "юу онооход үлдсэн бэ".
    if (c === "assignments") {
      const db2 = getDb();
      const byGroup = new Map<
        string,
        {
          groupName: string;
          workItems: number;
          unassigned: number;
          byContractor: Map<string, number>;
        }
      >();

      for (const w of blockItems) {
        const group = db2.groups.find((g) => g.name === w.workType.groupName);
        if (!group) continue;

        const row = byGroup.get(group.id) ?? {
          groupName: group.name,
          workItems: 0,
          unassigned: 0,
          byContractor: new Map<string, number>(),
        };
        row.workItems += 1;
        if (w.contractor) {
          row.byContractor.set(w.contractor.id, (row.byContractor.get(w.contractor.id) ?? 0) + 1);
        } else {
          row.unassigned += 1;
        }
        byGroup.set(group.id, row);
      }

      return ok({
        data: [...byGroup.entries()].map(([groupId, r]) => ({
          groupId,
          groupName: r.groupName,
          workItems: r.workItems,
          unassigned: r.unassigned,
          contractors: [...r.byContractor.entries()].map(([id, n]) => ({
            id,
            name: db2.contractors.find((x) => x.id === id)?.name ?? "—",
            workItems: n,
          })),
        })),
      });
    }

    // Тоо хэмжээгүй ажлын төрлүүд — "юуг гүйцээх вэ".
    if (c === "missing-quantities") {
      const byType = new Map<string, { name: string; unit: string; level: string; n: number }>();
      for (const w of blockItems.filter((x) => x.plannedQty === 0)) {
        const row = byType.get(w.workTypeId) ?? {
          name: w.workType.name,
          unit: w.unit,
          level: w.location.level,
          n: 0,
        };
        row.n += 1;
        byType.set(w.workTypeId, row);
      }

      return ok({
        data: [...byType.entries()].map(([workTypeId, r]) => ({
          workTypeId,
          name: r.name,
          unit: r.unit,
          level: r.level,
          workItems: r.n,
        })),
      });
    }

    // Хуваарь дахин татах (re-baseline) — давхрын хугацаагаар.
    if (c === "schedule" && method === "POST") {
      if (!session.canEditPlan) {
        return fail(403, "Forbidden", "Танд төлөвлөгөө засах эрх байхгүй.");
      }

      const p = body as { taktDays?: number; startDate?: string };
      const takt = Number(p?.taktDays);
      if (!Number.isInteger(takt) || takt < 1 || takt > 60) {
        return fail(422, "ValidationError", "Давхрын хугацаа 1-60 хоногийн хооронд байна.");
      }

      if (block) {
        block.taktDays = takt;
        if (p?.startDate) block.startDate = p.startDate;
      }

      const start = block?.startDate ?? new Date().toISOString().slice(0, 10);
      let updated = 0;
      let frozen = 0;

      for (const w of blockItems) {
        // Батлагдсан ажлын огноог хойшлуулж болдог бол хоцролт бүрийг арилгах
        // боломжтой болно — хэмжилт утгагүй болно.
        if (w.acceptedQty > 0) {
          frozen++;
          continue;
        }

        const loc = db.locations.find((l) => l.id === w.locationId);
        const order = db.groups.find((g) => g.name === w.workType.groupName)?.sequenceNumber ?? 5;
        const win = taktWindow(
          start,
          takt,
          block?.floors ?? 1,
          loc?.level ?? w.location.level,
          loc?.sequenceNumber ?? 0,
          order,
        );

        w.plannedStartDate = win.plannedStartDate;
        w.plannedEndDate = win.plannedEndDate;
        w.overdueDays =
          w.status !== "completed" && win.plannedEndDate < new Date().toISOString().slice(0, 10)
            ? Math.round((Date.now() - Date.parse(`${win.plannedEndDate}T00:00:00Z`)) / 86_400_000)
            : 0;
        updated++;
      }

      return ok({ data: { taktDays: takt, updated, frozen } });
    }

    if (c === "work-items") {
      // Ажлын төрлийг ГАРААР нэмэх — түүний түвшний бүх байршилд.
      if (!segments[3] && method === "POST") {
        if (!session.canEditPlan) {
          return fail(403, "Forbidden", "Танд төлөвлөгөө засах эрх байхгүй.");
        }

        const p = body as {
          workTypeId?: string;
          workTypeIds?: string[];
          plannedQty?: number;
          locationId?: string;
        };

        // Барилгын төлөвлөлт "нэг давхарт ямар ажлууд" гэсэн БАГЦААР явдаг тул
        // олон төрлийг нэг дор хүлээж авна. Ганц `workTypeId` нь хуучин хэлбэр.
        const ids = p?.workTypeIds?.length ? p.workTypeIds : p?.workTypeId ? [p.workTypeId] : [];
        if (ids.length === 0) return fail(422, "ValidationError", "Ажлын төрөл сонгоно уу.");

        const qty = Number(p?.plannedQty) || 0;
        const skipped: { name: string; reason: string }[] = [];
        let created = 0;

        for (const id of ids) {
          const wt = db.workTypes.find((x) => x.id === id);
          if (!wt) return fail(422, "ValidationError", "Ажлын төрөл олдсонгүй.");

          const targets = db.locations.filter(
            (l) =>
              l.blockId === b && (p?.locationId ? l.id === p.locationId : l.level === wt.level),
          );
          if (targets.length === 0) {
            skipped.push({ name: wt.name, reason: "Тохирох байршил алга" });
            continue;
          }

          // Давхардвал тоо хэмжээ давхарлаж, гүйцэтгэлийн хувь худал болно.
          const have = new Set(
            db.workItems
              .filter((w) => w.blockId === b && w.workTypeId === wt.id)
              .map((w) => w.locationId),
          );
          const fresh = targets.filter((l) => !have.has(l.id));
          if (fresh.length === 0) {
            skipped.push({ name: wt.name, reason: "Аль хэдийн нэмэгдсэн" });
            continue;
          }

          // Гараар нэмсэн ажил ч нэг хуваарьт багтана — эс бөгөөс загвараар
          // үүссэн ажил огноотой, гараар нэмсэн нь огноогүй болж хоёр өөр
          // жишгээр хэмжигдэнэ.
          const order = db.groups.find((g) => g.name === wt.groupName)?.sequenceNumber ?? 5;

          for (const loc of fresh) {
            const window = taktWindow(
              block?.startDate ?? new Date().toISOString().slice(0, 10),
              block?.taktDays ?? 5,
              block?.floors ?? 1,
              wt.level,
              loc.sequenceNumber ?? 0,
              order,
            );

            const item: WorkItem = {
              id: mockId(`wi-${b}`),
              blockId: b,
              locationId: loc.id,
              workTypeId: wt.id,
              name: `${wt.name} — ${loc.name}`,
              unit: wt.unit,
              plannedQty: qty,
              reportedQty: 0,
              acceptedQty: 0,
              remainingQty: qty,
              percentage: 0,
              ...window,
              status: "not_started",
              reviewState: "none",
              overdueDays: 0,
              location: { id: loc.id, path: loc.path, level: loc.level },
              workType: { id: wt.id, name: wt.name, groupName: wt.groupName },
              contractor: null,
            };
            db.workItems.push(item);
            db.byId.set(item.id, item);
            created++;
          }
        }

        // Бүгд алгасагдвал л алдаа — заримыг нь нэмж чадсан бол амжилттай.
        if (created === 0) {
          return fail(
            409,
            "Conflict",
            "Сонгосон ажлууд аль хэдийн нэмэгдсэн эсвэл тохирох байршил алга.",
          );
        }

        return { status: 201, body: { data: { created, skipped } } };
      }

      // Ажлын бүлэг/төрлөөр бөөнөөр хариуцагч оноох.
      if (segments[3] === "assign" && method === "POST") {
        if (!session.canManageContractors) {
          return fail(403, "Forbidden", "Танд гүйцэтгэгч оноох эрх байхгүй.");
        }

        const p = body as {
          workTypeGroupId?: string;
          workTypeId?: string;
          contractorId?: string | null;
          reassignExisting?: boolean;
        };
        if (!p?.workTypeGroupId && !p?.workTypeId) {
          return fail(422, "ValidationError", "Ажлын бүлэг эсвэл ажлын төрлийг заана уу.");
        }

        const group = db.groups.find((g) => g.id === p.workTypeGroupId);
        let targets = blockItems.filter((w) =>
          p.workTypeId ? w.workTypeId === p.workTypeId : w.workType.groupName === group?.name,
        );
        if (!p.reassignExisting) targets = targets.filter((w) => !w.contractor);

        // Гүйцэтгэл бүртгэгдсэн ажлын хариуцагчийг солих нь түүхийг гуйвуулна.
        const started = targets.filter(
          (w) => w.reportedQty > 0 && w.contractor && w.contractor.id !== p.contractorId,
        ).length;
        if (started > 0) {
          return fail(
            409,
            "Conflict",
            `${started} ажилд гүйцэтгэл аль хэдийн бүртгэгдсэн байна. ` +
              "Хариуцагчийг нь солих боломжгүй — гүйцэтгэлийн түүх өөр компанид шилжинэ.",
          );
        }

        const contractor = db.contractors.find((x) => x.id === p.contractorId);
        for (const w of targets) {
          w.contractor = contractor ? { id: contractor.id, name: contractor.name } : null;
        }

        return ok({ data: { affected: targets.length, contractorId: p.contractorId ?? null } });
      }

      // Нэг ажлын төрлийн БҮХ мөрөнд тоо хэмжээ оруулах.
      if (segments[3] === "set-quantity" && method === "POST") {
        if (!session.canEditPlan) {
          return fail(403, "Forbidden", "Танд төлөвлөгөөт тоо хэмжээ засах эрх байхгүй.");
        }

        const p = body as {
          workTypeId?: string;
          plannedQty?: number;
          overwriteExisting?: boolean;
        };
        const qty = Number(p?.plannedQty);
        if (!p?.workTypeId) return fail(422, "ValidationError", "workTypeId заавал.");
        if (!Number.isFinite(qty) || qty < 0)
          return fail(422, "ValidationError", "plannedQty эерэг тоо байх ёстой.");

        let targets = blockItems.filter((w) => w.workTypeId === p.workTypeId);
        if (!p.overwriteExisting) targets = targets.filter((w) => w.plannedQty === 0);

        // Батлагдсанаас бага төлөвлөгөө тавьвал хувь 100-аас давна.
        const conflicts = targets.filter((w) => w.acceptedQty > qty).length;
        if (conflicts > 0) {
          return fail(
            409,
            "Conflict",
            `${conflicts} ажилд батлагдсан хэмжээ ${qty}-аас их байна. ` +
              "Төлөвлөгөөг батлагдсанаас бага болгох боломжгүй.",
          );
        }

        for (const w of targets) applyPlannedQty(w, qty);

        return ok({ data: { affected: targets.length, designUpdated: false } });
      }

      const rows = filterWorkItems(blockItems, q);
      return ok(paginate(rows, q));
    }

    if (c === "summary") {
      const groupBy = (q.get("groupBy") ?? "floor") as SummaryGroupBy;
      const items = filterWorkItems(blockItems, q);
      const plannedQty = items.reduce((s, w) => s + w.plannedQty, 0);
      const acceptedQty = items.reduce((s, w) => s + w.acceptedQty, 0);
      const summary: BlockSummary = {
        block: { id: block.id, name: block.name },
        totals: {
          workItems: items.length,
          plannedQty: round(plannedQty),
          reportedQty: round(items.reduce((s, w) => s + w.reportedQty, 0)),
          acceptedQty: round(acceptedQty),
          percentage: avgPercentage(items),
          ...statusCounts(items),
          pendingInspections: items.filter((w) => w.reviewState === "pending").length,
          overdue: items.filter((w) => w.overdueDays > 0).length,
          plannedStartDate: minDate(items),
          plannedEndDate: maxDate(items),
        },
        groups: summarize(items, groupBy),
      };
      return ok({ data: summary });
    }
  }

  // --- work items ---
  if (a === "work-items" && b) {
    const item = db.byId.get(b);
    if (!item) return fail(404, "NotFound", "WorkItem олдсонгүй.");

    // Барилга нь харагддаг ч тэр барилгын БҮХ ажил гүйцэтгэгчийнх биш.
    if (isRep() && item.contractor?.id !== session.contractorId) {
      return fail(403, "Forbidden", "Энэ ажил таны хариуцлагад байхгүй.");
    }

    if (!c) {
      // Буруу нэмсэн ажлыг устгах. Гүйцэтгэл орсон бол хориглоно —
      // түүх алга болно.
      if (method === "DELETE") {
        if (!session.canEditPlan) {
          return fail(403, "Forbidden", "Танд төлөвлөгөө засах эрх байхгүй.");
        }
        if (item.reportedQty > 0) {
          return fail(409, "Conflict", "Энэ ажилд гүйцэтгэл бүртгэгдсэн тул устгах боломжгүй.");
        }

        const idx = db.workItems.findIndex((w) => w.id === item.id);
        if (idx >= 0) db.workItems.splice(idx, 1);
        db.byId.delete(item.id);

        return { status: 204, body: null };
      }

      if (method === "PATCH") {
        const p = body as Partial<WorkItem>;

        if (p.plannedQty !== undefined) {
          if (!session.canEditPlan) {
            return fail(403, "Forbidden", "Танд төлөвлөгөөт тоо хэмжээ засах эрх байхгүй.");
          }
          if (p.plannedQty < item.acceptedQty) {
            return fail(
              409,
              "Conflict",
              `Энэ ажилд ${item.acceptedQty} ${item.unit} аль хэдийн батлагдсан байна. ` +
                "Төлөвлөгөөг түүнээс бага болгох боломжгүй.",
            );
          }
          applyPlannedQty(item, p.plannedQty);
        }

        // `plannedQty`-г дээр тусад нь боловсруулсан тул дахин бичихгүй.
        const rest = { ...p };
        delete rest.plannedQty;
        Object.assign(item, rest);
        recalc(item);
      }
      return ok({ data: item });
    }

    if (c === "progress") {
      if (method === "POST") {
        const payload = body as {
          completedQty?: number;
          remarks?: string;
          workersCount?: number;
        };
        const qty = Number(payload?.completedQty);
        if (!Number.isFinite(qty) || qty <= 0)
          return fail(422, "ValidationError", "completedQty эерэг тоо байх ёстой.");
        if (qty > item.remainingQty)
          return fail(
            422,
            "ValidationError",
            `Үлдэгдэл ${item.remainingQty} ${item.unit} — түүнээс их байж болохгүй.`,
          );

        const entry: ProgressEntry = {
          id: mockId(`pe-${item.id}`),
          workItemId: item.id,
          completedQty: qty,
          recordedAt: new Date().toISOString(),
          workersCount: payload.workersCount,
          remarks: payload.remarks,
          reportedBy: {
            id: session.id,
            name: session.name,
            role: session.role,
          },
          photos: [],
          photoCount: 0,
        };
        extraProgress.set(item.id, [entry, ...(extraProgress.get(item.id) ?? [])]);
        item.reportedQty = round(item.reportedQty + qty);
        recalc(item);
        recalcReview(item);

        return created(entry);
      }
      const rows = [...(extraProgress.get(item.id) ?? []), ...progressFor(item)];
      return ok({
        data: rows,
        meta: { total: rows.length, page: 1, pageSize: rows.length },
      });
    }

    if (c === "inspections") {
      if (method === "POST") {
        // Гүйцэтгэгч өөрийгөө батлахгүй — backend `canInspect()`-тэй ижил.
        if (!session.canInspect) {
          return fail(403, "Forbidden", "Танд баталгаажуулах эрх байхгүй.");
        }

        const p = body as {
          stage?: string;
          result?: string;
          acceptedQty?: number;
          reason?: string;
          checklist?: { itemId?: string; result?: string }[];
        };
        const acceptedQty = Number(p?.acceptedQty ?? 0);
        if (p?.result !== "accepted" && !p?.reason)
          return fail(422, "ValidationError", "Татгалзах шалтгаан заавал.");

        // "Зөвхөн зураг дээр үндэслэн ажил батлахгүй" — backend-тэй ижил хаалт.
        const clError = checklistError(item, p?.result ?? "accepted", p?.checklist ?? []);
        if (clError) return fail(422, "ValidationError", clError);

        const insp: Inspection = {
          id: mockId(`insp-${item.id}`),
          workItemId: item.id,
          stage: (p.stage as Inspection["stage"]) ?? "general_contractor",
          result: (p.result as Inspection["result"]) ?? "accepted",
          acceptedQty,
          // Татгалзсан ба хянагдаагүй хоёр өөр зүйл — backend-тэй ижил.
          rejectedQty:
            p.result === "accepted"
              ? 0
              : round(Math.max(item.reportedQty - item.acceptedQty - acceptedQty, 0)),
          reason: p.reason,
          inspectedAt: new Date().toISOString(),
          inspector: { id: session.id, name: session.name },
        };
        extraInspections.set(item.id, [insp, ...(extraInspections.get(item.id) ?? [])]);
        item.acceptedQty = round(item.acceptedQty + acceptedQty);
        // ТАТГАЛЗСАН хэмжээ мэдээлсэн дүнгээс хасагдана — ингэснээр үлдэгдэл
        // эргэж бүтэн болж, гүйцэтгэгч засвараа ижил мөрөн дээр дахин
        // мэдээлж чадна. Хасахгүй бол «үлдэгдэл 0» болж мухардана.
        item.reportedQty = round(Math.max(item.reportedQty - insp.rejectedQty, 0));
        recalc(item);
        recalcReview(item);

        return created(insp);
      }
      const rows = [...(extraInspections.get(item.id) ?? []), ...inspectionsFor(item)];
      return ok({
        data: rows,
        meta: { total: rows.length, page: 1, pageSize: rows.length },
      });
    }

    // --- Хугацаа сунгах (шалтгаан заавал) ---
    if (c === "extend" && method === "POST") {
      if (!session.canEditPlan) {
        return fail(403, "Forbidden", "Танд төлөвлөгөө засах эрх байхгүй.");
      }

      const p = body as { plannedEndDate?: string; category?: string; reason?: string };
      if (!p?.plannedEndDate) return fail(422, "ValidationError", "Шинэ дуусах огноог сонгоно уу.");
      if (!p?.category || !(p.category in ISSUE_LABELS)) {
        return fail(422, "ValidationError", "Саатлын шалтгааныг сонгоно уу.");
      }
      if (!p?.reason?.trim()) return fail(422, "ValidationError", "Тайлбар бичнэ үү.");

      const current = item.plannedEndDate;
      // Огноог урагш татах нь сунгах биш — хоцролтыг хиймлээр үүсгэнэ.
      if (current && p.plannedEndDate <= current) {
        return fail(
          422,
          "ValidationError",
          `Шинэ огноо одоогийнхоос (${current}) хойш байх ёстой.`,
        );
      }

      item.plannedEndDate = p.plannedEndDate;
      // Хугацаа сунгамагц хоцролт тэглэгдэнэ — шинэ огноо ирээдүйд байгаа.
      item.overdueDays =
        p.plannedEndDate < new Date().toISOString().slice(0, 10)
          ? Math.round((Date.now() - Date.parse(`${p.plannedEndDate}T00:00:00Z`)) / 86_400_000)
          : 0;

      // Шалтгааныг АСУУДЛЫН бүртгэлд — хоцролтын статистик нэг дороос гарна.
      const issue: MockIssue = {
        id: mockId("iss"),
        workItemId: item.id,
        workItemName: item.name,
        ...issuePlace(item),
        category: p.category,
        categoryLabel: ISSUE_LABELS[p.category],
        severity: "medium",
        status: "open",
        description: `Хугацаа сунгав: ${current ?? "—"} → ${p.plannedEndDate}. ${p.reason.trim()}`,
        reportedBy: session.name,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      };
      mockIssues.set(item.id, [issue, ...(mockIssues.get(item.id) ?? [])]);

      return ok({ data: item });
    }

    if (c === "contractor" && method === "PATCH") {
      if (!session.canManageContractors) {
        return fail(403, "Forbidden", "Танд гүйцэтгэгч оноох эрх байхгүй.");
      }
      const p = body as { contractorId?: string | null };
      if (item.reportedQty > 0 && item.contractor && item.contractor.id !== p?.contractorId) {
        return fail(
          409,
          "Conflict",
          "Энэ ажилд гүйцэтгэл бүртгэгдсэн тул хариуцагчийг солих боломжгүй.",
        );
      }
      const ctr = getDb().contractors.find((x) => x.id === p?.contractorId);
      item.contractor = ctr ? { id: ctr.id, name: ctr.name } : null;

      return ok({ data: item });
    }

    // Шалгалт хийхийн өмнө "юу бөглөх вэ" гэдгийг эндээс асууна.
    if (c === "checklist") {
      return ok({ data: resolveChecklist(item) });
    }

    if (c === "issues") {
      if (method === "POST") {
        const p = body as { category?: string; severity?: string; description?: string };
        if (!p?.category || !(p.category in ISSUE_LABELS))
          return fail(422, "ValidationError", "Ангилал буруу байна.");
        if (!p?.description?.trim()) return fail(422, "ValidationError", "Тайлбар заавал бичнэ.");

        const issue: MockIssue = {
          id: mockId("iss"),
          workItemId: item.id,
          workItemName: item.name,
          ...issuePlace(item),
          category: p.category,
          categoryLabel: ISSUE_LABELS[p.category],
          severity: p.severity ?? "medium",
          status: "open",
          description: p.description.trim(),
          reportedBy: session.name,
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        };
        mockIssues.set(item.id, [issue, ...(mockIssues.get(item.id) ?? [])]);

        return created(issue);
      }

      const rows = mockIssues.get(item.id) ?? [];

      return ok({ data: rows, meta: { total: rows.length, page: 1, pageSize: 50 } });
    }

    // Зураг — mock-д файл хадгалахгүй тул хоосон жагсаалт. Дэлгэц "Зураг алга"
    // гэсэн төлөвөө зөв харуулж байгаа эсэхийг шалгахад хангалттай.
    if (c === "photos") {
      if (method === "POST") return fail(501, "NotImplemented", "Mock горимд зураг хадгалахгүй.");

      return ok({ data: [], meta: { total: 0, page: 1, pageSize: 50 } });
    }
  }

  return fail(404, "NotFound", `Mock-д ${method} /${segments.join("/")} хэрэгжээгүй.`);
}

export { MOCK_IDS };
