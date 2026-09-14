/**
 * CPMS API v2 — endpoint функцууд.
 *
 * `docs/api-v2-endpoints.md`-ийн MVP хэсгийг хэрэгжүүлнэ. Одоо байгаа v1
 * `request()` wrapper-ыг дахин ашиглана — proxy, алдааны дугтуй, AbortSignal
 * бүгд хэвээр. Backend бэлэн болтол `CPMS_MOCK=1` үед proxy эдгээрийг
 * `lib/mock`-оос хариулна.
 */
import { getToken } from "@/lib/auth";
import { API_BASE } from "@/lib/config";
import { request } from "../client";
import type {
  AcceptanceReport,
  Block,
  BlockDesign,
  BlockSummary,
  Contractor,
  Job,
  CreateInspectionRequest,
  CreateProgressRequest,
  Inspection,
  InspectionStage,
  Issue,
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
  acceptanceXlsx: async (projectId: Uuid, params: AcceptanceParams): Promise<void> => {
    const token = getToken();
    const response = await fetch(
      `${API_BASE}/projects/${projectId}/reports/acceptance.xlsx?${acceptanceQuery(params)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
    );

    if (!response.ok) {
      const json = (await response.json().catch(() => undefined)) as
        { error?: { message?: string } } | undefined;
      throw new Error(json?.error?.message ?? `Татах амжилтгүй (${response.status})`);
    }

    // Файлын нэрийг сервер `Content-Disposition`-оор өгнө.
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const name = match ? decodeURIComponent(match[1]) : "akt.xlsx";

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    // Хөтөч татаж дуустал хаяг амьд байх ёстой тул шууд биш, дараа нь
    // чөлөөлнө — эс бөгөөс зарим хөтөч дээр файл хоосон татагдана.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

// ---------------------------------------------------------------------------
// Төслийн түвшний нэгтгэл
// ---------------------------------------------------------------------------
export const projectsV2 = {
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
  list: (projectId: Uuid, type: QueueType, params?: { page?: number; pageSize?: number }) =>
    request<ListEnvelope<WorkItem>>("GET", `/projects/${projectId}/queue`, {
      query: { type, ...params },
    }),

  counts: (projectId: Uuid) =>
    request<Item<QueueCounts>>("GET", `/projects/${projectId}/queue/counts`).then((r) => r.data),
};

export const issues = {
  forProject: (projectId: Uuid, params?: { status?: string; category?: string }) =>
    request<ListEnvelope<Issue>>("GET", `/projects/${projectId}/issues`, { query: params }),

  forWorkItem: (workItemId: Uuid) =>
    request<ListEnvelope<Issue>>("GET", `/work-items/${workItemId}/issues`),

  create: (workItemId: Uuid, body: { category: string; severity?: string; description: string }) =>
    request<Item<Issue>>("POST", `/work-items/${workItemId}/issues`, { body }).then((r) => r.data),

  resolve: (issueId: Uuid) =>
    request<Item<Issue>>("PATCH", `/issues/${issueId}`, { body: { status: "resolved" } }).then(
      (r) => r.data,
    ),
};

export const contractorsV2 = {
  list: () => request<ListEnvelope<Contractor>>("GET", "/contractors"),
};

export const apiV2 = {
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
  projects: projectsV2,
  contractors: contractorsV2,
};
