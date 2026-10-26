/**
 * CPMS API — endpoint функцууд.
 *
 * `docs/api-endpoints.md`-ийг хэрэгжүүлнэ. Бүгд `request()` wrapper-аар
 * дамжина — proxy, алдааны дугтуй, AbortSignal. `CPMS_MOCK=1` үед proxy
 * эдгээрийг `lib/mock`-оос хариулна.
 */
import { getToken } from "@/lib/auth";
import { API_BASE } from "@/lib/config";
import { request, upload } from "./client";
import type { ProjectSummary } from "./use-project";
import type {
  AcceptanceReport,
  Block,
  BlockBudget,
  BlockDeletionImpact,
  BudgetMaterialRow,
  BlockDesign,
  BlockReport,
  BudgetImport,
  BudgetImportType,
  ImportEnvelope,
  ImportMode,
  BlockSummary,
  Agreement,
  AgreementDraftLine,
  AgreementStatus,
  ConcreteBalanceRow,
  ConcreteOrder,
  MaterialBalanceRow,
  MaterialOrder,
  Contractor,
  ExtensionRequest,
  ExtensionStatus,
  Job,
  CreateInspectionRequest,
  CreateProgressRequest,
  Inspection,
  InspectionStage,
  Issue,
  IssueCategory,
  ChecklistTemplate,
  ListEnvelope,
  Location,
  ManagedUser,
  QueueCounts,
  QueueType,
  RoleOption,
  Photo,
  PhotoType,
  ProgressEntry,
  ProjectDashboard,
  SummaryGroupBy,
  Uuid,
  WorkItem,
  WorkItemFilters,
  WorkType,
  WorkTypeGroup,
  WorkTypeInput,
} from "./types";

export * from "./types";

// Зургийн хаягийн логик нь `lib/photo-url.ts`-д — шалгалтын скриптэд
// ачаалагдах боломжтой байхын тулд тусад нь.
export { photoUrl } from "@/lib/photo-url";

interface Item<T> {
  data: T;
}

// ---------------------------------------------------------------------------
// Блок ба байршил
// ---------------------------------------------------------------------------
export const blockDesigns = {
  list: () => request<ListEnvelope<BlockDesign>>("GET", "/block-designs"),

  /**
   * Загварыг блокт буулгаж WorkItem бөөнөөр үүсгэнэ. Мянга мянган мөр үүсэх
   * тул синхрон биш — `jobId` буцаана, `jobs.get()`-оор дагаж хянана.
   */
  apply: (designId: Uuid, body: { blockId: Uuid; startDate?: string }) =>
    request<Item<Job>>("POST", `/block-designs/${designId}/apply`, { body }).then((r) => r.data),
};

export const jobs = {
  get: (id: Uuid) => request<Item<Job>>("GET", `/jobs/${id}`).then((r) => r.data),
};

export const blocks = {
  /** Блокт ОРСОН төсөв — ажлын хөлс ба материал. */
  budget: (blockId: Uuid) =>
    request<Item<BlockBudget>>("GET", `/blocks/${blockId}/budget`).then((r) => r.data),

  /**
   * Ажлын төрлийн төсвийн нэгж үнийг ГАРААР тавих.
   *
   * `null` нь үнийг арилгана. Үнэ нь блок доторх тэр төрлийн БҮХ
   * ажилд тавигдана — төсөв дээр нэгж үнэ төрөл бүрт нэг байдаг.
   */
  setWorkPrice: (blockId: Uuid, workTypeId: Uuid, unitPrice: number | null) =>
    request<Item<{ updated: number }>>("PATCH", `/blocks/${blockId}/budget/work-price`, {
      body: { workTypeId, unitPrice },
    }).then((r) => r.data),

  /**
   * Блокийн ЕРӨНХИЙ тайлан — гүйцэтгэл, мөнгө, хугацаа, чанар, материал.
   *
   * Актаас ялгаатай: акт нь нэг ХУГАЦААНЫ төлбөрийн баримт, энэ нь
   * барилгын эхлэлээс өнөөдрийг хүртэлх бүтэн зураг.
   */
  report: (blockId: Uuid) =>
    request<Item<BlockReport>>("GET", `/blocks/${blockId}/report`).then((r) => r.data),

  reportSheet: (blockId: Uuid, buildingNo: string) =>
    downloadFile(`/blocks/${blockId}/report.xlsx`, `blok-tailan-${buildingNo}.xlsx`),

  /** Устгахаас ӨМНӨ юу алга болохыг тоогоор. Зөвхөн админ. */
  deletionImpact: (blockId: Uuid) =>
    request<Item<BlockDeletionImpact>>("GET", `/blocks/${blockId}/deletion-impact`).then(
      (r) => r.data,
    ),

  /**
   * Блок УСТГАХ — нэрийг бичиж баталгаажуулна.
   *
   * Байршил, ажлын мөр, явц, шалгалт, зураг, төсөв, захиалга бүгд
   * каскадаар дагаж устана. Буцаах арга байхгүй.
   */
  destroy: (blockId: Uuid, confirmName: string) =>
    request<Item<{ name: string; photosRemoved: number }>>("DELETE", `/blocks/${blockId}`, {
      body: { confirmName },
    }).then((r) => r.data),

  listForProject: (projectId: Uuid) =>
    request<ListEnvelope<Block>>("GET", `/projects/${projectId}/blocks`),

  /**
   * Блок үүсгэх.
   *
   * `designId` нь ЗААВАЛ БИШ: 75 барилгыг бүгдийг нь загвартай үүсгэвэл
   * ~247,000 мөр төрнө. Загваргүй бол давхар/айлын тоог гараар авна.
   */
  create: (
    projectId: Uuid,
    body: {
      name: string;
      buildingNo: string;
      startDate: string;
      designId?: Uuid;
      purpose?: string;
      floors?: number;
      unitsPerFloor?: number;
    },
  ) => request<Item<Block>>("POST", `/projects/${projectId}/blocks`, { body }).then((r) => r.data),

  get: (id: Uuid) => request<Item<Block>>("GET", `/blocks/${id}`).then((r) => r.data),

  locations: (blockId: Uuid, params?: { level?: string; parentId?: Uuid }) =>
    request<ListEnvelope<Location>>("GET", `/blocks/${blockId}/locations`, {
      query: { level: params?.level, parentId: params?.parentId },
    }),

  /** Давхар/айлыг бөөнөөр үүсгэх — гараар 144 зангилаа хийхгүй. */
  generateLocations: (
    blockId: Uuid,
    body: { floors: number; unitsPerFloor: number; basements?: number },
  ) => request<ListEnvelope<Location>>("POST", `/blocks/${blockId}/locations/generate`, { body }),

  summary: (blockId: Uuid, groupBy: SummaryGroupBy = "floor") =>
    request<Item<BlockSummary>>("GET", `/blocks/${blockId}/summary`, {
      query: { groupBy },
    }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Ажлын төрлийн сан
// ---------------------------------------------------------------------------
export const workTypes = {
  groups: () => request<ListEnvelope<WorkTypeGroup>>("GET", "/work-type-groups"),
  list: (params?: { groupId?: Uuid; search?: string }) =>
    request<ListEnvelope<WorkType>>("GET", "/work-types", { query: { ...params } }),
};

// ---------------------------------------------------------------------------
// WorkItem
// ---------------------------------------------------------------------------
export const workItems = {
  listForBlock: (blockId: Uuid, filters: WorkItemFilters = {}) =>
    request<ListEnvelope<WorkItem>>("GET", `/blocks/${blockId}/work-items`, {
      query: {
        locationId: filters.locationId,
        includeDescendants: filters.includeDescendants,
        workTypeId: filters.workTypeId,
        workTypeGroupId: filters.workTypeGroupId,
        contractorId: filters.contractorId,
        inspectorId: filters.inspectorId,
        status: filters.status,
        reviewState: filters.reviewState,
        overdueDays: filters.overdueDays,
        search: filters.search,
        page: filters.page,
        pageSize: filters.pageSize,
      },
    }),

  get: (id: Uuid) => request<Item<WorkItem>>("GET", `/work-items/${id}`).then((r) => r.data),

  update: (
    id: Uuid,
    body: Partial<Pick<WorkItem, "status" | "plannedStartDate" | "plannedEndDate">>,
  ) => request<Item<WorkItem>>("PATCH", `/work-items/${id}`, { body }).then((r) => r.data),

  assign: (id: Uuid, contractorId: Uuid) =>
    request<Item<WorkItem>>("PATCH", `/work-items/${id}`, { body: { contractorId } }).then(
      (r) => r.data,
    ),

  // -- гүйцэтгэл --
  progress: (id: Uuid) => request<ListEnvelope<ProgressEntry>>("GET", `/work-items/${id}/progress`),
  addProgress: (id: Uuid, body: CreateProgressRequest) =>
    request<Item<ProgressEntry>>("POST", `/work-items/${id}/progress`, { body }).then(
      (r) => r.data,
    ),

  // -- шалгалт --
  inspections: (id: Uuid) =>
    request<ListEnvelope<Inspection>>("GET", `/work-items/${id}/inspections`),
  addInspection: (id: Uuid, body: CreateInspectionRequest) =>
    request<Item<Inspection>>("POST", `/work-items/${id}/inspections`, { body }).then(
      (r) => r.data,
    ),

  // -- асуудал --
  issues: (id: Uuid) => request<ListEnvelope<Issue>>("GET", `/work-items/${id}/issues`),

  // -- зургийн баримт --
  photos: (id: Uuid) => request<ListEnvelope<Photo>>("GET", `/work-items/${id}/photos`),

  /**
   * Зураг хавсаргана. JSON биш `multipart/form-data` тул `request()`-ийг
   * тойрч, proxy руу шууд илгээнэ — токеныг гараар нэмнэ.
   */
  addPhoto: async (
    id: Uuid,
    file: File,
    type: PhotoType,
    /**
     * Аль гүйцэтгэлийн мэдээлэлд хамаарах вэ.
     *
     * Хоосон бол зураг ажилд ерөнхийд нь хавсрана — «аль зураг нь алины
     * нотолгоо вэ» гэдэг мэдэгдэхгүй болно. Гүйцэтгэл бүртгэх урсгал
     * үүнийг ЗААВАЛ дамжуулна.
     */
    progressEntryId?: Uuid,
  ): Promise<Photo> => {
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    if (progressEntryId) form.append("progressEntryId", progressEntryId);

    const token = getToken();
    const response = await fetch(`${API_BASE}/work-items/${id}/photos`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

    const json = (await response.json().catch(() => undefined)) as
      { data?: Photo; error?: { message?: string } } | undefined;

    if (!response.ok) {
      /*
       * Зураг илгээх нь вэб серверийн ХЭМЖЭЭНИЙ ХЯЗГААРт хамгийн түрүүнд
       * хүрдэг хүсэлт. Тэр хязгаарыг nginx болон PHP тус тусдаа тавьдаг ба
       * аль нь ч Laravel хүртэл хүрэхгүй тул JSON алдаа ирэхгүй — зүгээр л
       * дугаар ирнэ. Тиймээс дугаар бүрийг ойлгомжтой болгож тайлбарлана.
       */
      const hint =
        response.status === 413
          ? " Файл хэт том байна — серверийн хязгаарыг (nginx `client_max_body_size`, PHP `upload_max_filesize`) нэмэгдүүлнэ үү."
          : response.status === 419 || response.status === 401
            ? " Нэвтрэх хугацаа дууссан байж магадгүй — дахин нэвтэрнэ үү."
            : response.status >= 500
              ? " Серверийн алдаа — `storage/` фолдерын бичих эрхийг шалгана уу."
              : "";

      throw new Error(
        (json?.error?.message ?? `Зураг илгээх амжилтгүй (${response.status})`) + hint,
      );
    }

    return json!.data!;
  },

  removePhoto: (photoId: Uuid) => request<void>("DELETE", `/photos/${photoId}`),
};

// ---------------------------------------------------------------------------
// Тайлан
// ---------------------------------------------------------------------------
export interface AcceptanceParams {
  contractorId?: Uuid;
  blockId?: Uuid;
  from: string;
  to: string;
  stage?: InspectionStage;
}

const acceptanceQuery = (p: AcceptanceParams) =>
  new URLSearchParams(
    Object.entries(p).filter(([, v]) => v != null && v !== "") as [string, string][],
  ).toString();

export const reports = {
  /** Урьдчилан харах — дэлгэц дээр хүснэгт болж харагдана. */
  acceptance: (projectId: Uuid, params: AcceptanceParams) =>
    request<Item<AcceptanceReport>>(
      "GET",
      `/projects/${projectId}/reports/acceptance?${acceptanceQuery(params)}`,
    ).then((r) => r.data),

  /**
   * Excel татах.
   *
   * `request()`-ийг тойрно: хариу нь JSON биш хоёртын файл. Token-ыг гараар
   * нэмж, blob болгон авч хөтчөөр хадгалуулна.
   */
  acceptanceXlsx: (projectId: Uuid, params: AcceptanceParams): Promise<void> =>
    downloadFile(
      `/projects/${projectId}/reports/acceptance.xlsx?${acceptanceQuery(params)}`,
      "akt.xlsx",
    ),
};

// ---------------------------------------------------------------------------
// Төслийн түвшний нэгтгэл
// ---------------------------------------------------------------------------
export const projects = {
  /**
   * Компанийг `companyId`-аар сонгоно, эсвэл `companyName`-аар хамт үүсгэнэ
   * (хоосон серверт компани ч байхгүй байж болно).
   */
  create: (body: {
    name: string;
    companyId?: Uuid;
    companyName?: string;
    code?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
  }) => request<Item<ProjectSummary>>("POST", "/projects", { body }).then((r) => r.data),

  /** Төсөл үүсгэх маягтын компани сонголт — зөвхөн админд. */
  companies: () =>
    request<{ data: { id: Uuid; name: string }[] }>("GET", "/companies").then((r) => r.data),

  dashboard: (projectId: Uuid) =>
    request<Item<ProjectDashboard>>("GET", `/projects/${projectId}/dashboard`).then((r) => r.data),

  pendingInspections: (projectId: Uuid, params?: { page?: number; pageSize?: number }) =>
    request<ListEnvelope<WorkItem>>("GET", `/projects/${projectId}/inspections`, {
      query: { status: "pending", ...params },
    }),
};

// ---------------------------------------------------------------------------
// Админы удирдлага
// ---------------------------------------------------------------------------
export const users = {
  list: (params?: { role?: string; search?: string }) =>
    request<ListEnvelope<ManagedUser>>("GET", "/users", { query: params }),

  roles: () => request<{ data: RoleOption[] }>("GET", "/users/roles").then((r) => r.data),

  /**
   * Хяналтын инженерээр оноож болох хүмүүс.
   *
   * `list()`-ээс ТУСДАА: тэр нь зөвхөн админ, захиралд нээлттэй, энэ нь
   * оноох эрхтэй бүх үүрэгт. Нэр, албан тушаалаас өөр юу ч буцаахгүй.
   */
  inspectors: () =>
    request<{ data: { id: number | string; name: string; position: string | null; roleLabel: string }[] }>(
      "GET",
      "/users/inspectors",
    ).then((r) => r.data),

  create: (body: Record<string, unknown>) =>
    request<{ data: ManagedUser; meta?: { temporaryPassword?: string } }>("POST", "/users", {
      body,
    }),

  update: (id: ManagedUser["id"], body: Record<string, unknown>) =>
    request<Item<ManagedUser>>("PATCH", `/users/${id}`, { body }).then((r) => r.data),

  resetPassword: (id: ManagedUser["id"]) =>
    request<{ data: { temporaryPassword: string } }>("POST", `/users/${id}/reset-password`).then(
      (r) => r.data.temporaryPassword,
    ),

  deactivate: (id: ManagedUser["id"]) =>
    request<Item<ManagedUser>>("DELETE", `/users/${id}`).then((r) => r.data),
};

export const referenceData = {
  groups: () => request<ListEnvelope<WorkTypeGroup>>("GET", "/work-type-groups"),

  createGroup: (body: { name: string }) =>
    request<Item<WorkTypeGroup>>("POST", "/work-type-groups", { body }).then((r) => r.data),

  types: (params?: { groupId?: Uuid; search?: string }) =>
    request<ListEnvelope<WorkType & { inUse?: boolean }>>("GET", "/work-types", { query: params }),

  createType: (body: WorkTypeInput) =>
    request<Item<WorkType>>("POST", "/work-types", { body }).then((r) => r.data),

  updateType: (id: Uuid, body: Partial<WorkTypeInput>) =>
    request<Item<WorkType>>("PATCH", `/work-types/${id}`, { body }).then((r) => r.data),

  deleteType: (id: Uuid) => request<void>("DELETE", `/work-types/${id}`),
};

/**
 * Төлөвлөгөөт тоо хэмжээ гүйцээх.
 *
 * Захиалагчийн Хавсралт-2-т ~30 ажлын төрлийн тоо хэмжээ хоосон байсан.
 * Тэдгээр нь `plannedQty = 0` болж үүсэх бөгөөд үлдэгдэл 0 тул гүйцэтгэл
 * оруулах боломжгүй болдог.
 */
export const plan = {
  updateWorkItem: (
    id: Uuid,
    body: { plannedQty?: number; plannedStartDate?: string; plannedEndDate?: string },
  ) => request<Item<WorkItem>>("PATCH", `/work-items/${id}`, { body }).then((r) => r.data),

  /** Блокийн нэг ажлын төрлийн БҮХ мөрөнд нэг дор оруулна. */
  setQuantityForBlock: (
    blockId: Uuid,
    body: {
      workTypeId: Uuid;
      plannedQty: number;
      overwriteExisting?: boolean;
      updateDesign?: boolean;
    },
  ) =>
    request<Item<{ affected: number; designUpdated: boolean }>>(
      "POST",
      `/blocks/${blockId}/work-items/set-quantity`,
      { body },
    ).then((r) => r.data),

  /**
   * Блокийн бүх огноог давхрын хугацаагаар дахин татах (re-baseline).
   *
   * Батлагдсан ажил хөндөгдөхгүй — `frozen` тэдгээрийн тоо.
   */
  reschedule: (blockId: Uuid, body: { taktDays: number; startDate?: string }) =>
    request<Item<{ taktDays: number; updated: number; frozen: number }>>(
      "POST",
      `/blocks/${blockId}/schedule`,
      { body },
    ).then((r) => r.data),

  /**
   * Ажлын төрлүүдийг блокт нэмнэ — тус бүр өөрийн түвшний бүх байршилд.
   *
   * Олноор нэмэх нь үндсэн хэрэглээ: барилгын төлөвлөлт "нэг давхарт ямар
   * ажлууд хийгдэх вэ" гэсэн багцаар явдаг.
   */
  addWorkType: (
    blockId: Uuid,
    body: {
      workTypeIds?: Uuid[];
      workTypeId?: Uuid;
      plannedQty?: number;
      locationId?: Uuid;
      contractorId?: Uuid;
    },
  ) =>
    request<Item<{ created: number; skipped: { name: string; reason: string }[] }>>(
      "POST",
      `/blocks/${blockId}/work-items`,
      { body },
    ).then((r) => r.data),

  /** Гараар нэмсэн ажлыг буцаан авах — гүйцэтгэлгүй бол л боломжтой. */
  deleteWorkItem: (workItemId: Uuid) => request<void>("DELETE", `/work-items/${workItemId}`),

  missingQuantities: (blockId: Uuid) =>
    request<{
      data: { workTypeId: Uuid; name: string; unit: string; level: string; workItems: number }[];
    }>("GET", `/blocks/${blockId}/missing-quantities`).then((r) => r.data),
};

/**
 * Ажилд туслан гүйцэтгэгч оноох.
 *
 * `ApplyBlockDesign` нь ажлыг ХАРИУЦАГЧГҮЙ үүсгэдэг. Оноохгүй бол гүйцэтгэгч
 * нэвтрээд юу ч харахгүй — тэдний бүхэл функц өгөгдөлгүй болно.
 */
/**
 * Хугацаа сунгах — ХҮСЭЛТ, шалтгаан ЗААВАЛ.
 *
 * Огноог чимээгүй хойшлуулж болдог бол «хугацаа хэтэрсэн» гэсэн тоо утгагүй
 * болно. Батлах эрхтэй хүн (ерөнхий инженер, захирал) сунгавал тэр дор нь
 * батлагдана; бусдын хүсэлт `pending` болж хүлээнэ.
 */
export const schedule = {
  extend: (
    workItemId: Uuid,
    body: { plannedEndDate: string; category: IssueCategory; reason: string },
  ) =>
    request<{ data: ExtensionRequest; meta: { applied: boolean; workItem: WorkItem } }>(
      "POST",
      `/work-items/${workItemId}/extend`,
      { body },
    ),

  /** Тухайн ажлын сунгалтын түүх. */
  extensionsFor: (workItemId: Uuid) =>
    request<{ data: ExtensionRequest[] }>(
      "GET",
      `/work-items/${workItemId}/extension-requests`,
    ).then((r) => r.data),
};

/**
 * Сунгалтын хүсэлтийн дараалал.
 *
 * Хүсэлт хаана ч харагдахгүй бол урсгал нь байхгүйтэй адил: гүйцэтгэгч
 * хүсэлт илгээгээд хариу хүлээж, ерөнхий инженер түүнийг хэзээ ч хардаггүй.
 */
export const extensions = {
  list: (projectId: Uuid, status: ExtensionStatus | "all" = "pending") =>
    request<{ data: ExtensionRequest[] }>("GET", `/projects/${projectId}/extension-requests`, {
      query: { status },
    }).then((r) => r.data),

  approve: (id: Uuid, note?: string) =>
    request<Item<ExtensionRequest>>("POST", `/extension-requests/${id}/approve`, {
      body: { note },
    }).then((r) => r.data),

  /** Татгалзахад шалтгаан ЗААВАЛ — «болохгүй» гэж орхиж болохгүй. */
  reject: (id: Uuid, note: string) =>
    request<Item<ExtensionRequest>>("POST", `/extension-requests/${id}/reject`, {
      body: { note },
    }).then((r) => r.data),
};

export const assignments = {
  /** Ажлын бүлэг бүр хэнд оноогдсон — "юу онооход үлдсэн бэ". */
  forBlock: (blockId: Uuid) =>
    request<{
      data: {
        groupId: Uuid;
        groupName: string;
        workItems: number;
        unassigned: number;
        contractors: { id: Uuid; name: string; workItems: number }[];
      }[];
    }>("GET", `/blocks/${blockId}/assignments`).then((r) => r.data),

  assignGroup: (
    blockId: Uuid,
    body: {
      workTypeGroupId?: Uuid;
      workTypeId?: Uuid;
      contractorId: Uuid | null;
      reassignExisting?: boolean;
    },
  ) =>
    request<Item<{ affected: number; contractorId: Uuid | null }>>(
      "POST",
      `/blocks/${blockId}/work-items/assign`,
      { body },
    ).then((r) => r.data),

  assignOne: (workItemId: Uuid, contractorId: Uuid | null) =>
    request<Item<WorkItem>>("PATCH", `/work-items/${workItemId}/contractor`, {
      body: { contractorId },
    }).then((r) => r.data),

  /** Хяналт шалгалтыг хариуцах инженерийг солино. `null` = авна. */
  assignInspector: (workItemId: Uuid, inspectorId: number | string | null) =>
    request<Item<WorkItem>>("PATCH", `/work-items/${workItemId}/inspector`, {
      body: { inspectorId },
    }).then((r) => r.data),
};

export const checklists = {
  /** Тухайн ажилд ямар хуудас хамаарах вэ. `null` = хаалт байхгүй. */
  forWorkItem: (workItemId: Uuid) =>
    request<{ data: ChecklistTemplate | null }>("GET", `/work-items/${workItemId}/checklist`).then(
      (r) => r.data,
    ),

  templates: (params?: { workTypeId?: Uuid; groupId?: Uuid }) =>
    request<ListEnvelope<ChecklistTemplate>>("GET", "/checklist-templates", { query: params }),

  create: (body: Record<string, unknown>) =>
    request<Item<ChecklistTemplate>>("POST", "/checklist-templates", { body }).then((r) => r.data),

  addItem: (templateId: Uuid, body: { text: string; isRequired?: boolean; guidance?: string }) =>
    request<Item<ChecklistTemplate>>("POST", `/checklist-templates/${templateId}/items`, {
      body,
    }).then((r) => r.data),

  removeItem: (itemId: Uuid) => request<void>("DELETE", `/checklist-items/${itemId}`),

  remove: (templateId: Uuid) => request<void>("DELETE", `/checklist-templates/${templateId}`),
};

export const queue = {
  list: (
    projectId: Uuid,
    type: QueueType,
    params?: { page?: number; pageSize?: number; blockId?: Uuid },
  ) =>
    request<ListEnvelope<WorkItem>>("GET", `/projects/${projectId}/queue`, {
      query: { type, ...params },
    }),

  /** Табын тоонууд нь жагсаалттай ИЖИЛ шүүлтүүрийг дагана. */
  counts: (projectId: Uuid, params?: { blockId?: Uuid }) =>
    request<Item<QueueCounts>>("GET", `/projects/${projectId}/queue/counts`, {
      query: params,
    }).then((r) => r.data),
};

export interface IssueFilter {
  status?: string;
  category?: string;
  severity?: string;
  blockId?: string;
}

export const issues = {
  forProject: (projectId: Uuid, params?: IssueFilter) =>
    request<ListEnvelope<Issue>>("GET", `/projects/${projectId}/issues`, {
      query: {
        status: params?.status,
        category: params?.category,
        severity: params?.severity,
        blockId: params?.blockId,
      },
    }),

  forWorkItem: (workItemId: Uuid) =>
    request<ListEnvelope<Issue>>("GET", `/work-items/${workItemId}/issues`),

  create: (workItemId: Uuid, body: { category: string; severity?: string; description: string }) =>
    request<Item<Issue>>("POST", `/work-items/${workItemId}/issues`, { body }).then((r) => r.data),

  resolve: (issueId: Uuid) =>
    request<Item<Issue>>("PATCH", `/issues/${issueId}`, { body: { status: "resolved" } }).then(
      (r) => r.data,
    ),
};

/**
 * Ажил гүйцэтгэх тохиролцоо.
 *
 * Мөрүүд ТӨСВӨӨС татагдана (`draft`) — гэрээний мэргэжилтэн 64 мөрийг
 * гараар бичих нь алдаа гаргах цорын гагц зам.
 */

/**
 * Хоёртын файл татах — `request()`-ийг тойрно.
 *
 * Хариу нь JSON биш тул token-ыг гараар нэмж, blob болгон хөтчөөр
 * хадгалуулна. Актын экспорт ба тохиролцооны хуудас ХОЁУЛАА үүнийг
 * хэрэглэнэ: хоёр газар бичвэл нэг нь алдааны мессежийг барихаа болино.
 */
async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => undefined)) as
      | { error?: { message?: string } }
      | undefined;
    throw new Error(json?.error?.message ?? `Татах амжилтгүй (${response.status})`);
  }

  // Файлын нэрийг сервер `Content-Disposition`-оор өгнө.
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Хөтөч татаж дуустал хаяг амьд байх ёстой тул дараа нь чөлөөлнө.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const agreements = {
  list: (projectId: Uuid, params: { status?: AgreementStatus; contractorId?: Uuid } = {}) =>
    request<{ data: Agreement[] }>("GET", `/projects/${projectId}/agreements`, {
      query: params,
    }).then((r) => r.data),

  get: (id: Uuid) => request<Item<Agreement>>("GET", `/agreements/${id}`).then((r) => r.data),

  /** Төсвөөс мөр татна — хадгалахгүй, дэлгэц дээр үнэ тавина. */
  draftLines: (blockId: Uuid, groupIds: Uuid[] = []) =>
    request<{
      data: AgreementDraftLine[];
      meta: { withoutPrice: number; priceConflicts: number };
    }>("GET", `/blocks/${blockId}/agreement-draft`, {
      query: groupIds.length ? { groupIds: groupIds.join(",") } : {},
    }),

  create: (blockId: Uuid, body: Record<string, unknown>) =>
    request<Item<Agreement>>("POST", `/blocks/${blockId}/agreements`, { body }).then(
      (r) => r.data,
    ),

  update: (id: Uuid, body: Record<string, unknown>) =>
    request<Item<Agreement>>("PATCH", `/agreements/${id}`, { body }).then((r) => r.data),

  approve: (id: Uuid) =>
    request<Item<Agreement>>("POST", `/agreements/${id}/approve`).then((r) => r.data),

  /** Бланкны хэлбэрийн xlsx — хэвлээд гарын үсэг зуруулна. */
  sheet: (id: Uuid, number: string) =>
    downloadFile(`/agreements/${id}/sheet.xlsx`, `tohirolcoo-${number}.xlsx`),
};

export const contractors = {
  list: () => request<ListEnvelope<Contractor>>("GET", "/contractors"),

  /**
   * Профайл засах.
   *
   * ЗӨВХӨН илгээсэн талбарыг хөндөнө. Бүх талбарыг дамжуулбал утас засахад
   * РД, данс цэвэрлэгдэнэ.
   */
  update: (id: Uuid, body: Partial<Contractor>) =>
    request<Item<Contractor>>("PATCH", `/contractors/${id}`, { body }).then((r) => r.data),
};

/**
 * Төсвийн импорт — хоёр алхам, НЭГ файл.
 *
 * Байршуулах нь ЮУ Ч БИЧИХГҮЙ, зөвхөн тайлан буцаана. Файл сервер дээр
 * үлдэх тул батлах алхамд дахин илгээхгүй — ингэснээр «харсан файл» ба
 * «орсон файл» зөрөх боломжгүй.
 */
export const budgetImports = {
  list: (blockId: Uuid) =>
    request<ListEnvelope<BudgetImport>>("GET", `/blocks/${blockId}/imports`),

  /**
   * Энэ БЛОКТ тохируулсан загвар файл.
   *
   * Давхрын баганын толгойг блокийн байршлын нэрээр бичиж өгдөг тул
   * «блокт байхгүй байршил» гэсэн алдааны ангилал бүхэлдээ арилна.
   */
  template: (blockId: Uuid, blockName: string) =>
    downloadFile(`/blocks/${blockId}/budget-template.xlsx`, `tosov-zagvar-${blockName}.xlsx`),

  /**
   * Байршуулж урьдчилан харна.
   *
   * Төрөл ИЛГЭЭХГҮЙ: сервер файлын хуудсуудаас өөрөө таньна. Нэг файлд
   * хоёр төсөв байвал хоёуланг нь буцаана.
   */
  upload: (blockId: Uuid, file: File) => {
    const form = new FormData();
    form.append("file", file);

    return upload<ImportEnvelope>(`/blocks/${blockId}/imports`, form);
  },

  get: (id: Uuid) => request<ImportEnvelope>("GET", `/imports/${id}`),

  /**
   * ҮНЭХЭЭР бичнэ — бүхэлд нь эсвэл огт үгүй.
   *
   * `types` нь хоёр төсөвтэй файлаас нэгийг нь л оруулах боломж: нэг
   * хэсэг нь эвдэрсэн байхад нөгөөг нь хүлээлгэх шаардлагагүй.
   */
  apply: (id: Uuid, types: BudgetImportType[], prune = false, mode: ImportMode = "replace") =>
    request<ImportEnvelope>("POST", `/imports/${id}/apply`, { body: { types, prune, mode } }),

  discard: (id: Uuid) => request<Item<BudgetImport>>("DELETE", `/imports/${id}`).then((r) => r.data),
};

/**
 * Бетон зуурмагийн захиалга.
 *
 * `balance` нь энэ бүлгийн ГОЛ дуудлага: байршил × марк бүрийн төсөв,
 * захиалсан, үлдэгдэл. Цаасан бланкаас ялгарах цорын гагц зүйл.
 */
export const concreteOrders = {
  list: (projectId: Uuid, params?: { status?: string; blockId?: Uuid }) =>
    request<ListEnvelope<ConcreteOrder>>("GET", `/projects/${projectId}/concrete-orders`, {
      query: params,
    }),

  balance: (blockId: Uuid) =>
    request<ListEnvelope<ConcreteBalanceRow>>("GET", `/blocks/${blockId}/concrete-balance`),

  get: (id: Uuid) =>
    request<Item<ConcreteOrder>>("GET", `/concrete-orders/${id}`).then((r) => r.data),

  create: (blockId: Uuid, body: Record<string, unknown>) =>
    request<Item<ConcreteOrder>>("POST", `/blocks/${blockId}/concrete-orders`, { body }).then(
      (r) => r.data,
    ),

  update: (id: Uuid, body: Record<string, unknown>) =>
    request<Item<ConcreteOrder>>("PATCH", `/concrete-orders/${id}`, { body }).then((r) => r.data),

  submit: (id: Uuid) =>
    request<Item<ConcreteOrder>>("POST", `/concrete-orders/${id}/submit`).then((r) => r.data),

  confirm: (id: Uuid) =>
    request<Item<ConcreteOrder>>("POST", `/concrete-orders/${id}/confirm`).then((r) => r.data),

  deliver: (id: Uuid, deliveredQty: number, deliveredAt?: string) =>
    request<Item<ConcreteOrder>>("POST", `/concrete-orders/${id}/deliver`, {
      body: { deliveredQty, deliveredAt },
    }).then((r) => r.data),

  cancel: (id: Uuid, reason: string) =>
    request<Item<ConcreteOrder>>("POST", `/concrete-orders/${id}/cancel`, {
      body: { reason },
    }).then((r) => r.data),

  /** Захиалагчийн бланкны хэлбэрээр — хэвлээд гарын үсэг зуруулна. */
  sheet: (id: Uuid, number: string) =>
    downloadFile(`/concrete-orders/${id}/sheet.xlsx`, `beton-zahialga-${number}.xlsx`),
};

/**
 * Материалын захиалга — дөрвөн бланк НЭГ урсгалаар.
 *
 * Бетон ЭНД ОРОХГҮЙ: түүний үлдэгдэл давхраар бодогддог, маягт нь
 * нэг цутгалтын талбаруудтай. Хоёр өөр баримт.
 */
export const materialOrders = {
  list: (projectId: Uuid, params?: { status?: string; kind?: string; blockId?: Uuid }) =>
    request<ListEnvelope<MaterialOrder>>("GET", `/projects/${projectId}/material-orders`, {
      query: params,
    }),

  balance: (blockId: Uuid) =>
    request<ListEnvelope<MaterialBalanceRow>>("GET", `/blocks/${blockId}/material-balance`),

  get: (id: Uuid) =>
    request<Item<MaterialOrder>>("GET", `/material-orders/${id}`).then((r) => r.data),

  create: (blockId: Uuid, body: Record<string, unknown>) =>
    request<Item<MaterialOrder>>("POST", `/blocks/${blockId}/material-orders`, { body }).then(
      (r) => r.data,
    ),

  update: (id: Uuid, body: Record<string, unknown>) =>
    request<Item<MaterialOrder>>("PATCH", `/material-orders/${id}`, { body }).then((r) => r.data),

  submit: (id: Uuid) =>
    request<Item<MaterialOrder>>("POST", `/material-orders/${id}/submit`).then((r) => r.data),

  /** `approved` нь мөрийн id → зөвшөөрсөн тоо. Өгөөгүй мөр хэвээрээ батлагдана. */
  confirm: (id: Uuid, approved: Record<string, number> = {}) =>
    request<Item<MaterialOrder>>("POST", `/material-orders/${id}/confirm`, {
      body: { approved },
    }).then((r) => r.data),

  deliver: (id: Uuid, delivered: Record<string, number>, deliveredAt?: string) =>
    request<Item<MaterialOrder>>("POST", `/material-orders/${id}/deliver`, {
      body: { delivered, deliveredAt },
    }).then((r) => r.data),

  cancel: (id: Uuid, reason: string) =>
    request<Item<MaterialOrder>>("POST", `/material-orders/${id}/cancel`, {
      body: { reason },
    }).then((r) => r.data),

  sheet: (id: Uuid, number: string) =>
    downloadFile(`/material-orders/${id}/sheet.xlsx`, `material-zahialga-${number}.xlsx`),
};

/** Материалын төсвийн мөрийг гараар нэмэх, засах, хасах. */
export const materialBudget = {
  /**
   * Төсөвт БАЙХГҮЙ материалыг нэмэх.
   *
   * Тоо хэмжээг БАЙРШЛААР өгнө — нийт дүн задаргаанаас бодогдоно.
   * Бүхэл барилгад хамаарах материалыг блокийн үндэс байршилд бичнэ.
   */
  create: (
    blockId: Uuid,
    body: {
      code: string;
      name: string;
      grade?: string | null;
      unit: string;
      actualUnitPrice?: number | null;
      marketUnitPrice?: number | null;
      quantities: { locationId: Uuid; quantity: number }[];
    },
  ) =>
    request<Item<{ id: Uuid }>>("POST", `/blocks/${blockId}/material-budget-items`, {
      body,
    }).then((r) => r.data),

  /** Захиалгатай мөрийг устгах боломжгүй — сервер татгалзана. */
  destroy: (itemId: Uuid) =>
    request<Item<{ deleted: boolean }>>("DELETE", `/material-budget-items/${itemId}`).then(
      (r) => r.data,
    ),

  setPrice: (itemId: Uuid, prices: { actualUnitPrice?: number | null; marketUnitPrice?: number | null }) =>
    request<Item<BudgetMaterialRow>>("PATCH", `/material-budget-items/${itemId}/price`, {
      body: prices,
    }).then((r) => r.data),
};

export const api = {
  assignments,
  blocks,
  checklists,
  plan,
  users,
  referenceData,
  queue,
  issues,
  blockDesigns,
  jobs,
  workTypes,
  workItems,
  projects,
  agreements,
  contractors,
  budgetImports,
  concreteOrders,
  materialOrders,
  materialBudget,
};

/** A project-wide, scoped and paginated list, including reporting readiness. */
export const myWork = {
  list: (projectId: Uuid, params: {
    reportingState: import("./types").ReportingState;
    blockId?: Uuid;
    locationId?: Uuid;
    includeDescendants?: boolean;
    search?: string;
    page: number;
    pageSize: number;
  }) => request<import("./types").MyWorkEnvelope>("GET", `/projects/${projectId}/my-work`, { query: { ...params } }),
};
