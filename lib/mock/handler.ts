/**
 * Mock router — API endpoint-уудыг санах ой дээрх өгөгдлөөс хариулна.
 *
 * Санаатайгаар "жинхэнэ шиг" ажиллана: шүүлтүүр, хуудаслалт, `meta.total`,
 * сервер талын нэгтгэл бүгд хэрэгжсэн. Бүх мөрийг нэг дор буцаадаг хялбар
 * mock хийвэл хуудаслалтын алдааг нуух тул ашиггүй байх байсан.
 */
import {
  createBlock,
  getDb,
  GROUP_ORDER,
  inspectionsFor,
  mockId,
  MOCK_IDS,
  MOCK_INSPECTORS,
  pollJob,
  progressFor,
  startApplyJob,
  taktWindow,
} from "./store";
import {
  CONTRACTOR_CATEGORIES,
  CONTRACTOR_STATUSES,
  formatQty,
  MATERIAL_UNITS,
  missingContractFields,
} from "@/lib/domain";
import type {
  Block,
  BlockSummary,
  Agreement,
  BudgetImport,
  BudgetImportType,
  ConcreteOrder,
  ImportReport,
  MaterialOrder,
  MaterialOrderKind,
  MaterialOrderLine,
  ImportSummary,
  AgreementDraftLine,
  Contractor,
  ExtensionRequest,
  Inspection,
  InspectionStage,
  ReviewState,
  ItemCounts,
  StatusCounts,
  ProgressEntry,
  ProjectDashboard,
  SummaryGroup,
  SummaryGroupBy,
  WorkItem,
  WorkItemFilters,
  WorkType,
} from "@/lib/api/types";

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
  /** Албан тушаал — үүргээс өөр. */
  position: string | null;
  contractorId: string | null;
  canReportProgress: boolean;
  canInspect: boolean;
  /** 1-р шат хийх эрх — `canInspect`-ээс ӨРГӨН (талбайн инженер орно). */
  canCheck: boolean;
  canManageContractors: boolean;
  canAssignInspectors: boolean;
  canApproveExtensions: boolean;
  canManageUsers: boolean;
  canManageProjects: boolean;
  canManageReferenceData: boolean;
  canEditPlan: boolean;
  /** Мөнгө харах эрх — батлахаас тусдаа. */
  canSeeMoney: boolean;
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
  /*
   * Анхдагч сесс нь АДМИН, захирал БИШ.
   *
   * Доорх бүх эрх `true` — админд тэр нь ҮНЭН. Урьд нь энэ сесс захирал
   * байсан атлаа бүх эрхтэй байв: захирал юу ч батлахгүй болсон тул тэр
   * нь ХУДАЛ болж, дэлгэцийг буруу мэдээлэл дээр бүтээх эрсдэлтэй.
   */
  id: "usr-seed-0",
  name: "Системийн админ",
  email: "admin@cpms.test",
  role: "admin",
  roleLabel: "Системийн админ",
  position: null,
  contractorId: null,
  canReportProgress: true,
  canInspect: true,
  canCheck: true,
  canManageContractors: true,
  canAssignInspectors: true,
  canApproveExtensions: true,
  canManageUsers: true,
  canManageProjects: true,
  canManageReferenceData: true,
  canEditPlan: true,
  canSeeMoney: true,
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
/** Захирал ОРООГҮЙ — тэр юу ч батладаггүй, зөвхөн хардаг. */
const INSPECTOR_ROLES = ["inspector", "general_engineer", "admin"];
/** Хүлээгдэж буй төлвүүд — backend-ийн `WorkItem::PENDING_STATES`. */
const PENDING_STATES: ReviewState[] = ["pending_check", "pending_approval"];
/** Буцаагдсан төлвүүд — backend-ийн `WorkItem::RETURNED_STATES`. */
const RETURNED_STATES: ReviewState[] = ["returned_by_site", "returned_by_final"];
/** Шат бүрийг хийх эрхтэй үүрэг — backend-ийн `Inspection::STAGE_ROLES`. */
const STAGE_ROLES: Record<InspectionStage, string[]> = {
  site_check: ["site_engineer", "inspector", "general_engineer", "project_manager", "admin"],
  final_approval: ["inspector", "general_engineer", "admin"],
};
const UNRESTRICTED_ROLES = ["admin", "director", "general_engineer"];
/** Хэрэглэгч удирдах эрхтэй үүрэг — backend-ийн `USER_MANAGER_ROLES`. */
/** ЗӨВХӨН АДМИН: үүрэг оноох хүн өөртөө ямар ч эрх өгч чадна. */
const USER_MANAGER_ROLES = ["admin"];
/**
 * Хяналтын инженер оноох эрхтэй үүрэг — backend-ийн `canAssignInspectors`.
 *
 * Гүйцэтгэгч оноохоос САЛГАСАН: гүйцэтгэгч нь гэрээний шийдвэр, хяналтын
 * инженер нь дотоод хуваарилалт.
 */
const INSPECTOR_ASSIGNER_ROLES = ["admin", "general_engineer", "project_manager"];
/** Гүйцэтгэгч оноох эрхтэй үүрэг — backend-ийн `canManageContractors`. */
const CONTRACTOR_MANAGER_ROLES = ["admin", "project_manager"];

/**
 * МӨНГӨ харах эрхтэй үүргүүд — backend-ийн `User::canSeeMoney()`.
 *
 * Захирал ОРНО (юу ч батлахгүй ч зардлаа мэдэх ёстой), талбайн
 * инженер ба хяналтын инженер ОРОХГҮЙ.
 */
const MONEY_READER_ROLES = ["admin", "director", "general_engineer", "project_manager"];

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  /**
   * Албан тушаал — системийн үүргээс ТУСДАА.
   *
   * Б.Сайхантамир «Гэрээний мэргэжилтэн» атлаа `inspector` үүрэгтэй. Хоёрыг
   * нэгтгэвэл дөрвөн хяналтын инженерийг дэлгэц дээр ялгах арга үгүй болно.
   */
  position?: string | null;
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

/*
 * Backend-ийн `ChecklistSeeder::TEMPLATES`-ЫН ХУУЛБАР — мөр бүр үгчлэн ижил.
 *
 * Урьд нь энд 3 бүлэг, багасгасан мөртэй байсан бол backend дээр 5 бүлэг,
 * илүү дэлгэрэнгүй жагсаалт байв. Зөрөх нь mock-ийн ХАМГИЙН АЮУЛТАЙ алдаа:
 * цахилгаан, сантехникийн ажлыг mock дээр хуудасгүй батлуулчихаад жинхэнэ
 * сервер дээр «Чанарын хуудас дутуу» гэж 422 өгнө.
 */
const CHECKLIST_SEED: Record<string, [string, boolean][]> = {
  Угсралт: [
    ["Арматурын диаметр, алхам зурагтай тохирч байна", true],
    ["Хэвний бэхэлгээ бат бөх, гажилтгүй", true],
    ["Хамгаалалтын давхаргын зузаан хангасан", true],
    ["Бетоны маркийн гэрчилгээ хавсаргасан", true],
    ["Ажлын байрны цэвэрлэгээ хийгдсэн", false],
  ],
  Өрлөг: [
    ["Өрлөгийн эгнээ хэвтээ, босоо түвшин зөв", true],
    ["Заадасны зузаан жигд", true],
    ["Зуурмагийн харьцаа стандартын дагуу", true],
    ["Хаалга, цонхны нүх зурагтай тохирч байна", true],
  ],
  Засал: [
    ["Гадаргуу тэгш, ан цавгүй", true],
    ["Өнгө, материал зурагт заасантай тохирч байна", true],
    ["Булан, уулзвар цэвэр", true],
    ["Ажлын дараа хог цэвэрлэгдсэн", false],
  ],
  цахилгаан: [
    ["Кабелийн хөндлөн огтлол төслийн дагуу", true],
    ["Тусгаарлалтын эсэргүүцэл хэмжигдсэн", true],
    ["Газардуулга холбогдсон", true],
    ["Тэмдэглэгээ, шошго хийгдсэн", false],
  ],
  сантехник: [
    ["Даралтын сорил хийгдэж, алдагдалгүй", true],
    ["Налуу, хаялбар зөв", true],
    ["Холболтын битүүмжлэл шалгагдсан", true],
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



/**
 * Тохиролцооны оролтыг шалгана — backend-ийн FormRequest-тэй ижил.
 *
 * Мөнгөний дүрмүүд: бартер+бэлэн=100%, үнэ 0-ээс их, мөр заавал, профайл
 * бүрэн. Нэг нь mock-д дутвал дэлгэц тэр дүрмийг харгалзахгүй бүтээгдэнэ.
 */
/**
 * Тохиролцоо харах эрх.
 *
 * Тохиролцоонд МӨНГӨ байна — талбайн инженер, гүйцэтгэгчид хэрэггүй.
 */
function canReadAgreements(): boolean {
  return session.canManageContractors || AGREEMENT_APPROVER_ROLES.includes(session.role);
}

function agreementPayloadError(p: Record<string, unknown>, contractors: Contractor[]) {
  const lines = (p.lines as Agreement["lines"]) ?? [];

  if (lines.length === 0) {
    return fail(422, "ValidationError", "Ажлын мөр заавал — төлбөр бодогдох зүйл байх ёстой.");
  }

  if (lines.some((l) => !(l.unitPrice > 0))) {
    return fail(422, "ValidationError", "Нэгж үнэ 0-ээс их байх ёстой.");
  }

  const sum = Number(p.barterPercent ?? 0) + Number(p.cashPercent ?? 100);
  if (Math.abs(sum - 100) > 0.01) {
    return fail(
      422,
      "ValidationError",
      `Бартер ба бэлэн мөнгөний нийлбэр 100% байх ёстой — одоо ${sum}%.`,
    );
  }

  const c = contractors.find((x) => x.id === p.contractorId);
  if (!c) return fail(422, "ValidationError", "Гүйцэтгэгч олдсонгүй.");

  if (c.canTakeWork === false) {
    return fail(
      422,
      "ValidationError",
      `${c.name} нь «${c.statusLabel}» төлөвтэй — тохиролцоо бичих боломжгүй.`,
    );
  }

  const missing = c.missingContractFields ?? [];
  if (missing.length > 0) {
    return fail(422, "ValidationError", `Гүйцэтгэгчийн мэдээлэл дутуу: ${missing.join(", ")}.`);
  }

  return null;
}

/** Тохиролцоонууд — backend-ийн `agreements` хүснэгт. */
const mockAgreements = new Map<string, Agreement>();

/** Батлах эрхтэй үүрэг — backend-ийн `Agreement::APPROVER_ROLES`. */
const AGREEMENT_APPROVER_ROLES = ["admin", "general_engineer"];

/**
 * Дүнг СЕРВЕР бодно — backend-ийн accessor-уудтай ижил.
 *
 * Дэлгэц тоо × үнэ гэж дахин бодвол бөөрөнхийлөл зөрч, нийт дүн мөрүүдийн
 * нийлбэртэй таарахаа болино. Төлбөрийн баримтад тэр нь хүлээн
 * зөвшөөрөгдөхгүй.
 */
function computeAgreement(a: Agreement): Agreement {
  const lines = (a.lines ?? []).map((l) => ({
    ...l,
    amount: round2(l.quantity * l.unitPrice),
    budgetAmount: round2(l.quantity * (l.budgetUnitPrice ?? 0)),
  }));

  const total = round2(lines.reduce((s2, l) => s2 + (l.amount ?? 0), 0));
  const budget = round2(lines.reduce((s2, l) => s2 + (l.budgetAmount ?? 0), 0));

  a.lines = lines;
  a.totalAmount = total;
  a.budgetAmount = budget;
  a.variancePercent = budget > 0 ? Math.round(((total - budget) / budget) * 1000) / 10 : null;
  a.retentionAmount = round2((total * a.retentionPercent) / 100);
  a.statusLabel = AGREEMENT_STATUSES[a.status];
  a.isEditable = a.status === "draft";

  return a;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Төлөв — backend-ийн `Agreement::STATUSES`. */
const AGREEMENT_STATUSES: Record<string, string> = {
  draft: "Драфт",
  active: "Хүчин төгөлдөр",
  completed: "Дууссан",
  cancelled: "Цуцлагдсан",
};

/** Хугацаа сунгах хүсэлтүүд — backend-ийн `extension_requests` хүснэгт. */
const mockExtensions = new Map<string, ExtensionRequest>();

/** Сунгалт батлах эрхтэй үүрэг — backend-ийн `ExtensionRequest::APPROVER_ROLES`. */
const EXTENSION_APPROVER_ROLES = ["admin", "general_engineer"];

/**
 * Хүсэлтийг батлаад огноог хойшлуулна.
 *
 * ЗӨВХӨН `plannedEndDate` хөдөлнө. `baselineEndDate` хэвээр — тэр нь
 * хуваарийн гулсалтыг хэмжих цорын гагц тогтмол цэг. Хоёуланг хөдөлгөвөл
 * «хэн ч хэзээ ч хоцроогүй» гэсэн зураг гарна.
 */
function applyExtension(req: ExtensionRequest, decidedBy: string): void {
  const item = getDb().byId.get(req.workItemId);

  if (!item) return;

  item.plannedEndDate = req.requestedEndDate;

  const today = new Date().toISOString().slice(0, 10);
  const since = (date?: string | null) =>
    date && date < today
      ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000)
      : 0;

  item.overdueDays = item.status === "completed" ? 0 : since(item.plannedEndDate);
  item.baselineOverdueDays = item.status === "completed" ? 0 : since(item.baselineEndDate);
  item.extendedDays =
    item.baselineEndDate && item.plannedEndDate
      ? Math.max(
          Math.round(
            (Date.parse(`${item.plannedEndDate}T00:00:00Z`) -
              Date.parse(`${item.baselineEndDate}T00:00:00Z`)) /
              86_400_000,
          ),
          0,
        )
      : 0;

  // Батлагдсан сунгалт сааталд бүртгэгдэнэ — шалтгаан нэг дор хуримтлагдана.
  const issue: MockIssue = {
    id: mockId("iss"),
    workItemId: item.id,
    workItemName: item.name,
    ...issuePlace(item),
    category: req.category,
    categoryLabel: ISSUE_LABELS[req.category],
    severity: "medium",
    status: "open",
    description:
      `Хугацаа сунгав: ${req.currentEndDate ?? "—"} → ${req.requestedEndDate} ` +
      `(${req.requestedDays} хоног). ${req.reason}`,
    reportedBy: req.requestedBy?.name ?? decidedBy,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  mockIssues.set(item.id, [issue, ...(mockIssues.get(item.id) ?? [])]);

  req.status = "approved";
  req.decidedBy = { id: session.id, name: decidedBy };
  req.decidedAt = new Date().toISOString();
}

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

/**
 * Эхний саатлууд — `[ангилал, хүндрэл, хэдэн хоногийн өмнө, шийдэгдсэн эсэх,
 * тайлбар, бүртгэсэн хүн]`.
 *
 * ЯАГААД ЗААВАЛ ХЭРЭГТЭЙ ВЭ: хоосон бүртгэл нь зөвхөн «Саатал» жагсаалтыг
 * хоосон үлдээгээд зогсохгүй — хянах самбарын саатлын хэсэг `openIssues > 0`
 * нөхцөлтэй тул БҮХЭЛДЭЭ зурагддаггүй. Өөрөөр хэлбэл функц нь байгаа ч
 * байхгүй мэт харагдана.
 *
 * `accident` (осол) ОРООГҮЙ. Осол ховор бөгөөд `verify-mock` нь мөргүй
 * ангилал дээр шүүлтүүрээ шалгадаг — энд осол нэмбэл тэр шалгуур утгагүй
 * болно.
 */
const ISSUE_SEED: [string, string, number, number | null, string, string][] = [
  // --- Материал дутсан ---
  [
    "material_shortage",
    "high",
    21,
    null,
    "Арматур Ø12-ийн нийлүүлэлт хоцорч, цутгалт зогссон.",
    "Б.Тамир",
  ],
  [
    "material_shortage",
    "medium",
    18,
    9,
    "Бетон зуурмагийн машин ирээгүй тул цутгалт маргаашлав.",
    "Б.Тамир",
  ],
  [
    "material_shortage",
    "medium",
    16,
    null,
    "Дулаалгын хөөсөнцөр хавтан агуулахад дууссан.",
    "Д.Хулан",
  ],
  [
    "material_shortage",
    "high",
    14,
    null,
    "Цонхны шил хэмжээ таарахгүй ирсэн тул үйлдвэрт буцаалаа.",
    "Д.Хулан",
  ],
  [
    "material_shortage",
    "low",
    12,
    4,
    "Хавтангийн өнгө захиалгаас зөрсөн — дахин татан авав.",
    "Б.Тамир",
  ],
  [
    "material_shortage",
    "medium",
    11,
    null,
    "Цахилгааны кабель 3×2.5 татан авалт удаашрав.",
    "Б.Тамир",
  ],
  [
    "material_shortage",
    "medium",
    9,
    null,
    "Шаварчлагын гипс дутуу, хоёр давхрын ажил хүлээгдэж байна.",
    "Д.Хулан",
  ],
  ["material_shortage", "low", 7, 2, "Сантехникийн фитинг дутуу ирсэн.", "Б.Тамир"],
  ["material_shortage", "low", 5, null, "Хаалганы бэхэлгээний хэрэгсэл ирээгүй.", "Б.Тамир"],
  // --- Гүйцэтгэгч хоцорсон ---
  [
    "contractor_late",
    "high",
    24,
    null,
    "Баг товлосон хугацаанаас 4 хоног хоцорч ирэв.",
    "Б.Батбаяр",
  ],
  [
    "contractor_late",
    "medium",
    20,
    11,
    "Ажилчдын тоо гэрээнд заасны хагас байсныг нөхөв.",
    "Б.Тамир",
  ],
  [
    "contractor_late",
    "medium",
    17,
    null,
    "Өмнөх давхрын ажил дуусаагүй тул эхлэл хойшлов.",
    "Б.Тамир",
  ],
  ["contractor_late", "low", 15, 6, "Ээлжийн ажилчид оройтож ирсэн.", "Д.Хулан"],
  [
    "contractor_late",
    "medium",
    13,
    null,
    "Дэд гүйцэтгэгч гэрээний нөхцөл тохироогүйгээс хүлээлт үүсэв.",
    "Б.Батбаяр",
  ],
  [
    "contractor_late",
    "high",
    10,
    null,
    "Хоёр дахь удаагаа хуваарь алдсан — сануулга өгөв.",
    "Б.Батбаяр",
  ],
  ["contractor_late", "low", 8, 3, "Баг өглөөний ээлжид бүрэн бүрэлдэхүүнээр ирээгүй.", "Б.Тамир"],
  ["contractor_late", "medium", 6, null, "Угсралтын баг өөр объект дээр саатсан.", "Б.Тамир"],
  // --- Цаг агаар ---
  ["weather", "medium", 23, 19, "Хүчтэй салхины улмаас өндөрлөг дэх ажил зогссон.", "Б.Тамир"],
  ["weather", "high", 19, null, "Хасах 28 хэмд бетон цутгалт хойшлов.", "Д.Хулан"],
  ["weather", "medium", 15, 12, "Бороо орсон тул фасадны будгийн ажил зогсов.", "Б.Тамир"],
  ["weather", "low", 12, 10, "Цасны улмаас гадна талбайн ажил хагас өдөр зогссон.", "Б.Тамир"],
  ["weather", "medium", 8, null, "Шороон шуурганы улмаас гадна ажил түр зогслоо.", "Д.Хулан"],
  ["weather", "low", 4, null, "Шөнийн хүйтрэлтээс зуурмагийн чанар унасан.", "Д.Хулан"],
  // --- Техник эвдэрсэн ---
  ["equipment_failure", "high", 22, 15, "Цамхаг кран эвдэрч, засварт 2 хоног зогсов.", "Б.Тамир"],
  ["equipment_failure", "medium", 18, null, "Барилгын өргөгч шат ажиллахгүй болов.", "Б.Тамир"],
  ["equipment_failure", "medium", 14, null, "Бетон шахуургын хоолой гэмтсэн.", "Б.Тамир"],
  ["equipment_failure", "low", 9, 5, "Гагнуурын аппарат тасалдсан — нөөцөөр сольсон.", "Д.Хулан"],
  [
    "equipment_failure",
    "high",
    5,
    null,
    "Түр цахилгаан хангамж тасарч, бүх давхрын ажил зогссон.",
    "Б.Батбаяр",
  ],
  // --- Гүйцэтгэгч ирээгүй ---
  ["no_contractor", "high", 20, null, "Товлосон өдөр баг талбайд огт ирээгүй.", "Б.Батбаяр"],
  [
    "no_contractor",
    "medium",
    16,
    8,
    "Хариуцагч солигдож, хүлээлцэх хугацаа шаардагдсан.",
    "Б.Батбаяр",
  ],
  ["no_contractor", "medium", 12, null, "Энэ ажилд гүйцэтгэгч оноогдоогүй байна.", "Б.Тамир"],
  ["no_contractor", "low", 7, null, "Туслан гүйцэтгэгч холбоо барихгүй байна.", "Б.Тамир"],
  ["no_contractor", "high", 3, null, "Гэрээ цуцлагдаж, шинэ гүйцэтгэгч сонгогдоогүй.", "Б.Батбаяр"],
  // --- Гомдол ---
  [
    "complaint",
    "medium",
    17,
    13,
    "Оршин суугчаас шөнийн дуу чимээний талаар гомдол ирсэн.",
    "Б.Батбаяр",
  ],
  ["complaint", "low", 11, null, "Барилгын хог зам хаасан тухай гомдол.", "Б.Тамир"],
  [
    "complaint",
    "medium",
    6,
    null,
    "Захиалагчийн төлөөлөгч заслын чанарт гомдол гаргав.",
    "Д.Хулан",
  ],
];

let issuesSeeded = false;

const daysAgoIso = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

/**
 * `ISSUE_SEED`-ийг бодит ажлын мөрүүд дээр буулгана.
 *
 * Хоцорсон, дуусаагүй ажлуудыг сонгоно — саатлын бүртгэл нь ЯГ тэдгээр
 * хоцролтыг тайлбарлах учиртай. Мөрүүдийг id-гаар эрэмбэлээд тэнцүү алхмаар
 * гүйлгэнэ: нэг давхар дээр бөөгнөрвөл «нэг л газар бүх асуудал байна» гэсэн
 * худал дүр зураг үүснэ.
 */
function seedIssues(): void {
  if (issuesSeeded) return;
  issuesSeeded = true;

  const candidates = getDb()
    .workItems.filter((w) => w.overdueDays > 0 || w.status === "in_progress")
    .sort((a, b) => a.id.localeCompare(b.id));
  if (candidates.length === 0) return;

  ISSUE_SEED.forEach(([category, severity, days, resolvedDays, description, reportedBy], i) => {
    const item = candidates[Math.floor((i * candidates.length) / ISSUE_SEED.length)];
    const issue: MockIssue = {
      id: `iss-seed-${i}`,
      workItemId: item.id,
      workItemName: item.name,
      ...issuePlace(item),
      category,
      categoryLabel: ISSUE_LABELS[category],
      severity,
      status: resolvedDays === null ? "open" : "resolved",
      description,
      reportedBy,
      createdAt: daysAgoIso(days),
      resolvedAt: resolvedDays === null ? null : daysAgoIso(resolvedDays),
    };
    mockIssues.set(item.id, [...(mockIssues.get(item.id) ?? []), issue]);
  });
}

/** Бүх саатал — уншихаас өмнө seed нь заавал буусан байна. */
function allIssues(): MockIssue[] {
  seedIssues();

  return [...mockIssues.values()].flat();
}

const mockUsers: MockUser[] = [
  ...["admin", "director", "inspector", "site_engineer"].map((role, i) => ({
    id: `usr-seed-${i}`,
    name: MOCK_ROLES.find((r) => r.value === role)!.label,
    email: `${role}@cpms.test`,
    role,
    roleLabel: MOCK_ROLES.find((r) => r.value === role)!.label,
    position: null as string | null,
    scopeBlockIds: [] as string[],
    contractorId: null,
    isActive: true,
    canReportProgress: REPORTER_ROLES.includes(role),
    canInspect: INSPECTOR_ROLES.includes(role),
  })),

  /*
   * Төсвөөс оноогддог хяналтын инженерүүд — id нь `store.ts`-ийн
   * `MOCK_INSPECTORS`-оос. Хоёр файлд тусад нь бичвэл ажлын мөр дээрх
   * оноолт хэрэглэгчийн жагсаалттай таарахаа болино.
   *
   * Б.Сайхантамир «Гэрээний мэргэжилтэн» атлаа `inspector` үүрэгтэй —
   * жинхэнэ `staff.json`-д ийм байгаа.
   */
  ...MOCK_INSPECTORS.map((person) => ({
    id: person.id,
    name: person.name,
    email: `${person.id}@cpms.test`,
    role: "inspector",
    roleLabel: MOCK_ROLES.find((r) => r.value === "inspector")!.label,
    position: person.position as string | null,
    scopeBlockIds: [] as string[],
    contractorId: null,
    isActive: true,
    canReportProgress: REPORTER_ROLES.includes("inspector"),
    canInspect: INSPECTOR_ROLES.includes("inspector"),
  })),
];

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
    position: user.position ?? null,
    role: user.role,
    roleLabel: user.roleLabel,
    contractorId: user.contractorId,
    canReportProgress: REPORTER_ROLES.includes(user.role),
    canInspect: INSPECTOR_ROLES.includes(user.role),
    canCheck: STAGE_ROLES.site_check.includes(user.role),
    /*
     * Backend-ийн `canManageContractors()` нь admin, director, project_manager.
     * Урьд нь энд `USER_MANAGER_ROLES` (admin, director) бичигдсэн байв —
     * төслийн менежер mock дээр гүйцэтгэгч оноож чаддаггүй, жинхэнэ сервер
     * дээр чаддаг гэсэн ЗӨРҮҮ. Дэлгэц mock-ийг үзэж бүтээгддэг тул тэр
     * товчийг нуух шийдвэр чимээгүй гарах эрсдэлтэй байв.
     */
    canManageContractors: CONTRACTOR_MANAGER_ROLES.includes(user.role),
    canAssignInspectors: INSPECTOR_ASSIGNER_ROLES.includes(user.role),
    canApproveExtensions: EXTENSION_APPROVER_ROLES.includes(user.role),
    canManageUsers: USER_MANAGER_ROLES.includes(user.role),
    canManageProjects: user.role === "admin",
    canManageReferenceData: UNRESTRICTED_ROLES.includes(user.role),
    canEditPlan: UNRESTRICTED_ROLES.includes(user.role) || user.role === "project_manager",
    canSeeMoney: MONEY_READER_ROLES.includes(user.role),
    scopeBlockIds: user.scopeBlockIds,
  };
}

function contractorSession(id: string, name: string): MockSession {
  return {
    id: `usr-${id}`,
    name,
    position: "Гүйцэтгэгч байгууллага",
    email: `contractor-${id}@cpms.local`,
    role: "contractor",
    roleLabel: "Туслан гүйцэтгэгч",
    contractorId: id,
    canReportProgress: true,
    // Гүйцэтгэгч өөрийгөө батлахгүй — backend-тэй ижил.
    canInspect: false,
    canCheck: false,
    // Гүйцэтгэгч мөнгөний мэдээлэл харахгүй.
    canSeeMoney: false,
    canManageContractors: false,
    canAssignInspectors: false,
    canApproveExtensions: false,
    canManageUsers: false,
    canManageProjects: false,
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
const created = (data: unknown): MockResponse => ({
  status: 201,
  body: { data },
});
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
  /*
   * Хуваарь нь ХЭМЖИГДЭХ мөрүүд.
   *
   * Тоо хэмжээ нь бүртгэгдээгүй ажил «0% хийгдсэн» БИШ, «хэмжих боломжгүй».
   * Хоёуланг нь ижил гэж үзвэл мөрүүдийнхээ 58% нь тоо хэмжээгүй блокийн
   * хувь мөнхөд 42%-иас хэтрэхгүй болно.
   */
  const measurable = rows.filter((w) => w.plannedQty > 0);
  if (measurable.length === 0) return 0;

  const sum = measurable.reduce((s, w) => s + Math.min(w.acceptedQty / w.plannedQty, 1), 0);

  return Math.round((sum / measurable.length) * 100);
}

/** Төлөвийн тоолол — гурав нь харилцан үл огтлолцоно. */
function statusCounts(
  rows: { status: string; plannedQty: number; contractor?: { id: string } | null }[],
): StatusCounts {
  const completedItems = rows.filter((w) => w.status === "completed").length;
  const inProgressItems = rows.filter((w) => w.status === "in_progress").length;

  return {
    completedItems,
    inProgressItems,
    notStartedItems: Math.max(rows.length - completedItems - inProgressItems, 0),
    // Эдгээр нь `notStartedItems`-ийн ДОТОР — тусдаа бүлэг биш, харин
    // «яагаад эхлээгүй вэ» гэсэн асуултын хариулт.
    unmeasuredItems: rows.filter((w) => w.plannedQty <= 0).length,
    unassignedItems: rows.filter((w) => !w.contractor).length,
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

  /*
   * `reviewState` нь нэг төлөв ЭСВЭЛ бүлэг — backend-тэй ижил.
   *
   * Хоёр шат болоход «батлахыг хүлээж буй» хоёр төлөв рүү салсан тул
   * самбарын карт дарахад хоёуланг нь харуулах хэрэгтэй.
   */
  const review = q.get("reviewState");
  if (review === "pending") rows = rows.filter((w) => PENDING_STATES.includes(w.reviewState));
  else if (review === "returned") rows = rows.filter((w) => RETURNED_STATES.includes(w.reviewState));
  else if (review) rows = rows.filter((w) => w.reviewState === review);

  // `contractorId=none` — хариуцагч оноогдоогүй ажлууд.
  const contractorId = q.get("contractorId");
  if (contractorId === "none") rows = rows.filter((w) => !w.contractor);
  else if (contractorId) rows = rows.filter((w) => w.contractor?.id === contractorId);

  // `inspectorId=none` — хяналтын инженер оноогдоогүй · `me` — өөрийн ажил.
  const inspectorId = q.get("inspectorId");
  if (inspectorId === "none") rows = rows.filter((w) => !w.inspector);
  else if (inspectorId === "me") rows = rows.filter((w) => w.inspector?.id === session.id);
  else if (inspectorId) rows = rows.filter((w) => String(w.inspector?.id) === inspectorId);

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
        pendingInspections: b.rows.filter((w) => PENDING_STATES.includes(w.reviewState)).length,
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

const EPSILON = 0.0005;

/**
 * Шатны «сан» — backend-ийн `WorkItem::stagePool()`-тэй ЯГ ижил.
 *
 *   1-р шат: мэдээлсэн − ШАЛГАСАН
 *   2-р шат: ШАЛГАСАН  − баталсан
 *
 * Хоёр шат нэг сангаас идвэл талбайн инженер шалгамагц хяналтын инженерт
 * батлах юу ч үлдэхгүй — яг тэр шалтгаанаар шат нэг удаа хасагдсан.
 */
export function stagePool(item: WorkItem, stage: InspectionStage): number {
  const single = (item.inspectionStages ?? 2) < 2;

  if (stage === "site_check") {
    return round(item.reportedQty - (item.checkedQty ?? 0));
  }

  const source = single ? item.reportedQty : (item.checkedQty ?? 0);

  return round(source - item.acceptedQty);
}

/**
 * Хянагдах төлөв — backend-ийн `WorkItem::resolveReviewState()`-тэй ЯГ ижил.
 *
 * `reportedQty` нь ТАТГАЛЗСАН хэмжээг хассан цэвэр дүн тул засвараа дахин
 * мэдээлмэгц хүлээгдэж буй хэмжээ гарч ирж, төлөв нь өөрөө дараалалд
 * эргэж орно.
 */
function recalcReview(item: WorkItem) {
  const latest = (extraInspections.get(item.id) ?? [])[0];

  // Нэг шаттай ажил 1-р шатыг АЛГАСНА — эс бөгөөс тэр төлөвт мөнхөд гацна.
  const checked = (item.inspectionStages ?? 2) < 2 ? item.reportedQty : (item.checkedQty ?? 0);

  if (checked < item.reportedQty - EPSILON) {
    item.reviewState = "pending_check";

    return;
  }

  if (item.acceptedQty < checked - EPSILON) {
    item.reviewState = "pending_approval";

    return;
  }

  if ((latest?.rejectedQty ?? 0) > 0) {
    item.reviewState = latest.stage === "site_check" ? "returned_by_site" : "returned_by_final";

    return;
  }

  item.reviewState = item.reportedQty <= 0 ? "none" : "approved";
}

/**
 * Дараагийн шат ба түүний сан — backend-ийн `WorkItemResource`-тэй ижил.
 *
 * Дэлгэц эдгээрийг ӨӨРӨӨ бодохгүй: хуучин томьёогоор бодвол батлах товч
 * нь шалгагдаагүй хэмжээг санал болгоод сервер татгалзана.
 */
/**
 * Шалгалтын цэгийн хориг — backend-ийн `HoldPointGate`-тэй ИЖИЛ дүрэм.
 *
 * Тухайн байршил БА түүний бүх ДЭЭД байршилд, бүлгийн дараалал нь өмнө
 * байгаа, тоо хэмжээтэй, батлагдаагүй шалгалтын цэг байвал хориглоно.
 *
 * Дээд байршлыг заавал хамруулна: цахилгааны шугам нь ДАВХРЫН түвшинд
 * бүртгэгддэг ч шавардлага нь АЙЛЫН. Зөвхөн ижил байршлыг шалгавал
 * хориг огт ажиллахгүй — яг тэр тохиолдол бодит төсөвт байна.
 */
function holdPointReason(item: WorkItem): string | null {
  const db = getDb();
  const order = GROUP_ORDER[item.workType.groupName];

  if (order === undefined) return null;

  // Байршил ба түүний дээд байршлууд.
  const chain = new Set<string>();
  let node = db.locations.find((l) => l.id === item.locationId);
  while (node) {
    chain.add(node.id);
    node = node.parentId ? db.locations.find((l) => l.id === node!.parentId) : undefined;
  }

  const blockers = db.workItems.filter((w) => {
    if (w.id === item.id || w.blockId !== item.blockId) return false;
    if (!chain.has(w.locationId)) return false;
    /*
     * ДУУСАЛТААР шалгана, төлөвөөр биш — backend-тэй ижил.
     *
     * `reviewState === "approved"` нь «хүлээх юм алга» гэсэн утгатай,
     * «ажил дууссан» гэсэн утгатай БИШ. 100 м шугамын 60-ыг батлуулахад
     * тэр төлөв үнэн болох ч үлдсэн 40 м тавигдаагүй байна.
     */
    if (w.plannedQty <= 0 || w.status === "completed") return false;

    const type = db.workTypes.find((t) => t.id === w.workTypeId);
    if (!type?.isHoldPoint) return false;

    return (GROUP_ORDER[type.groupName] ?? 99) < order;
  });

  if (blockers.length === 0) return null;

  // Үлдэгдлийг нэрлэнэ — «батлагдаагүй» гэж орхивол маргаан гарна.
  const names = blockers
    .slice(0, 3)
    .map(
      (w) =>
        `${w.name} (${db.locations.find((l) => l.id === w.locationId)?.name})` +
        ` — ${formatQty(w.remainingQty, w.unit)} үлдсэн`,
    )
    .join(", ");
  const more = blockers.length > 3 ? ` ба бусад ${blockers.length - 3}` : "";

  return (
    `Шалгалтын цэг батлагдаагүй байна: ${names}${more}. ` +
    "Далд хийгдэх ажлыг батлуулсны дараа үргэлжлүүлнэ."
  );
}


/**
 * РД-ийн давхардлыг шалгана — backend-ийн `unique` дүрэмтэй ижил.
 *
 * Нэрээр давхардлыг барих нь хүрэлцэхгүй: «Бетон И дезайн» ба «Бетон И
 * Дезайн» хоёр өөр мөр болдог. РД нь цорын гагц найдвартай таних тэмдэг.
 */

/**
 * Гэрээ цуцлагдсан гүйцэтгэгчид ШИНЭ ажил оноогдохгүй — backend-тэй ижил.
 *
 * Оноовол акт нь түүн рүү явж, төлбөр гарах эрсдэлтэй. Хуучин ажлыг нь
 * хөндөхгүй: түүх, барьцаа, торгууль үлдэх ёстой.
 */
function inactiveContractorError(contractorId: string | null | undefined) {
  if (!contractorId) return null;

  const c = getDb().contractors.find((x) => x.id === contractorId);

  if (c && c.canTakeWork === false) {
    return fail(
      422,
      "ValidationError",
      `${c.name} нь «${c.statusLabel}» төлөвтэй — шинэ ажил оноох боломжгүй.`,
    );
  }

  return null;
}

function contractorRegError(reg: string | null | undefined, selfId: string | null) {
  if (!reg) return null;

  const clash = getDb().contractors.find((x) => x.registrationNo === reg && x.id !== selfId);

  return clash
    ? fail(422, "ValidationError", "Ийм регистрийн дугаартай гүйцэтгэгч аль хэдийн бүртгэгдсэн.")
    : null;
}

function applyStage(item: WorkItem) {
  item.nextStage =
    item.reviewState === "pending_check"
      ? "site_check"
      : item.reviewState === "pending_approval"
        ? "final_approval"
        : null;

  item.stagePool = item.nextStage ? stagePool(item, item.nextStage) : 0;
}

function recalc(item: WorkItem) {
  item.remainingQty = round(Math.max(item.plannedQty - item.acceptedQty, 0));
  item.percentage =
    item.plannedQty > 0 ? Math.round((item.acceptedQty / item.plannedQty) * 100) : 0;
  // `plannedQty > 0` нь ЗААВАЛ — эс бөгөөс тоо хэмжээгүй мөр дээр
  // `0 >= 0` үнэн болж, ХИЙГДЭЭГҮЙ ажил «дууссан» гэж тоологдоно.
  item.status =
    item.plannedQty > 0 && item.acceptedQty >= item.plannedQty
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
// ---------------------------------------------------------------------------
// Төсвийн импорт
// ---------------------------------------------------------------------------

/**
 * Байршуулсан файлууд — санах ойд.
 *
 * Mock нь xlsx ЗАДАЛДАГГҮЙ. Тайланг зохиомлоор үүсгэнэ, харин бүтэц нь
 * backend-ийнхтэй ЯГ ижил бөгөөд тоонууд нь захиалагчийн ЖИНХЭНЭ файлаас
 * авсан (273 мөр, 109 эвдэрсэн). Ингэснээр дэлгэц нь «бүх зүйл цэвэр»
 * гэсэн хуурамч тохиолдол дээр биш, бодит эмх замбараагүй байдал дээр
 * баригдана.
 */
const mockImports: BudgetImport[] = [];

function importReport(
  block: Block,
  type: BudgetImportType,
  applied: boolean,
  mode: "replace" | "update" = "replace",
): ImportReport {
  const report: ImportReport =
    type === "materials"
      ? {
          type,
          typeLabel: "Материалын төсөв",
          sheet: "Материалын төсөв",
          blockId: block.id,
          blockName: block.name,
          canApply: true,
          summary: { sourceRows: 273, planned: 155, rejected: 118, skipped: 11, existing: 0 },
          sections: [
            {
              title: "Материалын өртөг",
              rows: [
                { label: "Бодит (төсөв)", value: 1_284_506_200, format: "money" },
                { label: "Зах зээл", value: 1_357_118_940, format: "money" },
                { label: "Зөрүү", value: 5.65, format: "percent", tone: "amber" },
                { label: "Бодит үнэгүй мөр", value: 4, format: "count" },
                { label: "Зах зээлийн үнэгүй мөр", value: 9, format: "count" },
              ],
            },
            {
              title: "Холболт",
              rows: [
                { label: "Байршлын багана таарсан", value: 20, format: "count" },
                { label: "Ажилтай холбогдсон мөр", value: 0, format: "count" },
                {
                  label: "Ажилгүй мөр",
                  value: 155,
                  format: "count",
                  note: "Импортлогдоно — үнэ, тоо хэмжээ нь үнэн хэвээр.",
                },
              ],
            },
          ],
          warnings: [
            {
              level: "warn",
              title: "Зах зээлийн үнэ төсвөөс 5.65% өндөр",
              items: ["Зөрүү 72,612,740.00₮. Худалдан авалт хийхээс ӨМНӨ шийдэх асуудал."],
            },
          ],
          errors: [
            { row: 4, code: "2.1.1", name: "Ф8", reason: "Эвдэрсэн нүд: #REF!" },
            { row: 5, code: "2.1.2", name: "ф10", reason: "Эвдэрсэн нүд: #REF!" },
            { row: 6, code: "2.1.3", name: "ф12", reason: "Эвдэрсэн нүд: #REF!" },
            { row: 41, code: "3.1.4", name: "Хөөсөнцөр 50мм", reason: "Тоо хэмжээ олдсонгүй." },
            { row: 58, code: "4.2.1", name: "Гипсэн хавтан", reason: "Танигдахгүй нэгж «хуудас»." },
            {
              row: 92,
              code: "7.1.1",
              name: "Керамик плита",
              reason: "Нийлбэр зөрж байна: файлд 1240, давхруудын нийлбэр 1180.",
            },
          ],
          errorsByReason: [
            { reason: "Эвдэрсэн нүд", count: 109 },
            { reason: "Тоо хэмжээ олдсонгүй.", count: 6 },
            { reason: "Танигдахгүй нэгж", count: 2 },
            { reason: "Нийлбэр зөрж байна", count: 1 },
          ],
        }
      : {
          type,
          typeLabel: "Ажлын хөлсний төсөв",
          sheet: "Ажлын хөлсний төсөв",
          blockId: block.id,
          blockName: block.name,
          canApply: true,
          summary: { sourceRows: 64, planned: 1991, rejected: 14, skipped: 0, existing: 0 },
          sections: [
            {
              title: "Хяналт шалгалт хийх инженер",
              rows: [
                { label: "Инженер оноогдсон", value: 1143, format: "count" },
                { label: "Нэр бий ч таарсангүй", value: 0, format: "count" },
                {
                  label: "Нэр БАЙХГҮЙ",
                  value: 848,
                  format: "count",
                  note: "Эдгээр мөрийн гүйцэтгэл батлахыг хүлээхэд хэн рүү ч явахгүй.",
                },
              ],
            },
            {
              title: "Төсвийн нэгж үнэ",
              rows: [
                { label: "Үнэтэй мөр", value: 1923, format: "count" },
                { label: "Үнэгүй мөр", value: 68, format: "count" },
                { label: "Нийт төсөв", value: 2_841_339_500, format: "money" },
              ],
            },
          ],
          warnings: [
            {
              level: "warn",
              title: "Таних боломжгүй хяналтын инженерийн нэр",
              items: ["Ганаа (4 мөр)"],
            },
          ],
          errors: [
            { row: 31, code: "13.4", name: "Модон хаалга", reason: "Энэ кодтой ажлын төрөл системд алга." },
            { row: 32, code: "13.5", name: "Төмөр хаалга", reason: "Энэ кодтой ажлын төрөл системд алга." },
            { row: 47, code: "15.2", name: "Фасадны амалгаа", reason: "Энэ кодтой ажлын төрөл системд алга." },
          ],
          errorsByReason: [{ reason: "Энэ кодтой ажлын төрөл системд алга.", count: 14 }],
        };

  if (applied) {
    /*
     * ШИНЭЧЛЭХ горимд гүйцэтгэл үлдэж, зөрчил гарч болно.
     *
     * Mock нь бодит тооцоо хийдэггүй ч ХОЁР ГОРИМЫН ЯЛГААГ харуулах
     * ёстой — эс бөгөөс дэлгэцийг зөвхөн нэг тохиолдол дээр барина.
     */
    report.result =
      type === "materials"
        ? { materialsCreated: 155, materialsUpdated: 0, items: 155, quantities: 612 }
        : mode === "update"
          ? {
              items: 1991,
              withoutQuantity: 0,
              pruned: 0,
              created: 12,
              updated: 1979,
              conflicts: [
                {
                  name: "блокон өрлөг",
                  location: "5-р давхар",
                  reportedQty: 400,
                  newPlannedQty: 300,
                  unit: "м2",
                },
              ],
            }
          : { items: 1991, withoutQuantity: 0, pruned: 0, created: 1991, updated: 0, conflicts: [] };
  }

  return report;
}

function importEnvelope(
  record: BudgetImport,
  block: Block,
  mode: "replace" | "update" = "replace",
): MockResponse {
  return ok({
    data: record,
    reports: record.types.map((type) =>
      importReport(block, type, record.status === "applied", mode),
    ),
  });
}

/**
 * Файлд ямар төсөв байгааг таана.
 *
 * Жинхэнэ сервер ХУУДСЫН НЭРийг уншина. Mock нь xlsx задалдаггүй тул
 * файлын нэрээр таамаглана — зөвхөн дэлгэц барихад зориулсан орлуулга.
 * Анхдагч нь ХОЁУЛАА: захиалагчийн жинхэнэ файл яг тийм.
 */
function detectImportTypes(fileName: string): BudgetImportType[] {
  const name = fileName.toLowerCase();

  if (name.includes("material")) return ["materials"];
  if (name.includes("ajil") || name.includes("hols")) return ["quantities"];

  return ["quantities", "materials"];
}

/** Түүхийн мөрөнд харуулах нэгтгэсэн дүн. */
function totalImportSummary(reports: ImportReport[]): ImportSummary {
  return reports.reduce<ImportSummary>(
    (total, r) => ({
      sourceRows: total.sourceRows + r.summary.sourceRows,
      planned: total.planned + r.summary.planned,
      rejected: total.rejected + r.summary.rejected,
      skipped: total.skipped + r.summary.skipped,
      existing: total.existing + r.summary.existing,
    }),
    { sourceRows: 0, planned: 0, rejected: 0, skipped: 0, existing: 0 },
  );
}

function importTypeLabel(types: BudgetImportType[]): string {
  return types
    .map((t) => (t === "materials" ? "Материалын төсөв" : "Ажлын хөлсний төсөв"))
    .join(" + ");
}

// ---------------------------------------------------------------------------
// Бетон зуурмагийн захиалга
// ---------------------------------------------------------------------------

/**
 * Бетоны төсөв — давхар бүрт М250.
 *
 * Жинхэнэ систем дээр энэ нь `material_budget_quantities` хүснэгтээс
 * ирнэ. Mock дээр материалын импорт байхгүй тул давхар бүрт нэг ижил
 * тоо тавина — хэмжээ нь чухал биш, ҮЛДЭГДЛИЙН ЛОГИК чухал.
 */
const MOCK_CONCRETE_MATERIAL = { id: "mat-m250", name: "Давхрын бетон (М250)", grade: "М250" };

const MOCK_CONCRETE_BUDGET = 240;

const mockConcreteOrders: ConcreteOrder[] = [];

/** Захиалга төсөв иддэг төлөвүүд — backend-ийн `COMMITTED_STATES`. */
const CONCRETE_COMMITTED = ["submitted", "confirmed", "delivered"];

const CONCRETE_WRITER_ROLES = [
  "site_engineer",
  "project_manager",
  "general_engineer",
  "admin",
];

const CONCRETE_CONFIRMER_ROLES = ["inspector", "general_engineer", "admin"];

const CONCRETE_STATUS_LABELS: Record<string, string> = {
  draft: "Драфт",
  submitted: "Илгээсэн",
  confirmed: "Баталгаажсан",
  delivered: "Нийлүүлэгдсэн",
  cancelled: "Цуцалсан",
};

/** Нийлүүлэгдсэн бол БОДИТ хэмжээ — backend-ийн `consumedQty()`. */
function concreteConsumed(order: ConcreteOrder): number {
  if (!CONCRETE_COMMITTED.includes(order.status)) return 0;

  return order.deliveredQty ?? order.quantity;
}

function concreteBalance(locationId: string, ignoreId?: string) {
  const ordered = mockConcreteOrders
    .filter((o) => o.locationId === locationId && o.id !== ignoreId)
    .reduce((sum, o) => sum + concreteConsumed(o), 0);

  return {
    budget: MOCK_CONCRETE_BUDGET,
    ordered: round(ordered),
    remaining: round(MOCK_CONCRETE_BUDGET - ordered),
  };
}

function concreteIsRush(pourDate: string): boolean {
  return (new Date(pourDate).getTime() - Date.now()) / 86_400_000 < 3;
}

/** Хариуд явуулахын өмнө үлдэгдлийн талбаруудыг ШИНЭЧИЛНЭ. */
function shapeConcrete(order: ConcreteOrder): ConcreteOrder {
  const balance = concreteBalance(order.locationId, order.id);
  const thisOrder = order.deliveredQty ?? order.quantity;

  return {
    ...order,
    statusLabel: CONCRETE_STATUS_LABELS[order.status] ?? order.status,
    isEditable: order.status === "draft",
    isRush: concreteIsRush(order.pourDate),
    budgetQty: balance.budget,
    orderedQty: balance.ordered,
    remainingQty: round(balance.remaining - thisOrder),
    overBy: Math.max(0, round(thisOrder - balance.remaining)),
  };
}

// ---------------------------------------------------------------------------
// Материалын захиалга
// ---------------------------------------------------------------------------

/**
 * Материалын төсөв — mock дээрх жишээ жагсаалт.
 *
 * Жинхэнэ систем дээр `material_budget_items`-ээс ирнэ. Энд дөрвөн мөр
 * хангалттай: хэмжээ нь чухал биш, ҮЛДЭГДЛИЙН ЛОГИК чухал.
 */
interface MockMaterial {
  id: string;
  /** Импортоор орсон мөр нь бүх блокт хамаарна (`null`); гараар
      нэмсэн нь зөвхөн тухайн блокт. */
  blockId: string | null;
  code: string;
  name: string;
  grade: string | null;
  unit: string;
  budget: number;
  actualUnitPrice: number | null;
  marketUnitPrice: number | null;
  /** Байршлын задаргаа — `{ байршлын нэр: тоо хэмжээ }`. */
  breakdown: { name: string; qty: number }[] | null;
}

const MOCK_MATERIALS: MockMaterial[] = [
  {
    id: "mat-pum20",
    blockId: null,
    code: "2.3.1",
    name: "20 Пум (200x1200мм)",
    grade: null,
    unit: "ш",
    budget: 508,
    actualUnitPrice: 27500,
    marketUnitPrice: 29000,
    breakdown: null,
  },
  {
    id: "mat-sapud",
    blockId: null,
    code: "2.3.10",
    name: "V2 сапуд",
    grade: null,
    unit: "ш",
    budget: 3902,
    actualUnitPrice: 27500,
    marketUnitPrice: 29000,
    breakdown: null,
  },
  {
    id: "mat-utas",
    blockId: null,
    code: "2.5.1",
    name: "Бэхэлгээний утас",
    grade: null,
    unit: "боодол",
    budget: 215,
    actualUnitPrice: 27500,
    marketUnitPrice: 29000,
    breakdown: null,
  },
  {
    id: "mat-f12",
    blockId: null,
    code: "2.1.3",
    name: "ф12",
    grade: null,
    unit: "ш",
    budget: 2000,
    actualUnitPrice: 27500,
    marketUnitPrice: 29000,
    breakdown: null,
  },
];

/** Тухайн блокт харагдах материалын төсөв. */
function blockMaterials(blockId: string): MockMaterial[] {
  return MOCK_MATERIALS.filter((m) => m.blockId === null || m.blockId === blockId);
}

/**
 * Төсвийн мөрийн гадаад хэлбэр — `BlockBudgetView::materials`-тай ижил.
 *
 * Зөрүүг БОДИТ үнээс тооцно: зах зээлийн үнэ бол жишиг, бодит нь
 * бидний төлж буй зүйл.
 */
function shapeBudgetMaterial(m: MockMaterial, floors: { name: string }[]) {
  const actual = m.actualUnitPrice;
  const market = m.marketUnitPrice;

  return {
    id: `mbi-${m.id}`,
    code: m.code,
    name: m.name,
    grade: m.grade,
    unit: m.unit,
    workLabel: m.blockId === null ? "Угсралт" : null,
    workTypeName: null,
    totalQty: m.budget,
    actualUnitPrice: actual,
    marketUnitPrice: market,
    actualAmount: actual == null ? null : round(actual * m.budget),
    marketAmount: market == null ? null : round(market * m.budget),
    variancePercent:
      actual == null || market == null || actual === 0
        ? null
        : Math.round(((market - actual) / actual) * 1000) / 10,
    locations:
      m.breakdown ??
      floors.slice(0, 3).map((l) => ({ name: l.name, qty: round(m.budget / 3) })),
  };
}

/** `mbi-<materialId>` → mock материал. */
function findBudgetItem(itemId: string): MockMaterial | undefined {
  return MOCK_MATERIALS.find((m) => `mbi-${m.id}` === itemId);
}

const mockMaterialOrders: MaterialOrder[] = [];

const MATERIAL_COMMITTED = ["submitted", "confirmed", "delivered"];

const MATERIAL_WRITER_ROLES = ["site_engineer", "project_manager", "general_engineer", "admin"];

const MATERIAL_CONFIRMER_ROLES = ["inspector", "general_engineer", "admin"];

const MATERIAL_KINDS: Record<string, string> = {
  main: "Угсралтын үндсэн материал",
  aux: "Угсралтын туслах материал",
  timber: "Угсралтын модон материал",
  rebar: "Арматур",
};

/** Ирсэн → зөвшөөрсөн → захиалсан — backend-ийн `consumedQty()`. */
function materialConsumed(order: MaterialOrder, line: MaterialOrderLine): number {
  if (!MATERIAL_COMMITTED.includes(order.status)) return 0;

  return line.deliveredQty ?? line.approvedQty ?? line.quantity;
}

function materialOrdered(blockId: string, materialId: string, ignoreId?: string): number {
  let total = 0;

  for (const order of mockMaterialOrders) {
    if (order.blockId !== blockId || order.id === ignoreId) continue;

    for (const line of order.lines) {
      if (line.materialId === materialId) total += materialConsumed(order, line);
    }
  }

  return round(total);
}

function materialBalanceRows(blockId: string, ignoreId?: string) {
  return blockMaterials(blockId).map((m) => {
    const ordered = materialOrdered(blockId, m.id, ignoreId);

    return {
      materialId: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
      budget: m.budget,
      ordered,
      remaining: round(m.budget - ordered),
      overBy: Math.max(0, round(ordered - m.budget)),
    };
  });
}

/** Хариуд явуулахын өмнө үлдэгдлийн талбаруудыг ШИНЭЧИЛНЭ. */
function shapeMaterialOrder(order: MaterialOrder): MaterialOrder {
  const balances = new Map(
    materialBalanceRows(order.blockId, order.id).map((r) => [r.materialId, r]),
  );

  const lines = order.lines.map((l) => {
    const b = l.materialId ? balances.get(l.materialId) : undefined;
    const asked = l.approvedQty ?? l.quantity;

    return {
      ...l,
      totalWeightKg: l.unitWeightKg != null ? round(l.unitWeightKg * asked) : null,
      budgetQty: b?.budget ?? null,
      orderedQty: b?.ordered ?? null,
      remainingQty: b ? round(b.remaining - asked) : null,
      overBy: b ? Math.max(0, round(asked - b.remaining)) : 0,
    };
  });

  return {
    ...order,
    kindLabel: MATERIAL_KINDS[order.kind] ?? order.kind,
    isRebar: order.kind === "rebar",
    statusLabel: CONCRETE_STATUS_LABELS[order.status] ?? order.status,
    isEditable: order.status === "draft",
    lineCount: lines.length,
    overLineCount: lines.filter((l) => l.overBy > 0).length,
    lines,
  };
}

/** Mock-ийн компани, төслүүд — санах ойд, POST-оор нэмэгдэнэ. */
const mockCompanies: { id: string; name: string }[] = [{ id: "cmp-inel", name: "Инэл ХХК" }];

const mockProjects: Record<string, string | null>[] = [
  {
    id: MOCK_IDS.projectId,
    companyId: "cmp-inel",
    companyName: "Инэл ХХК",
    name: "75 барилгын цогцолбор",
    code: "INL-75",
    location: "Улаанбаатар",
    startDate: null,
    endDate: null,
    status: "active",
  },
];

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
        if (!session.canManageContractors) {
          return fail(403, "Forbidden", "Танд гүйцэтгэгч нэмэх эрх байхгүй.");
        }

        const p = body as Partial<Contractor>;
        const dup = contractorRegError(p.registrationNo, null);
        if (dup) return dup;

        const created: Contractor = {
          id: mockId("ctr"),
          name: p?.name ?? "Шинэ гүйцэтгэгч",
          registrationNo: p.registrationNo ?? null,
          tradeSpecialty: p?.tradeSpecialty ?? null,
          category: p.category ?? null,
          categoryLabel: p.category ? CONTRACTOR_CATEGORIES[p.category] : null,
          status: "active",
          statusLabel: CONTRACTOR_STATUSES.active,
          canTakeWork: true,
          phone: p.phone ?? null,
          accessCode: null,
          accessCodeExpiresAt: null,
          hasValidAccessCode: false,
          missingContractFields: missingContractFields(p),
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

    /*
     * Профайл засах — backend-тэй ижил.
     *
     * ЗӨВХӨН илгээсэн талбарыг хөндөнө. Бүх талбарыг дарж бичвэл дэлгэц
     * утас засахад РД, данс цэвэрлэгдэнэ.
     */
    if (!c && method === "PATCH") {
      if (!session.canManageContractors) {
        return fail(403, "Forbidden", "Танд гүйцэтгэгч засах эрх байхгүй.");
      }

      const p = body as Partial<Contractor>;

      if ("registrationNo" in p) {
        if (p.registrationNo && !/^\d{7}$/.test(p.registrationNo)) {
          return fail(422, "ValidationError", "Регистрийн дугаар 7 орон байх ёстой.");
        }
        const dup = contractorRegError(p.registrationNo, contractor.id);
        if (dup) return dup;
      }

      for (const key of [
        "name",
        "companyName",
        "registrationNo",
        "tradeSpecialty",
        "category",
        "status",
        "contactPerson",
        "phone",
        "email",
        "bankName",
        "bankAccount",
      ] as const) {
        if (key in p) (contractor as unknown as Record<string, unknown>)[key] = p[key] ?? null;
      }

      contractor.categoryLabel = contractor.category
        ? CONTRACTOR_CATEGORIES[contractor.category]
        : null;
      contractor.statusLabel = CONTRACTOR_STATUSES[contractor.status ?? "active"];
      contractor.canTakeWork = (contractor.status ?? "active") === "active";
      contractor.missingContractFields = missingContractFields(contractor);

      return ok({ data: contractor });
    }
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
    /*
     * `/users/inspectors` нь `canManageUsers`-ийн ӨМНӨ шалгагдана.
     *
     * Хяналтын инженер оноох эрх нь ерөнхий инженер, төслийн менежерт бас
     * бий. Тэднийг доорх хориг нь 403 гэж хаявал сонгох цонх хоосон гарч,
     * бүхэл функц нь зөвхөн админ дээр ажиллана — дэлгэцээс харагдахгүй,
     * зөвхөн жинхэнэ хэрэглэгч гарт тулж мэдэх алдаа.
     */
    if (b === "inspectors") {
      if (!INSPECTOR_ASSIGNER_ROLES.includes(session.role)) {
        return fail(403, "Forbidden", "Танд хяналтын инженер оноох эрх байхгүй.");
      }

      return ok({
        data: mockUsers
          .filter((u) => u.isActive && u.canInspect)
          .sort((x, y) => x.name.localeCompare(y.name))
          .map((u) => ({
            id: u.id,
            name: u.name,
            position: u.position ?? null,
            roleLabel: u.roleLabel,
          })),
      });
    }

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
          body: {
            data: user,
            meta: { temporaryPassword: p.password || "MOCK-TEMP-1234" },
          },
        };
      }

      return ok({
        data: mockUsers,
        meta: { total: mockUsers.length, page: 1, pageSize: 50 },
      });
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

    return ok({
      data: rows,
      meta: { total: rows.length, page: 1, pageSize: 50 },
    });
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

    return ok({
      data: rows,
      meta: { total: rows.length, page: 1, pageSize: 50 },
    });
  }

  /*
   * Ижил «код + бүрдэл» хоёр удаа бүртгэгдэхээс сэргийлнэ.
   *
   * Импорт нь `код → төрөл` толь барьж, кодыг ЭХЛЭЭД таарсан төрөлд
   * олгодог. Хоёр төрөл ижил кодтой бол хоёр дахь нь хэзээ ч
   * сонгогдохгүй — чимээгүй, бас барихад хэцүү алдаа.
   */
  function duplicateCode(
    code: string | null,
    part: string | null,
    ignoreId?: string,
  ): MockResponse | null {
    if (code === null) return null;

    const clash = db.workTypes.some(
      (w) => w.id !== ignoreId && w.code === code && (w.codePart ?? null) === part,
    );

    if (!clash) return null;

    return fail(
      422,
      "ValidationError",
      part === null
        ? `«${code}» кодтой ажлын төрөл аль хэдийн байна. Нэг кодыг хэд хуваах бол бүрдлийн нэрийг нь бичнэ үү.`
        : `«${code} · ${part}» аль хэдийн бүртгэгдсэн байна.`,
    );
  }

  if (a === "work-types" && !b) {
    if (method === "POST") {
      if (!session.canManageReferenceData) {
        return fail(403, "Forbidden", "Танд лавлах сан засах эрх байхгүй.");
      }
      const p = body as {
        groupId?: string;
        name?: string;
        code?: string;
        codePart?: string;
        unit?: string;
        level?: string;
      };
      if (!p?.name?.trim() || !p?.unit?.trim()) {
        return fail(422, "ValidationError", "Нэр ба нэгж заавал.");
      }

      const code = p.code?.trim() || null;
      const codePart = p.codePart?.trim() || null;

      const clash = duplicateCode(code, codePart);
      if (clash) return clash;

      const group = db.groups.find((g) => g.id === p.groupId) ?? db.groups[0];
      const newType = {
        id: mockId("wt"),
        groupId: group.id,
        groupName: group.name,
        name: p.name.trim(),
        code,
        codePart,
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
    // Кодоор ч хайна — инженер төсвийн мөрөө гартаа барьж суудаг.
    if (s) {
      rows = rows.filter((w) =>
        [w.name, w.code ?? "", w.codePart ?? ""].some((v) => v.toLowerCase().includes(s)),
      );
    }

    return ok(paginate(rows, q));
  }

  if (a === "work-types" && b && method === "PATCH") {
    if (!session.canManageReferenceData) {
      return fail(403, "Forbidden", "Танд лавлах сан засах эрх байхгүй.");
    }

    const type = db.workTypes.find((w) => w.id === b);
    if (!type) return fail(404, "NotFound", "Ажлын төрөл олдсонгүй.");

    const p = body as Partial<{
      name: string;
      groupId: string;
      code: string;
      codePart: string;
      unit: string;
      level: string;
    }>;

    if (p.name !== undefined && !p.name.trim()) {
      return fail(422, "ValidationError", "Нэр заавал.");
    }

    /*
     * НЭГЖ ба ТҮВШИН нь ашиглагдаж эхэлсний дараа түгжигдэнэ.
     *
     * Тэдгээр нь аль хэдийн үүссэн ажлын мөрүүдэд шингэсэн: «м²» гэж
     * бүртгэсэн 3,290 мөрийг «ш» болгон дахин тайлбарлах боломжгүй.
     */
    const inUse = db.workItems.some((i) => i.workTypeId === type.id);
    if (inUse) {
      for (const [field, label] of [
        ["unit", "нэгж"],
        ["level", "түвшин"],
      ] as const) {
        const next = p[field];
        if (next !== undefined && next !== type[field]) {
          return fail(
            409,
            "Conflict",
            `Энэ төрлөөр ажил үүссэн тул ${label} өөрчлөх боломжгүй. Шинэ төрөл үүсгэнэ үү.`,
          );
        }
      }
    }

    /*
     * КОД нь ашиглагдсан ч засагдана.
     *
     * Нэгж, түвшнээс ялгаатай нь код нь үүссэн ажлын мөрүүдэд
     * шингэдэггүй — зөвхөн ДАРААГИЙН импортод хэрэглэгдэнэ. Хоосон
     * илгээвэл арилна.
     */
    const nextCode = p.code !== undefined ? p.code.trim() || null : (type.code ?? null);
    const nextPart =
      p.codePart !== undefined ? p.codePart.trim() || null : (type.codePart ?? null);

    if (p.code !== undefined || p.codePart !== undefined) {
      const clash = duplicateCode(nextCode, nextPart, type.id);
      if (clash) return clash;

      type.code = nextCode;
      type.codePart = nextPart;
    }

    if (p.name !== undefined) type.name = p.name.trim();
    if (p.unit !== undefined) type.unit = p.unit.trim();
    if (p.level !== undefined) type.level = p.level as WorkType["level"];
    if (p.groupId !== undefined) {
      const group = db.groups.find((g) => g.id === p.groupId);
      if (!group) return fail(422, "ValidationError", "Бүлэг олдсонгүй.");
      type.groupId = group.id;
      // Бүлгийн НЭР нь мөрөнд хуулагдаж хадгалагддаг тул хамт шинэчилнэ —
      // эс бөгөөс жагсаалт хуучин бүлгийн нэрийг харуулсаар байна.
      type.groupName = group.name;
    }

    return ok({ data: type });
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

  // --- companies ---
  if (a === "companies" && !b && method === "GET") {
    if (!session.canManageProjects) return fail(403, "Forbidden", "Танд төсөл удирдах эрх байхгүй.");

    return ok({ data: mockCompanies });
  }

  // --- projects ---
  // Frontend төслийн ID-г эндээс олж авдаг (хатуу бичихгүй) тул жагсаалт
  // заавал байх ёстой — жинхэнэ backend-тэй ижил зан төлөв.
  if (a === "projects" && !b && method === "POST") {
    if (!session.canManageProjects) return fail(403, "Forbidden", "Танд төсөл үүсгэх эрх байхгүй.");

    const p = body as {
      name?: string;
      companyId?: string;
      companyName?: string;
      code?: string;
      location?: string;
      startDate?: string;
      endDate?: string;
    };
    if (!p.name?.trim()) return fail(422, "ValidationError", "Төслийн нэр заавал.");

    let company = mockCompanies.find((x) => x.id === p.companyId);
    if (!company) {
      if (!p.companyName?.trim()) {
        return fail(422, "ValidationError", "Компани сонгох эсвэл шинэ компанийн нэр оруулна уу.");
      }
      company = { id: `cmp-${mockCompanies.length + 1}`, name: p.companyName.trim() };
      mockCompanies.push(company);
    }

    const project = {
      id: `prj-${mockProjects.length + 1}`,
      companyId: company.id,
      companyName: company.name,
      name: p.name.trim(),
      code: p.code ?? null,
      location: p.location ?? null,
      startDate: p.startDate ?? null,
      endDate: p.endDate ?? null,
      status: "active",
    };
    mockProjects.push(project);

    return { status: 201, body: { data: project } };
  }

  if (a === "projects" && !b) {
    return ok({
      data: mockProjects,
      meta: { total: mockProjects.length, page: 1, pageSize: 50 },
    });
  }

  if (a === "projects" && b) {
    if (c === "material-orders" && method === "GET") {
      if (session.role === "contractor") {
        return fail(403, "Forbidden", "Танд материалын захиалга харах эрх байхгүй.");
      }

      const status = q.get("status");
      const kind = q.get("kind");
      const blockId = q.get("blockId");

      return ok({
        data: mockMaterialOrders
          .filter(
            (o) =>
              (!status || o.status === status) &&
              (!kind || o.kind === kind) &&
              (!blockId || o.blockId === blockId),
          )
          .map(shapeMaterialOrder)
          .reverse(),
      });
    }

    if (c === "concrete-orders" && method === "GET") {
      if (session.role === "contractor") {
        return fail(403, "Forbidden", "Танд бетон захиалга харах эрх байхгүй.");
      }

      const status = q.get("status");
      const blockId = q.get("blockId");

      return ok({
        data: mockConcreteOrders
          .filter((o) => (!status || o.status === status) && (!blockId || o.blockId === blockId))
          .map(shapeConcrete)
          .sort((x, y) => y.pourDate.localeCompare(x.pourDate)),
      });
    }

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
      const openIssueRows = allIssues().filter(
        (i) => i.status === "open" && new Set(items.map((w) => w.id)).has(i.workItemId),
      );
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
              pendingInspections: rows.filter((w) => PENDING_STATES.includes(w.reviewState)).length,
              overdue: rows.filter((w) => w.overdueDays > 0).length,
            };
          }),
        pendingInspections: items.filter((w) => PENDING_STATES.includes(w.reviewState)).length,
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
      const rows = inScope(db.workItems).filter((w) => PENDING_STATES.includes(w.reviewState));
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

      /*
       * Акт нь ЗӨВХӨН 2-р шатаар гарна — backend-тэй ижил анхдагч.
       *
       * 1-р шат (талбайн инженер шалгасан) нь акт биш: тэр хэмжээг
       * хяналтын инженер хараахан баталгаажуулаагүй.
       */
      const stage = q.get("stage") ?? "final_approval";
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
            groups.set(groupName, {
              name: groupName,
              rows: [],
              totals: new Map(),
            });
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
      /*
       * Хоёр шат болсон тул «батлахыг хүлээж буй» нь ХЭНИЙГ хүлээж
       * байгаагаас хамаарч хоёр өөр дараалал — backend-тэй ижил.
       *
       * Нэг жагсаалт хуваалцвал талбайн инженер ба хяналтын инженер
       * хоёулаа 3,711 мөрийг шүүж өөрийнхөө ажлыг хайх болно.
       */
      /*
       * Блокын шүүлтүүр — ЖАГСААЛТ ба ТООНД хоёуланд нь.
       *
       * Зөвхөн нэгэнд нь хэрэглэвэл таб дээр «12» гэж бичигдээд
       * жагсаалтад 3 мөр гарч, хэрэглэгч алдаа гэж бодно.
       */
      const onlyBlock = q.get("blockId");

      const pick = (t: string) =>
        inScope(db.workItems).filter((w) => {
          if (onlyBlock && w.blockId !== onlyBlock) return false;
          if (t === "check") return w.reviewState === "pending_check";
          if (t === "approval") return w.reviewState === "pending_approval";
          if (t === "returned") return RETURNED_STATES.includes(w.reviewState);
          if (t === "overdue") return w.overdueDays > 0 && w.status !== "completed";

          return PENDING_STATES.includes(w.reviewState);
        });

      // Табын тоо ба жагсаалт өөр код замаар бодогдвол зөрнө — нэг эх сурвалж.
      if (segments[3] === "counts") {
        return ok({
          data: {
            inspection: pick("inspection").length,
            check: pick("check").length,
            approval: pick("approval").length,
            returned: pick("returned").length,
            overdue: pick("overdue").length,
          },
        });
      }

      /*
       * Блокийн НЭРийг хавсаргана — backend-ийн `WorkItemResource`
       * дарааллын дуудлагад `blockName` буцаадаг. Үгүй бол дэлгэц дээр
       * «—» гарч, аль барилгынх болох нь мэдэгдэхгүй.
       */
      const blockNames = new Map(db.blocks.map((b) => [b.id, b.name]));

      const rows = pick(q.get("type") ?? "inspection").map((w) => ({
        ...w,
        blockName: blockNames.get(w.blockId) ?? null,
      }));

      return ok(paginate(rows, q));
    }

    // --- Тохиролцооны жагсаалт (төслийн хэмжээнд) ---
    if (c === "agreements" && method === "GET") {
      if (!canReadAgreements()) {
        return fail(403, "Forbidden", "Танд тохиролцоо харах эрх байхгүй.");
      }

      const blockIds = new Set(db.blocks.map((x) => x.id));
      const status = q.get("status");
      const contractorId = q.get("contractorId");

      const rows = [...mockAgreements.values()]
        .filter((x) => blockIds.has(x.blockId))
        .filter((x) => !status || x.status === status)
        .filter((x) => !contractorId || x.contractorId === contractorId)
        .sort((x, y) => y.number.localeCompare(x.number));

      return ok({ data: rows });
    }

    /*
     * --- Хугацаа сунгах хүсэлтийн дараалал ---
     *
     * Хүсэлт хаана ч харагдахгүй бол урсгал нь байхгүйтэй адил: гүйцэтгэгч
     * хүсэлт илгээгээд хариу хүлээж, ерөнхий инженер түүнийг хэзээ ч
     * хардаггүй.
     */
    if (c === "extension-requests" && method === "GET") {
      const status = q.get("status") ?? "pending";
      const visible = new Set(inScope(db.workItems).map((w) => w.id));

      const rows = [...mockExtensions.values()]
        .filter((x) => visible.has(x.workItemId))
        .filter((x) => status === "all" || x.status === status)
        // Хамгийн эрт хүссэн нь дээр — хүлээлт нь эрэмбийн шалгуур.
        .sort((a2, b2) => (a2.createdAt ?? "").localeCompare(b2.createdAt ?? ""));

      return ok({ data: rows });
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
      let rows = allIssues().filter((i) => visible.has(i.workItemId));

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
    const issue = allIssues().find((i) => i.id === b);
    if (!issue) return fail(404, "NotFound", "Асуудал олдсонгүй.");
    const p = body as { status?: string };
    issue.status = p?.status ?? "resolved";
    issue.resolvedAt = issue.status === "resolved" ? new Date().toISOString() : null;

    return ok({ data: issue });
  }

  /*
   * --- Материалын төсвийн мөр: үнэ засах, хасах ---
   *
   * Импорт эвдэрсэн нүдтэй мөрийг УНАГААДАГ тул гараар нөхөх зам
   * хэрэгтэй. Үүний эсрэг тал нь гараар хасах — гэхдээ ЗАХИАЛГАТАЙ
   * материалыг хасуулахгүй, эс бөгөөс үлдэгдэл утгагүй болно.
   */
  if (a === "material-budget-items" && b) {
    if (!session.canManageReferenceData) {
      return fail(403, "Forbidden", "Төсөв засах эрх зөвхөн ерөнхий инженер, админд байна.");
    }

    const item = findBudgetItem(b);
    if (!item) return fail(404, "NotFound", "Төсвийн мөр олдсонгүй.");

    if (c === "price" && method === "PATCH") {
      const p = body as { actualUnitPrice?: number | null; marketUnitPrice?: number | null };

      for (const key of ["actualUnitPrice", "marketUnitPrice"] as const) {
        if (!(key in p)) continue;

        const price = p[key] ?? null;

        // 0 ≠ хоосон: «үнэгүй» ба «үнэ нь мэдэгдэхгүй» хоёр өөр зүйл.
        if (price !== null && !(price > 0)) {
          return fail(
            422,
            "ValidationError",
            "Нэгж үнэ 0-ээс их байх ёстой. Арилгах бол хоосон үлдээнэ үү.",
          );
        }

        item[key] = price;
      }

      const floors = item.blockId
        ? db.locations.filter((l) => l.blockId === item.blockId && l.level === "floor")
        : [];

      return ok({ data: shapeBudgetMaterial(item, floors) });
    }

    if (!c && method === "DELETE") {
      const ordered = mockMaterialOrders.some((o) =>
        o.lines.some(
          (l) => l.materialId === item.id && MATERIAL_COMMITTED.includes(o.status),
        ),
      );

      if (ordered) {
        return fail(
          422,
          "ValidationError",
          "Энэ материалаар захиалга өгсөн тул төсвөөс хасах боломжгүй.",
        );
      }

      MOCK_MATERIALS.splice(MOCK_MATERIALS.indexOf(item), 1);

      return ok({ data: { deleted: true } });
    }
  }

  // --- blocks ---
  // --- Материалын захиалга ---
  if (a === "material-orders" && b) {
    if (session.role === "contractor") {
      return fail(403, "Forbidden", "Танд материалын захиалга харах эрх байхгүй.");
    }

    const order = mockMaterialOrders.find((o) => o.id === b);
    if (!order) return fail(404, "NotFound", "Захиалга олдсонгүй.");

    const writable = MATERIAL_WRITER_ROLES.includes(session.role);

    if (!c && method === "GET") return ok({ data: shapeMaterialOrder(order) });

    if (c === "submit" && method === "POST") {
      if (!writable) return fail(403, "Forbidden", "Танд материалын захиалга бичих эрх байхгүй.");
      if (order.status !== "draft") {
        return fail(422, "ValidationError", "Зөвхөн драфт захиалгыг илгээнэ.");
      }

      order.status = "submitted";
      order.submittedAt = new Date().toISOString();

      return ok({ data: shapeMaterialOrder(order) });
    }

    if (c === "confirm" && method === "POST") {
      if (!MATERIAL_CONFIRMER_ROLES.includes(session.role)) {
        return fail(
          403,
          "Forbidden",
          "Захиалгыг зөвхөн хяналтын инженер, ерөнхий инженер баталгаажуулна.",
        );
      }

      if (order.status !== "submitted") {
        return fail(422, "ValidationError", "Зөвхөн илгээсэн захиалгыг баталгаажуулна.");
      }

      if (order.requestedBy === session.name) {
        return fail(
          422,
          "ValidationError",
          "Захиалга өгсөн хүн өөрөө баталгаажуулах боломжгүй — өөр инженер батална.",
        );
      }

      /*
       * Өгөөгүй мөр ЗАХИАЛСАНААРАА батлагдана — бланкны зан төлөв.
       * Баталгаажуулагч зөвхөн бууруулахыг хүссэн мөрөө бичнэ.
       */
      const approved = (body as { approved?: Record<string, number> })?.approved ?? {};

      for (const line of order.lines) {
        line.approvedQty = round(Number(approved[line.id] ?? line.quantity));
      }

      order.status = "confirmed";
      order.confirmedBy = session.name;
      order.confirmedAt = new Date().toISOString();

      return ok({ data: shapeMaterialOrder(order) });
    }

    if (c === "deliver" && method === "POST") {
      if (!writable) return fail(403, "Forbidden", "Танд материалын захиалга бичих эрх байхгүй.");
      if (!["submitted", "confirmed"].includes(order.status)) {
        return fail(422, "ValidationError", "Зөвхөн илгээсэн эсвэл баталгаажсан захиалгыг хүлээж авна.");
      }

      const delivered = (body as { delivered?: Record<string, number> })?.delivered ?? {};

      if (Object.keys(delivered).length === 0) {
        return fail(422, "ValidationError", "Ирсэн тоог оруулна уу.");
      }

      for (const line of order.lines) {
        if (line.id in delivered) line.deliveredQty = round(Number(delivered[line.id]));
      }

      order.status = "delivered";
      order.receivedBy = session.name;

      return ok({ data: shapeMaterialOrder(order) });
    }

    if (c === "cancel" && method === "POST") {
      if (!writable) return fail(403, "Forbidden", "Танд материалын захиалга бичих эрх байхгүй.");
      if (order.status === "delivered") {
        return fail(422, "ValidationError", "Нийлүүлэгдсэн захиалгыг цуцлах боломжгүй.");
      }

      const reason = String((body as { reason?: string })?.reason ?? "").trim();

      if (reason.length < 5) {
        return fail(422, "ValidationError", "Цуцлах шалтгаан заавал.");
      }

      order.status = "cancelled";
      order.notes = `${order.notes ? order.notes + "\n" : ""}Цуцлав: ${reason}`;

      return ok({ data: shapeMaterialOrder(order) });
    }
  }

  // --- Бетон захиалга ---
  if (a === "concrete-orders" && b) {
    if (session.role === "contractor") {
      return fail(403, "Forbidden", "Танд бетон захиалга харах эрх байхгүй.");
    }

    const order = mockConcreteOrders.find((o) => o.id === b);
    if (!order) return fail(404, "NotFound", "Захиалга олдсонгүй.");

    const writable = CONCRETE_WRITER_ROLES.includes(session.role);

    if (!c && method === "GET") return ok({ data: shapeConcrete(order) });

    if (c === "submit" && method === "POST") {
      if (!writable) return fail(403, "Forbidden", "Танд бетон захиалга бичих эрх байхгүй.");
      if (order.status !== "draft") {
        return fail(422, "ValidationError", "Зөвхөн драфт захиалгыг илгээнэ.");
      }

      order.status = "submitted";
      order.submittedAt = new Date().toISOString();

      return ok({ data: shapeConcrete(order) });
    }

    if (c === "confirm" && method === "POST") {
      if (!CONCRETE_CONFIRMER_ROLES.includes(session.role)) {
        return fail(
          403,
          "Forbidden",
          "Захиалгыг зөвхөн хяналтын инженер, ерөнхий инженер, захирал баталгаажуулна.",
        );
      }

      if (order.status !== "submitted") {
        return fail(422, "ValidationError", "Зөвхөн илгээсэн захиалгыг баталгаажуулна.");
      }

      /*
       * Захиалсан хүн ӨӨРӨӨ баталгаажуулахгүй — бланк дээр хоёр өөр
       * инженерийн гарын үсэг байдаг нь санамсаргүй биш.
       */
      if (order.requestedBy === session.name) {
        return fail(
          422,
          "ValidationError",
          "Захиалга өгсөн хүн өөрөө баталгаажуулах боломжгүй — өөр инженер батална.",
        );
      }

      order.status = "confirmed";
      order.confirmedBy = session.name;
      order.confirmedAt = new Date().toISOString();

      return ok({ data: shapeConcrete(order) });
    }

    if (c === "deliver" && method === "POST") {
      if (!writable) return fail(403, "Forbidden", "Танд бетон захиалга бичих эрх байхгүй.");
      if (!["submitted", "confirmed"].includes(order.status)) {
        return fail(422, "ValidationError", "Зөвхөн илгээсэн эсвэл баталгаажсан захиалгыг хүлээж авна.");
      }

      const qty = Number((body as { deliveredQty?: number })?.deliveredQty);

      if (!(qty > 0)) {
        return fail(422, "ValidationError", "Ирсэн хэмжээ 0-ээс их байх ёстой.");
      }

      order.status = "delivered";
      order.deliveredQty = round(qty);
      order.deliveredAt =
        (body as { deliveredAt?: string })?.deliveredAt ?? new Date().toISOString().slice(0, 10);
      order.receivedBy = session.name;

      return ok({ data: shapeConcrete(order) });
    }

    if (c === "cancel" && method === "POST") {
      if (!writable) return fail(403, "Forbidden", "Танд бетон захиалга бичих эрх байхгүй.");
      if (order.status === "delivered") {
        return fail(422, "ValidationError", "Нийлүүлэгдсэн захиалгыг цуцлах боломжгүй.");
      }

      const reason = String((body as { reason?: string })?.reason ?? "").trim();

      if (reason.length < 5) {
        return fail(422, "ValidationError", "Цуцлах шалтгаан заавал.");
      }

      order.status = "cancelled";
      order.notes = `${order.notes ? order.notes + "\n" : ""}Цуцлав: ${reason}`;

      return ok({ data: shapeConcrete(order) });
    }
  }

  // --- Байршуулсан төсвийн файл ---
  if (a === "imports" && b) {
    if (!session.canManageReferenceData) {
      return fail(403, "Forbidden", "Төсөв оруулах эрх зөвхөн ерөнхий инженер, захирал, админд байна.");
    }

    const record = mockImports.find((i) => i.id === b);
    if (!record) return fail(404, "NotFound", "Импорт олдсонгүй.");

    const block = db.blocks.find((x) => x.id === record.blockId);
    if (!block) return fail(404, "NotFound", "Блок олдсонгүй.");

    if (!c && method === "GET") return importEnvelope(record, block);

    if (c === "apply" && method === "POST") {
      /*
       * Нэг файлыг хоёр удаа батлахыг хориглоно — үр дүн нь ижил ч
       * «хоёр дахин орсон» гэсэн төөрөгдөл өөрөө асуудал.
       */
      if (record.status !== "pending") {
        return fail(422, "ValidationError", `Энэ файл аль хэдийн ${record.statusLabel.toLowerCase()}.`);
      }

      /*
         * Хоёр төсөвтэй файлаас НЭГИЙГ нь л оруулж болно — материалын
         * хэсэг эвдэрсэн байхад ажлын төсвийг хүлээлгэх шаардлагагүй.
         */
      const wanted = (body as { types?: string[] })?.types;
      const types = (wanted ?? record.types).filter((t): t is BudgetImportType =>
        record.types.includes(t as BudgetImportType),
      );

      if (types.length === 0) {
        return fail(422, "ValidationError", "Оруулах төсөв сонгогдоогүй байна.");
      }

      record.types = types;
      record.type = types.join(",");
      record.typeLabel = importTypeLabel(types);
      record.status = "applied";
      record.statusLabel = "Орсон";
      record.appliedBy = session.name;
      record.appliedAt = new Date().toISOString();
      const mode = (body as { mode?: string })?.mode === "update" ? "update" : "replace";

      record.summary = totalImportSummary(
        types.map((t) => importReport(block, t, true, mode)),
      );

      return importEnvelope(record, block, mode);
    }

    if (!c && method === "DELETE") {
      if (record.status !== "pending") {
        return fail(422, "ValidationError", "Орсон импортыг цуцлах боломжгүй.");
      }

      record.status = "discarded";
      record.statusLabel = "Цуцалсан";

      return ok({ data: record });
    }
  }

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

    if (!c && method === "DELETE") {
      if (session.role !== "admin") {
        return fail(403, "Forbidden", "Блок устгах эрх зөвхөн админд байна.");
      }

      const typed = String((body as { confirmName?: string })?.confirmName ?? "").trim();

      if (!typed) {
        return fail(422, "ValidationError", "Блокийн нэрийг бичиж баталгаажуулна уу.");
      }

      if (typed !== block.name) {
        return fail(
          422,
          "ValidationError",
          `Нэр таарахгүй байна. «${block.name}» гэж яг бичнэ үү.`,
        );
      }

      // Каскад — блокт хамаарах БҮХ зүйл.
      const itemIds = new Set(db.workItems.filter((w) => w.blockId === b).map((w) => w.id));

      db.blocks = db.blocks.filter((x) => x.id !== b);
      db.locations = db.locations.filter((l) => l.blockId !== b);
      db.workItems = db.workItems.filter((w) => w.blockId !== b);
      for (const id of itemIds) db.byId.delete(id);

      mockConcreteOrders.splice(
        0,
        mockConcreteOrders.length,
        ...mockConcreteOrders.filter((o) => o.blockId !== b),
      );
      mockMaterialOrders.splice(
        0,
        mockMaterialOrders.length,
        ...mockMaterialOrders.filter((o) => o.blockId !== b),
      );
      mockImports.splice(0, mockImports.length, ...mockImports.filter((i) => i.blockId !== b));

      for (const [id, agreement] of [...mockAgreements.entries()]) {
        if (agreement.blockId === b) mockAgreements.delete(id);
      }

      return ok({ data: { name: block.name, photosRemoved: 0 } });
    }

    if (!c) return ok({ data: block });

    /*
     * --- Төсвийн импорт ---
     *
     * Байршуулах нь ЮУ Ч БИЧИХГҮЙ: `pending` төлөвтэй бүртгэл үүсгээд
     * тайлан буцаана. Backend-ийн зан төлөв яг ийм.
     */
    /*
     * --- Бетоны төсвийн үлдэгдэл ---
     *
     * Давхар бүрт М250 төсөв. Захиалга бичих дэлгэцийн үндэс.
     */
    /*
     * --- Блок устгах ---
     *
     * ЗӨВХӨН АДМИН, бөгөөд нэрийг бичиж баталгаажуулна. Санамсаргүй
     * дарах боломжийг бүрэн хаана: 1,991 мөр нэг товчоор алга болно.
     */
    /*
     * --- Материалын төсвийн мөр нэмэх — гараар ---
     *
     * ТОО ХЭМЖЭЭГ ЗААВАЛ БАЙРШЛААР өгнө: нийт дүнг тусад нь авбал
     * задаргаатай зөрөх эрсдэлтэй. Нийт нь задаргааны НИЙЛБЭР.
     */
    /*
     * --- Импортын загвар файл ---
     *
     * Mock нь хоёртын файл үүсгэдэггүй. Чимээгүй 404 буцаахын оронд
     * шалтгааныг нь хэлнэ — эс бөгөөс товч ажиллахгүй байгаа нь
     * системийн алдаа мэт харагдана.
     */
    if (c === "budget-template.xlsx" && method === "GET") {
      if (!session.canManageReferenceData) {
        return fail(403, "Forbidden", "Төсөв оруулах эрх танд байхгүй.");
      }

      return fail(
        501,
        "NotImplemented",
        "Mock горимд Excel үүсгэхгүй. Жинхэнэ backend руу холбогдоно уу.",
      );
    }

    if (c === "material-budget-items" && method === "POST") {
      if (!session.canManageReferenceData) {
        return fail(403, "Forbidden", "Төсөв засах эрх зөвхөн ерөнхий инженер, админд байна.");
      }

      const p = body as {
        code?: string;
        name?: string;
        grade?: string | null;
        unit?: string;
        actualUnitPrice?: number | null;
        marketUnitPrice?: number | null;
        quantities?: { locationId?: string; quantity?: number }[];
      };

      const code = (p.code ?? "").trim();
      const name = (p.name ?? "").trim();
      const rows = p.quantities ?? [];

      if (!code || !name) {
        return fail(422, "ValidationError", "Код, нэр заавал байна.");
      }

      if (!(MATERIAL_UNITS as readonly string[]).includes(p.unit ?? "")) {
        return fail(422, "ValidationError", "Хэмжих нэгж буруу байна.");
      }

      if (rows.length === 0) {
        return fail(422, "ValidationError", "Тоо хэмжээг байршлаар оруулна уу.");
      }

      // Нэг блокт нэг код хоёр удаа орвол үлдэгдэл хоёр хуваагдана.
      if (blockMaterials(b).some((m) => m.code === code)) {
        return fail(422, "ValidationError", `«${code}» код энэ блокийн төсөвт аль хэдийн байна.`);
      }

      const breakdown: { name: string; qty: number }[] = [];

      for (const r of rows) {
        const loc = db.locations.find((l) => l.id === r.locationId && l.blockId === b);
        if (!loc) return fail(422, "ValidationError", "Байршил энэ блокт харьяалагдахгүй байна.");
        if (!(Number(r.quantity) > 0)) {
          return fail(422, "ValidationError", "Тоо хэмжээ 0-ээс их байх ёстой.");
        }

        breakdown.push({ name: loc.name, qty: round(Number(r.quantity)) });
      }

      const material: MockMaterial = {
        id: `mat-${code}-${MOCK_MATERIALS.length}`,
        blockId: b,
        code,
        name,
        grade: (p.grade ?? "")?.trim() || null,
        unit: p.unit!,
        budget: round(breakdown.reduce((n, r) => n + r.qty, 0)),
        actualUnitPrice: p.actualUnitPrice ?? null,
        marketUnitPrice: p.marketUnitPrice ?? null,
        breakdown,
      };

      MOCK_MATERIALS.push(material);

      return created({ id: `mbi-${material.id}` });
    }

    // --- Ажлын төрлийн төсвийн үнэ — гараар ---
    if (c === "budget" && segments[3] === "work-price" && method === "PATCH") {
      if (!session.canManageReferenceData) {
        return fail(403, "Forbidden", "Төсөв засах эрх зөвхөн ерөнхий инженер, админд байна.");
      }

      const p = body as { workTypeId?: string; unitPrice?: number | null };
      const price = p.unitPrice ?? null;

      /*
       * 0 ЗӨВШӨӨРӨГДӨХГҮЙ: «үнэгүй ажил» ба «үнэ нь мэдэгдэхгүй»
       * хоёр өөр зүйл. Арилгах цорын гагц зам нь `null`.
       */
      if (price !== null && !(price > 0)) {
        return fail(
          422,
          "ValidationError",
          "Нэгж үнэ 0-ээс их байх ёстой. Арилгах бол хоосон үлдээнэ үү.",
        );
      }

      let updated = 0;

      for (const w of db.workItems) {
        if (w.blockId === b && w.workTypeId === p.workTypeId) {
          w.budgetUnitPrice = price;
          updated++;
        }
      }

      return ok({ data: { updated } });
    }

    // --- Блокт ОРСОН төсөв ---
    if (c === "budget" && method === "GET") {
      if (!session.canSeeMoney) {
        return fail(403, "Forbidden", "Танд блокийн тайлан харах эрх байхгүй.");
      }

      /*
       * Ажлын ТӨРЛӨӨР нэгтгэнэ — 3,711 ажлыг жагсаах нь төсөв биш,
       * жагсаалт болно.
       */
      const byType = new Map<
        string,
        { works: number; planned: number; accepted: number; prices: Set<number | null> }
      >();

      for (const w of db.workItems.filter((x) => x.blockId === b)) {
        const g = byType.get(w.workTypeId) ?? {
          works: 0,
          planned: 0,
          accepted: 0,
          prices: new Set<number | null>(),
        };

        g.works++;
        g.planned += w.plannedQty;
        g.accepted += w.acceptedQty;
        g.prices.add(w.budgetUnitPrice ?? null);
        byType.set(w.workTypeId, g);
      }

      const work = [...byType.entries()].map(([workTypeId, g]) => {
        const type = db.workTypes.find((t) => t.id === workTypeId);
        const prices = [...g.prices].filter((p): p is number => p != null);
        const unitPrice = prices.length ? Math.max(...prices) : null;

        return {
          workTypeId,
          // Mock-ийн ажлын төрөлд код байхгүй — жинхэнэ сервер өгнө.
          code: null,
          name: type?.name ?? "—",
          groupName: type?.groupName ?? "Бусад",
          level: type?.level ?? "floor",
          unit: type?.unit ?? "",
          works: g.works,
          plannedQty: round(g.planned),
          acceptedQty: round(g.accepted),
          unitPrice,
          amount: round((unitPrice ?? 0) * g.planned),
          priceConflict: prices.length > 1,
          worksWithoutPrice: g.prices.has(null) ? 1 : 0,
        };
      });

      const floors = db.locations.filter((l) => l.blockId === b && l.level === "floor");

      return ok({
        data: {
          work,
          materials: blockMaterials(b).map((m) => shapeBudgetMaterial(m, floors)),
        },
      });
    }

    // --- Блокийн ерөнхий тайлан ---
    if (c === "report" && method === "GET") {
      if (!session.canSeeMoney) {
        return fail(403, "Forbidden", "Танд блокийн тайлан харах эрх байхгүй.");
      }

      const items = db.workItems.filter((w) => w.blockId === b);
      const share = (w: WorkItem) =>
        w.plannedQty > 0 ? Math.min(1, w.acceptedQty / w.plannedQty) : 0;
      const ratio = items.length ? items.reduce((n, w) => n + share(w), 0) / items.length : 0;

      const groups = new Map<string, { items: number; completed: number; sum: number }>();

      for (const w of items) {
        const name = db.workTypes.find((t) => t.id === w.workTypeId)?.groupName ?? "Бусад";
        const g = groups.get(name) ?? { items: 0, completed: 0, sum: 0 };

        g.items++;
        if (w.status === "completed") g.completed++;
        g.sum += share(w);
        groups.set(name, g);
      }

      return ok({
        data: {
          block: {
            id: block.id,
            name: block.name,
            buildingNo: block.buildingNo,
            purpose: block.purpose,
            floors: block.floors,
            unitsPerFloor: 0,
            startDate: block.startDate ?? null,
            projectName: "Ланкастер",
            companyName: "Инэл ХХК",
          },
          generatedAt: new Date().toISOString(),
          progress: {
            workItems: items.length,
            completed: items.filter((w) => w.status === "completed").length,
            unmeasured: items.filter((w) => w.plannedQty <= 0).length,
            pending: items.filter((w) => PENDING_STATES.includes(w.reviewState)).length,
            returned: items.filter((w) => RETURNED_STATES.includes(w.reviewState)).length,
            percentage: Math.round(ratio * 1000) / 10,
          },
          byGroup: [...groups.entries()].map(([name, g]) => ({
            name,
            items: g.items,
            completed: g.completed,
            percentage: Math.round((g.sum / g.items) * 1000) / 10,
          })),
          money: {
            budgetAmount: round(
              items.reduce((n, w) => n + (w.budgetUnitPrice ?? 0) * w.plannedQty, 0),
            ),
            withoutBudgetPrice: items.filter((w) => w.budgetUnitPrice == null).length,
            agreementCount: [...mockAgreements.values()].filter((x) => x.blockId === b).length,
            agreedAmount: 0,
            acceptedAmount: 0,
            agreedVariancePercent: null,
            acceptedVariancePercent: null,
          },
          schedule: {
            plannedStart: block.startDate ?? null,
            plannedEnd: null,
            baselineEnd: null,
            slippageDays: null,
            extendedItems: items.filter((w) => (w.extendedDays ?? 0) > 0).length,
            overdueItems: items.filter((w) => w.overdueDays > 0 && w.status !== "completed").length,
          },
          quality: {
            inspections: 0,
            rejected: 0,
            partial: 0,
            rejectionRate: null,
            openIssues: 0,
            resolvedIssues: 0,
          },
          materials: {
            budgetedItems: MOCK_MATERIALS.length,
            actualAmount: 0,
            marketAmount: 0,
            marketVariancePercent: null,
            concreteOrders: mockConcreteOrders.filter((o) => o.blockId === b).length,
            materialOrders: mockMaterialOrders.filter((o) => o.blockId === b).length,
            concreteDelivered: 0,
          },
        },
      });
    }

    if (c === "deletion-impact" && method === "GET") {
      if (session.role !== "admin") {
        return fail(403, "Forbidden", "Блок устгах эрх зөвхөн админд байна.");
      }

      const items = db.workItems.filter((w) => w.blockId === b);
      const accepted = items.filter((w) => w.acceptedQty > 0).length;

      return ok({
        data: {
          blockName: block.name,
          locations: db.locations.filter((l) => l.blockId === b).length,
          workItems: items.length,
          progressEntries: items.reduce((n, w) => n + (w.reportedQty > 0 ? 1 : 0), 0),
          inspections: accepted,
          photos: 0,
          agreements: [...mockAgreements.values()].filter((x) => x.blockId === b).length,
          concreteOrders: mockConcreteOrders.filter((o) => o.blockId === b).length,
          materialOrders: mockMaterialOrders.filter((o) => o.blockId === b).length,
          budgetImports: mockImports.filter((i) => i.blockId === b).length,
          acceptedInspections: accepted,
        },
      });
    }

    // --- Материалын төсвийн үлдэгдэл (бетоноос бусад) ---
    if (c === "material-balance" && method === "GET") {
      return ok({ data: materialBalanceRows(b) });
    }

    if (c === "material-orders" && method === "POST") {
      if (!MATERIAL_WRITER_ROLES.includes(session.role)) {
        return fail(403, "Forbidden", "Танд материалын захиалга бичих эрх байхгүй.");
      }

      const p = body as {
        kind?: string;
        neededBy?: string | null;
        notes?: string | null;
        lines?: {
          materialId?: string;
          name?: string;
          unit?: string;
          quantity?: number;
          stockQty?: number | null;
          unitWeightKg?: number | null;
        }[];
      };

      const kind = (p.kind ?? "main") as MaterialOrderKind;

      if (!MATERIAL_KINDS[kind]) {
        return fail(422, "ValidationError", "Бланкны төрөл буруу байна.");
      }

      const raw = p.lines ?? [];

      if (raw.length === 0) {
        return fail(422, "ValidationError", "Дор хаяж нэг мөр шаардлагатай.");
      }

      const lines: MaterialOrderLine[] = [];

      for (const l of raw) {
        const known = MOCK_MATERIALS.find((m) => m.id === l.materialId);

        if (!known && !(l.name && l.unit)) {
          return fail(422, "ValidationError", "Лавлахгүй мөрөнд нэр, нэгж заавал.");
        }

        if (!(Number(l.quantity) > 0)) {
          return fail(422, "ValidationError", "Захиалах тоо 0-ээс их байх ёстой.");
        }

        lines.push({
          id: mockId("mol"),
          materialId: known?.id ?? null,
          name: known?.name ?? String(l.name),
          unit: known?.unit ?? String(l.unit),
          stockQty: l.stockQty ?? null,
          quantity: Number(l.quantity),
          approvedQty: null,
          deliveredQty: null,
          unitWeightKg: l.unitWeightKg ?? null,
          totalWeightKg: null,
          note: null,
          budgetQty: null,
          orderedQty: null,
          remainingQty: null,
          overBy: 0,
        });
      }

      const year = new Date().getFullYear();
      const seq = String(mockMaterialOrders.length + 1).padStart(3, "0");

      const order: MaterialOrder = {
        id: mockId("mor"),
        number: `МЗ-${year}-${seq}`,
        blockId: b,
        blockName: block.name,
        kind,
        kindLabel: MATERIAL_KINDS[kind],
        isRebar: kind === "rebar",
        locationId: null,
        locationName: null,
        neededBy: p.neededBy ?? null,
        status: "draft",
        statusLabel: "Драфт",
        isEditable: true,
        lineCount: lines.length,
        overLineCount: 0,
        lines,
        requestedBy: session.name,
        receivedBy: null,
        confirmedBy: null,
        submittedAt: null,
        confirmedAt: null,
        notes: p.notes ?? null,
        createdAt: new Date().toISOString(),
      };

      mockMaterialOrders.push(order);

      return { status: 201, body: { data: shapeMaterialOrder(order) } };
    }

    if (c === "concrete-balance" && method === "GET") {
      const floors = db.locations.filter((l) => l.blockId === b && l.level === "floor");

      return ok({
        data: floors.map((l, i) => {
          const balance = concreteBalance(l.id);

          return {
            locationId: l.id,
            locationName: l.name,
            sequence: l.sequenceNumber ?? i,
            materialId: MOCK_CONCRETE_MATERIAL.id,
            materialName: MOCK_CONCRETE_MATERIAL.name,
            grade: MOCK_CONCRETE_MATERIAL.grade,
            unit: "м3",
            budget: balance.budget,
            ordered: balance.ordered,
            remaining: balance.remaining,
            overBy: Math.max(0, -balance.remaining),
          };
        }),
      });
    }

    if (c === "concrete-orders" && method === "POST") {
      if (!CONCRETE_WRITER_ROLES.includes(session.role)) {
        return fail(403, "Forbidden", "Танд бетон захиалга бичих эрх байхгүй.");
      }

      const p = body as Record<string, string | number | boolean | null>;
      const location = db.locations.find((l) => l.id === p.locationId && l.blockId === b);

      if (!location) {
        return fail(422, "ValidationError", "Энэ блокт тийм байршил алга.");
      }

      if (!p.pourDate || String(p.pourDate) < new Date().toISOString().slice(0, 10)) {
        return fail(422, "ValidationError", "Өнгөрсөн огноонд бетон захиалах боломжгүй.");
      }

      if (!(Number(p.quantity) > 0)) {
        return fail(422, "ValidationError", "Захиалах хэмжээ 0-ээс их байх ёстой.");
      }

      const year = new Date().getFullYear();
      const seq = String(mockConcreteOrders.length + 1).padStart(3, "0");

      const order: ConcreteOrder = {
        id: mockId("cor"),
        number: `БЗ-${year}-${seq}`,
        blockId: b,
        blockName: block.name,
        locationId: location.id,
        locationName: location.name,
        materialId: MOCK_CONCRETE_MATERIAL.id,
        materialName: MOCK_CONCRETE_MATERIAL.name,
        grade: MOCK_CONCRETE_MATERIAL.grade,
        concreteClass: (p.concreteClass as string) ?? null,
        slumpCm: p.slumpCm != null ? Number(p.slumpCm) : null,
        structure: String(p.structure ?? ""),
        pourDate: String(p.pourDate),
        pourHalf: (p.pourHalf as "am" | "pm" | null) ?? null,
        pourTime: (p.pourTime as string) ?? null,
        quantity: Number(p.quantity),
        needsPump: Boolean(p.needsPump),
        deliveredQty: null,
        deliveredAt: null,
        status: "draft",
        statusLabel: "Драфт",
        isEditable: true,
        isRush: false,
        budgetQty: 0,
        orderedQty: 0,
        remainingQty: 0,
        overBy: 0,
        requestedBy: session.name,
        receivedBy: null,
        confirmedBy: null,
        submittedAt: null,
        confirmedAt: null,
        notes: (p.notes as string) ?? null,
        createdAt: new Date().toISOString(),
      };

      mockConcreteOrders.push(order);

      return { status: 201, body: { data: shapeConcrete(order) } };
    }

    if (c === "imports") {
      if (!session.canManageReferenceData) {
        return fail(403, "Forbidden", "Төсөв оруулах эрх зөвхөн ерөнхий инженер, захирал, админд байна.");
      }

      if (method === "GET") {
        return ok({
          data: mockImports
            .filter((i) => i.blockId === b)
            .sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? "")),
        });
      }

      if (method === "POST") {
        const payload = body as { file?: { name?: string; size?: number }; types?: string[] };
        const name = payload?.file?.name ?? "";

        if (!name.toLowerCase().endsWith(".xlsx")) {
          return fail(422, "ValidationError", "Зөвхөн .xlsx файл. Excel дээр «Save As → .xlsx» хийнэ үү.");
        }

        const detected = detectImportTypes(name);
        const types = (payload?.types ?? detected).filter((t): t is BudgetImportType =>
          detected.includes(t as BudgetImportType),
        );

        if (types.length === 0) {
          return fail(
            422,
            "ValidationError",
            "Танигдах төсвийн хуудас олдсонгүй. «Ажлын хөлсний төсөв» эсвэл «Материалын төсөв» нэртэй хуудас байх ёстой.",
          );
        }

        const reports = types.map((t) => importReport(block, t, false));

        const record: BudgetImport = {
          id: mockId("imp"),
          blockId: b,
          type: types.join(","),
          types,
          typeLabel: importTypeLabel(types),
          originalName: name,
          sizeBytes: payload?.file?.size ?? 0,
          status: "pending",
          statusLabel: "Хүлээгдэж буй",
          summary: totalImportSummary(reports),
          uploadedBy: session.name,
          appliedBy: null,
          appliedAt: null,
          createdAt: new Date().toISOString(),
        };

        mockImports.push(record);

        return { status: 201, body: { data: record, reports } };
      }
    }

    /*
     * Төсвөөс тохиролцооны мөр татна — ажлын ТӨРЛӨӨР нэгтгэнэ.
     *
     * Блокт нэг ажлын төрөл 148 мөр байж болно (айл бүрд). Гэрээнд
     * «шавардлага 1,200 м²» гэж НЭГ мөр байх ёстой.
     */
    if (c === "agreement-draft" && method === "GET") {
      if (!session.canManageContractors) {
        return fail(403, "Forbidden", "Танд тохиролцоо бичих эрх байхгүй.");
      }

      const wanted = new Set(
        (q.get("groupIds") ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      );

      const grouped = new Map<string, AgreementDraftLine>();

      for (const w of blockItems) {
        if (w.plannedQty <= 0) continue;

        const type = db.workTypes.find((t) => t.id === w.workTypeId);
        if (!type) continue;
        if (wanted.size > 0 && !wanted.has(type.groupId)) continue;

        const row = grouped.get(type.id) ?? {
          workTypeId: type.id,
          label: type.name,
          groupName: type.groupName,
          unit: w.unit,
          quantity: 0,
          budgetUnitPrice: null,
          priceConflict: false,
        };

        row.quantity = round(row.quantity + w.plannedQty);

        const price = w.budgetUnitPrice ?? null;
        if (price !== null) {
          if (row.budgetUnitPrice !== null && Math.abs(row.budgetUnitPrice - price) > 0.009) {
            row.priceConflict = true;
          }
          row.budgetUnitPrice = Math.max(row.budgetUnitPrice ?? 0, price);
        }

        grouped.set(type.id, row);
      }

      const lines = [...grouped.values()];

      return ok({
        data: lines,
        meta: {
          withoutPrice: lines.filter((l) => l.budgetUnitPrice === null).length,
          priceConflicts: lines.filter((l) => l.priceConflict).length,
        },
      });
    }

    if (c === "agreements" && method === "POST") {
      if (!session.canManageContractors) {
        return fail(403, "Forbidden", "Танд тохиролцоо бичих эрх байхгүй.");
      }

      const p = body as Record<string, unknown>;
      const invalid = agreementPayloadError(p, db.contractors);
      if (invalid) return invalid;

      const year = new Date().getFullYear();
      const seq = [...mockAgreements.values()].filter((x) =>
        x.number.startsWith(`ТХ-${year}-`),
      ).length;

      const contractor = db.contractors.find((x) => x.id === p.contractorId)!;
      const agreement = computeAgreement({
        id: mockId("agr"),
        number: `ТХ-${year}-${String(seq + 1).padStart(3, "0")}`,
        blockId: b!,
        blockName: block?.name,
        contractorId: contractor.id,
        contractorName: contractor.name,
        contractorRegistrationNo: contractor.registrationNo ?? null,
        scope: (p.scope as string) ?? null,
        startDate: (p.startDate as string) ?? null,
        endDate: (p.endDate as string) ?? null,
        retentionPercent: Number(p.retentionPercent ?? 0),
        barterPercent: Number(p.barterPercent ?? 0),
        cashPercent: Number(p.cashPercent ?? 100),
        barterAmount: p.barterAmount != null ? Number(p.barterAmount) : null,
        barterNote: (p.barterNote as string) ?? null,
        warrantyYears: Number(p.warrantyYears ?? 3),
        maintenanceMonths: Number(p.maintenanceMonths ?? 36),
        workDaysPerWeek: p.workDaysPerWeek != null ? Number(p.workDaysPerWeek) : null,
        restDay: (p.restDay as string) ?? null,
        headcount: p.headcount != null ? Number(p.headcount) : null,
        status: "draft",
        statusLabel: AGREEMENT_STATUSES.draft,
        isEditable: true,
        createdBy: session.name,
        notes: (p.notes as string) ?? null,
        lines: (p.lines as Agreement["lines"]) ?? [],
      });

      mockAgreements.set(agreement.id, agreement);

      return { status: 201, body: { data: agreement } };
    }

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
              checkedQty: 0,
              acceptedQty: 0,
              inspectionStages: 2,
              remainingQty: qty,
              percentage: 0,
              ...window,
              // Үндсэн огноо нь үүсгэх үед амлалттай тэнцүү.
              baselineEndDate: window.plannedEndDate,
              baselineOverdueDays: 0,
              extendedDays: 0,
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

        const inactive = inactiveContractorError(p.contractorId);
        if (inactive) return inactive;

        const contractor = db.contractors.find((x) => x.id === p.contractorId);
        for (const w of targets) {
          w.contractor = contractor ? { id: contractor.id, name: contractor.name } : null;
        }

        return ok({
          data: {
            affected: targets.length,
            contractorId: p.contractorId ?? null,
          },
        });
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
          pendingInspections: items.filter((w) => PENDING_STATES.includes(w.reviewState)).length,
          overdue: items.filter((w) => w.overdueDays > 0).length,
          plannedStartDate: minDate(items),
          plannedEndDate: maxDate(items),
        },
        groups: summarize(items, groupBy),
      };
      return ok({ data: summary });
    }
  }

  // --- Тохиролцоо: дэлгэрэнгүй, засах, батлах ---
  if (a === "agreements" && b) {
    const agreement = mockAgreements.get(b);

    if (!agreement) return fail(404, "NotFound", "Тохиролцоо олдсонгүй.");

    if (c === "approve" && method === "POST") {
      if (!AGREEMENT_APPROVER_ROLES.includes(session.role)) {
        return fail(403, "Forbidden", "Тохиролцоог зөвхөн ерөнхий инженер, захирал батална.");
      }
      if (agreement.status !== "draft") {
        return fail(422, "ValidationError", "Зөвхөн драфт тохиролцоо батлагдана.");
      }
      if ((agreement.lines ?? []).length === 0) {
        return fail(
          422,
          "ValidationError",
          "Ажлын мөргүй тохиролцоо батлагдахгүй — төлбөр бодогдох зүйл алга.",
        );
      }

      agreement.status = "active";
      agreement.approvedBy = session.name;
      agreement.approvedAt = new Date().toISOString();
      computeAgreement(agreement);

      return ok({ data: agreement });
    }

    if (!c && method === "PATCH") {
      if (!session.canManageContractors) {
        return fail(403, "Forbidden", "Танд тохиролцоо бичих эрх байхгүй.");
      }

      /*
       * Батлагдсаны дараа мөр ТҮГЖИГДЭНЭ — акт нь эдгээр үнэ дээр тогтдог.
       * Үнэ хойшоо хөдөлвөл гарсан акт бүр худал болно.
       */
      if (agreement.status !== "draft") {
        return fail(
          422,
          "ValidationError",
          "Батлагдсан тохиролцооны мөрийг засах боломжгүй. Акт нь эдгээр үнэ дээр тогтдог.",
        );
      }

      const p = body as Record<string, unknown>;

      if (p.contractorId && p.contractorId !== agreement.contractorId) {
        return fail(
          422,
          "ValidationError",
          "Гүйцэтгэгчийг солих боломжгүй — шинэ тохиролцоо бичнэ үү.",
        );
      }

      const invalid = agreementPayloadError(
        { ...p, contractorId: agreement.contractorId },
        db.contractors,
      );
      if (invalid) return invalid;

      Object.assign(agreement, {
        scope: (p.scope as string) ?? null,
        startDate: (p.startDate as string) ?? null,
        endDate: (p.endDate as string) ?? null,
        retentionPercent: Number(p.retentionPercent ?? 0),
        barterPercent: Number(p.barterPercent ?? 0),
        cashPercent: Number(p.cashPercent ?? 100),
        barterAmount: p.barterAmount != null ? Number(p.barterAmount) : null,
        barterNote: (p.barterNote as string) ?? null,
        warrantyYears: Number(p.warrantyYears ?? 3),
        maintenanceMonths: Number(p.maintenanceMonths ?? 36),
        workDaysPerWeek: p.workDaysPerWeek != null ? Number(p.workDaysPerWeek) : null,
        restDay: (p.restDay as string) ?? null,
        headcount: p.headcount != null ? Number(p.headcount) : null,
        notes: (p.notes as string) ?? null,
        lines: (p.lines as Agreement["lines"]) ?? [],
      });
      computeAgreement(agreement);

      return ok({ data: agreement });
    }

    if (!c) {
      if (!canReadAgreements()) {
        return fail(403, "Forbidden", "Танд тохиролцоо харах эрх байхгүй.");
      }

      return ok({ data: agreement });
    }
  }

  /*
   * --- Сунгалтын шийдвэр ---
   *
   * Эрх нь ХАТУУ: зөвхөн ерөнхий инженер, захирал, админ. Төслийн менежер
   * ороогүй — хуваарийн гулсалтыг хамгийн их нуумаар байдаг хүн нь тэр
   * хуваарийг хариуцдаг хүн.
   */
  if (a === "extension-requests" && b && method === "POST") {
    const req = mockExtensions.get(b);

    if (!req) return fail(404, "NotFound", "Хүсэлт олдсонгүй.");

    if (!EXTENSION_APPROVER_ROLES.includes(session.role)) {
      return fail(403, "Forbidden", "Хугацаа сунгалтыг зөвхөн ерөнхий инженер, захирал батална.");
    }

    if (req.status !== "pending") {
      return fail(422, "ValidationError", "Энэ хүсэлт аль хэдийн шийдэгдсэн байна.");
    }

    const note = (body as { note?: string })?.note?.trim();

    if (c === "approve") {
      applyExtension(req, session.name);

      return ok({ data: req });
    }

    if (c === "reject") {
      // Шалтгаан ЗААВАЛ — «болохгүй» гэж орхивол хүсэгч юу засахаа мэдэхгүй.
      if (!note) return fail(422, "ValidationError", "Татгалзах шалтгааныг бичнэ үү.");
      if (note.length < 10) {
        return fail(
          422,
          "ValidationError",
          "Шалтгаан хэт тодорхойгүй — дор хаяж 10 тэмдэгт бичнэ үү.",
        );
      }

      req.status = "rejected";
      req.decidedBy = { id: session.id, name: session.name };
      req.decidedAt = new Date().toISOString();
      req.decisionNote = note;

      return ok({ data: req });
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

      /*
       * Шалгалтын цэгийн хоригийг ЗӨВХӨН дэлгэрэнгүй хариунд бодно —
       * backend-ийн `with_hold_point` тугтай ижил. Жагсаалтад оруулбал
       * 200 мөр тутамд нэмэлт тооцоо явна.
       */
      return ok({ data: { ...item, holdPointReason: holdPointReason(item) } });
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

        /*
         * ШАЛГАЛТЫН ЦЭГ — батлагдаагүй далд ажил дараагийнхаа замыг хаана.
         *
         * Хориг нь МЭДЭЭЛЭХ үед тавигдана, батлах үед биш: бетон цутгасны
         * дараа доторх арматурыг хэн ч шалгаж чадахгүй тул «дараа няцаана»
         * гэдэг нь оройтсон байна.
         */
        const hold = holdPointReason(item);
        if (hold) return fail(422, "ValidationError", hold);

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
        applyStage(item);

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
        const p = body as {
          stage?: string;
          result?: string;
          acceptedQty?: number;
          reason?: string;
          checklist?: { itemId?: string; result?: string }[];
        };

        const stage = (p?.stage ?? "final_approval") as InspectionStage;

        if (!STAGE_ROLES[stage]) {
          return fail(422, "ValidationError", "Шалгалтын шат буруу байна.");
        }

        /*
         * Эрхийг ШАТААР шалгана — backend-ийн `StoreInspectionRequest`-тэй ижил.
         *
         * 1-р шат нь `canInspect()`-ээс ӨРГӨН: талбайн инженер хийнэ, тэр нь
         * батлах эрхтэй хүн БИШ. Урьд нь энд `canInspect` байсан тул хоёр
         * шаттай урсгалд 1-р шатыг хийх хүн олдохгүй, ажил гацах байсан.
         */
        if (!STAGE_ROLES[stage].includes(session.role)) {
          return fail(403, "Forbidden", "Энэ шатыг хийх эрх танд байхгүй.");
        }

        /*
         * НЭГ хүн ХОЁР шатыг ч хийж болохгүй. Эс бөгөөс каскад нь зүгээр л
         * хоёр товч болж, мэдээлэх ба батлах эрхийг салгасан зарчим утгаа
         * алдана.
         */
        if (stage === "final_approval") {
          const mine = (extraInspections.get(item.id) ?? []).some(
            (i) => i.stage === "site_check" && i.acceptedQty > 0 && i.inspector?.id === session.id,
          );

          if (mine) {
            return fail(
              403,
              "Forbidden",
              "Та энэ ажлыг 1-р шатад шалгасан тул 2-р шатад батлах боломжгүй.",
            );
          }
        }

        const acceptedQty = Number(p?.acceptedQty ?? 0);
        if (p?.result !== "accepted" && !p?.reason)
          return fail(422, "ValidationError", "Татгалзах шалтгаан заавал.");

        /*
         * ХЯНАГДААГҮЙ хэмжээнээс ИЛҮҮГ батлах боломжгүй.
         *
         * Энэ хаалт backend-д (`StoreInspectionRequest::after`) байсан ч
         * mock-д дутуу байв. Үр дүнд нь mock дээр нэг ажлыг хоёр шатанд
         * дахин батлаад батлагдсан хэмжээ ХОЁР ДАХИН болдог байсан —
         * жинхэнэ сервер үүнийг 422-оор няцаадаг.
         */
        const pendingQty = stagePool(item, stage);
        if (acceptedQty > pendingQty + 0.001) {
          return fail(
            422,
            "ValidationError",
            stage === "final_approval" && pendingQty <= 0
              ? "Батлах ажил алга: талбайн инженер хараахан шалгаагүй байна."
              : `${stage === "site_check" ? "Шалгах" : "Батлах"} ажил ${pendingQty} ${item.unit} — түүнээс их боломжгүй.`,
          );
        }

        // "Зөвхөн зураг дээр үндэслэн ажил батлахгүй" — backend-тэй ижил хаалт.
        const clError = checklistError(item, p?.result ?? "accepted", p?.checklist ?? []);
        if (clError) return fail(422, "ValidationError", clError);

        const insp: Inspection = {
          id: mockId(`insp-${item.id}`),
          workItemId: item.id,
          stage,
          stageLabel:
            stage === "site_check" ? "Талбайн инженер шалгасан" : "Хяналтын инженер баталсан",
          result: (p.result as Inspection["result"]) ?? "accepted",
          acceptedQty,
          // Татгалзсан ба хянагдаагүй хоёр өөр зүйл — backend-тэй ижил.
          // Татгалзсан хэмжээг ТУХАЙН ШАТНЫ сангаас бодно — эс бөгөөс
          // хараахан шалгагдаагүй хэмжээ ч татгалзсан гэж тэмдэглэгдэнэ.
          rejectedQty: p.result === "accepted" ? 0 : round(Math.max(pendingQty - acceptedQty, 0)),
          reason: p.reason,
          inspectedAt: new Date().toISOString(),
          inspector: { id: session.id, name: session.name },
        };
        extraInspections.set(item.id, [insp, ...(extraInspections.get(item.id) ?? [])]);

        // Шат бүр ӨӨРИЙН баганыг нэмэгдүүлнэ — нэг сангаас идэхгүй.
        if (stage === "site_check") {
          item.checkedQty = round((item.checkedQty ?? 0) + acceptedQty);
        } else {
          item.acceptedQty = round(item.acceptedQty + acceptedQty);
        }
        // ТАТГАЛЗСАН хэмжээ мэдээлсэн дүнгээс хасагдана — ингэснээр үлдэгдэл
        // эргэж бүтэн болж, гүйцэтгэгч засвараа ижил мөрөн дээр дахин
        // мэдээлж чадна. Хасахгүй бол «үлдэгдэл 0» болж мухардана.
        item.reportedQty = round(Math.max(item.reportedQty - insp.rejectedQty, 0));
        recalc(item);
        recalcReview(item);
        applyStage(item);

        return created(insp);
      }
      const rows = [...(extraInspections.get(item.id) ?? []), ...inspectionsFor(item)];
      return ok({
        data: rows,
        meta: { total: rows.length, page: 1, pageSize: rows.length },
      });
    }

    // --- Хугацаа сунгах (шалтгаан заавал) ---
    // Тухайн ажлын сунгалтын түүх.
    if (c === "extension-requests" && method === "GET") {
      const rows = [...mockExtensions.values()]
        .filter((x) => x.workItemId === item.id)
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

      return ok({ data: rows });
    }

    if (c === "extend" && method === "POST") {
      /*
       * ХҮСЭЛТ гаргах эрх нь ӨРГӨН — backend-тэй ижил.
       *
       * Хуваарь хэтэрч байгааг хамгийн эрт мэддэг хүн нь гүйцэтгэгч ба
       * талбайн инженер. Урьд нь зөвхөн `canEditPlan` хүлээж авдаг байсан
       * тул тэд хүсэлт ч гаргаж чаддаггүй байв.
       */
      if (!session.canReportProgress && !session.canEditPlan) {
        return fail(403, "Forbidden", "Танд хугацаа сунгах хүсэлт гаргах эрх байхгүй.");
      }

      if (isRep() && item.contractor?.id !== session.contractorId) {
        return fail(403, "Forbidden", "Энэ ажил таны хариуцлагад байхгүй.");
      }

      const p = body as {
        plannedEndDate?: string;
        category?: string;
        reason?: string;
      };
      if (!p?.plannedEndDate) return fail(422, "ValidationError", "Шинэ дуусах огноог сонгоно уу.");
      if (!p?.category || !(p.category in ISSUE_LABELS)) {
        return fail(422, "ValidationError", "Саатлын шалтгааныг сонгоно уу.");
      }
      if (!p?.reason?.trim()) return fail(422, "ValidationError", "Тайлбар бичнэ үү.");
      if (p.reason.trim().length < 10) {
        return fail(
          422,
          "ValidationError",
          "Тайлбар хэт тодорхойгүй — дор хаяж 10 тэмдэгт бичнэ үү.",
        );
      }

      const current = item.plannedEndDate;
      // Огноог урагш татах нь сунгах биш — хоцролтыг хиймлээр үүсгэнэ.
      if (current && p.plannedEndDate <= current) {
        return fail(
          422,
          "ValidationError",
          `Шинэ огноо одоогийнхоос (${current}) хойш байх ёстой.`,
        );
      }

      // Нэг ажилд ХОЁР хүлээгдэж буй хүсэлт байж болохгүй.
      const open = [...mockExtensions.values()].find(
        (x) => x.workItemId === item.id && x.status === "pending",
      );

      if (open) {
        return fail(
          422,
          "ValidationError",
          `Энэ ажилд ${open.requestedEndDate} хүртэл сунгах хүсэлт аль хэдийн хүлээгдэж байна.`,
        );
      }

      const req: ExtensionRequest = {
        id: mockId("extreq"),
        workItemId: item.id,
        workItemName: item.name,
        locationPath: item.location.path,
        currentEndDate: current ?? null,
        requestedEndDate: p.plannedEndDate,
        requestedDays: current
          ? Math.round(
              (Date.parse(`${p.plannedEndDate}T00:00:00Z`) - Date.parse(`${current}T00:00:00Z`)) /
                86_400_000,
            )
          : 0,
        category: p.category as ExtensionRequest["category"],
        reason: p.reason.trim(),
        status: "pending",
        requestedBy: { id: session.id, name: session.name },
        createdAt: new Date().toISOString(),
      };
      mockExtensions.set(req.id, req);

      // Батлах эрхтэй хүн сунгавал ТЭР ДОР НЬ батлагдана.
      const applied = EXTENSION_APPROVER_ROLES.includes(session.role);
      if (applied) applyExtension(req, session.name);

      /*
       * 200 ба 202-ыг ЯЛГАНА — backend-тэй ижил.
       *
       * Батлагдсан бол огноо хөдөлсөн, хүлээгдэж байгаа бол хөдлөөгүй.
       * Нэг статус буцаавал дэлгэц «сунгалаа» гэж харуулаад хэрэглэгч
       * хуваариа өөрчлөгдсөн гэж бодоод явна.
       */
      return {
        status: applied ? 200 : 202,
        body: { data: req, meta: { applied, workItem: item } },
      };
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
      const inactiveOne = inactiveContractorError(p?.contractorId);
      if (inactiveOne) return inactiveOne;

      const ctr = getDb().contractors.find((x) => x.id === p?.contractorId);
      item.contractor = ctr ? { id: ctr.id, name: ctr.name } : null;

      return ok({ data: item });
    }

    if (c === "inspector" && method === "PATCH") {
      if (!INSPECTOR_ASSIGNER_ROLES.includes(session.role)) {
        return fail(403, "Forbidden", "Танд хяналтын инженер оноох эрх байхгүй.");
      }

      const p = body as { inspectorId?: string | number | null };
      const next = p?.inspectorId ?? null;

      if (next === null) {
        item.inspector = null;

        return ok({ data: item });
      }

      const user = mockUsers.find((u) => String(u.id) === String(next));

      if (!user) {
        return fail(422, "Unprocessable", "Хэрэглэгч олдсонгүй.");
      }

      if (!user.isActive) {
        return fail(
          422,
          "Unprocessable",
          "Эрх хаагдсан хэрэглэгчийг хяналтын инженерээр оноож болохгүй.",
        );
      }

      /*
       * ГОЛ ХОРИГ — backend-тэй ижил: батлах эрхгүй хүнийг оноовол тэр ажил
       * мөнхөд батлагдахгүй гацна. Mock-д хориг байхгүй бол дэлгэц түүнийг
       * зөвшөөрөх мэт бүтээгдэж, зөвхөн жинхэнэ сервер дээр унана.
       */
      if (!user.canInspect) {
        return fail(
          422,
          "Unprocessable",
          `${user.name} (${user.position ?? "—"}) нь гүйцэтгэл батлах эрхгүй. ` +
            "Хяналтын инженерээр оноовол батлахыг хүлээсэн ажил гацна.",
        );
      }

      item.inspector = { id: user.id, name: user.name, position: user.position ?? null };

      return ok({ data: item });
    }

    // Шалгалт хийхийн өмнө "юу бөглөх вэ" гэдгийг эндээс асууна.
    if (c === "checklist") {
      return ok({ data: resolveChecklist(item) });
    }

    if (c === "issues") {
      if (method === "POST") {
        const p = body as {
          category?: string;
          severity?: string;
          description?: string;
        };
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

      seedIssues();
      const rows = mockIssues.get(item.id) ?? [];

      return ok({
        data: rows,
        meta: { total: rows.length, page: 1, pageSize: 50 },
      });
    }

    /*
     * Зураг — гүйцэтгэлийн бичлэгүүдэд хавсаргасан бүх зураг.
     *
     * Шинээр ХАДГАЛАХ нь mock-д боломжгүй хэвээр (файлын сан байхгүй) тул POST
     * нь 501 буцаана. Харин уншихад зураг байх нь чухал: нотолгооны урсгал
     * хоосон жагсаалт дээр огт харагддаггүй.
     */
    if (c === "photos") {
      if (method === "POST") return fail(501, "NotImplemented", "Mock горимд зураг хадгалахгүй.");

      const rows = progressFor(item).flatMap((e) => e.photos ?? []);

      return ok({
        data: rows,
        meta: { total: rows.length, page: 1, pageSize: 50 },
      });
    }
  }

  return fail(404, "NotFound", `Mock-д ${method} /${segments.join("/")} хэрэгжээгүй.`);
}

export { MOCK_IDS };
