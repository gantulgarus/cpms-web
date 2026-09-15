/**
 * CPMS API v2 — типүүд.
 *
 * `docs/api-v2-endpoints.md`-д тодорхойлсон гэрээг тусгана. v1-ээс ялгарах
 * гол зүйл: ажлын төрөл (WorkType) ба байршил (Location) тусдаа, тэдний
 * огтлолцол нь WorkItem. Гүйцэтгэл нь хувь биш тоо хэмжээгээр хөтлөгдөнө.
 *
 * v1 типүүд `lib/api/types.ts`-д хэвээр байна — backend шилжих хүртэл
 * хоёулаа зэрэгцэнэ.
 */

export type Uuid = string;
/** `YYYY-MM-DD` эсвэл ISO date-time. */
export type IsoDate = string;

export type WorkStatus = "not_started" | "in_progress" | "completed" | "on_hold" | "cancelled";
export type ReviewState = "none" | "pending" | "approved" | "returned";

/** Ажлын төрөл ямар байршлын түвшинд хянагдахыг заана. */
export type LocationLevel = "block" | "entrance" | "floor" | "unit" | "room" | "common";

/** Шалгалтын шат — эхлээд гүйцэтгэгчийн, дараа нь захиалагчийн хяналт. */
export type InspectionStage = "general_contractor" | "client";
export type InspectionResult = "accepted" | "rejected" | "partial";

export type IssueCategory =
  | "no_contractor"
  | "contractor_late"
  | "equipment_failure"
  | "material_shortage"
  | "weather"
  | "complaint"
  | "accident";

export interface Pagination {
  total: number;
  page: number;
  pageSize: number;
}

export interface ListEnvelope<T> {
  data: T[];
  meta: Pagination;
}

export interface ApiErrorBody {
  error: { name: string; message: string; details?: unknown };
}

// ---------------------------------------------------------------------------
// Мастер өгөгдөл
// ---------------------------------------------------------------------------
export interface Block {
  id: Uuid;
  projectId: Uuid;
  buildingNo: string;
  name: string;
  purpose: string;
  floors: number;
  unitCount: number;
  designId?: Uuid;
  startDate?: IsoDate;
  /** Давхрын хугацаа — нэг давхарт ногдох ажлын өдөр. Хуваарь үүнээс гарна. */
  taktDays?: number;
  status: WorkStatus;
}

/**
 * Стандарт зураг төслийн загвар. Захиалагчийн 49 орон сууцны барилга ердөө
 * 9 загвартай тул загварыг 9 удаа тохируулаад блок бүрт хувилна.
 */
export interface BlockDesign {
  id: Uuid;
  name: string;
  purpose: string;
  floors: number;
  unitsPerFloor: number;
  workTypeCount: number;
  /** Энэ загвараар блок үүсгэвэл хэдэн WorkItem гарахыг урьдчилж бодсон. */
  estimatedItems: number;
  /** Тоо хэмжээ нь тодорхойгүй ажлын төрлийн тоо — үлдэгдэл бодогдохгүй. */
  missingQuantities: number;
}

/** Урт хугацааны ажил (загвар буулгах, импорт) — синхрон биш. */
export interface Job {
  id: Uuid;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  total: number;
  result?: { blockId?: Uuid };
  error?: string;
}

export interface Location {
  id: Uuid;
  blockId: Uuid;
  parentId: Uuid | null;
  level: LocationLevel;
  name: string;
  /** Уншихад бэлэн бүтэн зам: "А блок › 5 давхар › А2". */
  path: string;
  sequenceNumber: number;
}

export interface WorkTypeGroup {
  id: Uuid;
  name: string;
  sequenceNumber: number;
}

export interface WorkType {
  id: Uuid;
  groupId: Uuid;
  groupName: string;
  name: string;
  unit: string;
  /** Энэ төрлийн ажил ямар түвшинд үүсэхийг заана. */
  level: LocationLevel;
}

export interface Contractor {
  id: Uuid;
  name: string;
  companyName?: string;
  tradeSpecialty?: string;
  contactPerson?: string;
  phone?: string;
  /** Зөвхөн гүйцэтгэгч удирдах эрхтэй хэрэглэгчид ирнэ. */
  accessCode?: string | null;
  accessCodeExpiresAt?: string | null;
  hasValidAccessCode?: boolean;
}

/** Системийн хэрэглэгч — админы дэлгэцэд. */
export interface ManagedUser {
  id: number | string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  scopeBlockIds: Uuid[];
  contractorId: Uuid | null;
  contractorName?: string | null;
  isActive: boolean;
  canReportProgress: boolean;
  canInspect: boolean;
  createdAt?: IsoDate;
}

export interface RoleOption {
  value: string;
  label: string;
  canReportProgress: boolean;
  canInspect: boolean;
  seesAllBlocks: boolean;
  /** Энэ үүрэг хэрэглэгч удирдах эрхтэй эсэх — өөрийгөө буулгахаас сэргийлнэ. */
  canManageUsers: boolean;
}

// ---------------------------------------------------------------------------
// WorkItem — гол нөөц
// ---------------------------------------------------------------------------
export interface WorkItem {
  id: Uuid;
  blockId: Uuid;
  locationId: Uuid;
  workTypeId: Uuid;
  name: string;
  unit: string;

  plannedQty: number;
  /** Гүйцэтгэгчийн мэдээлсэн нийлбэр. */
  reportedQty: number;
  /** Хяналтын инженерийн баталсан нийлбэр — үлдэгдэл үүнээс бодогдоно. */
  acceptedQty: number;
  remainingQty: number;
  percentage: number;

  plannedStartDate?: IsoDate;
  plannedEndDate?: IsoDate;
  status: WorkStatus;
  reviewState: ReviewState;
  overdueDays: number;

  /**
   * Татгалзсаны улмаас дахин хийсэн нийт хэмжээ.
   *
   * Зөвхөн дэлгэрэнгүй хуудсанд ирнэ. Дахин хийлтэд тусдаа ажлын мөр
   * үүсгэдэггүй тул зардлыг ингэж хэмжинэ.
   */
  rejectedTotal?: number;

  location: { id: Uuid; path: string; level: LocationLevel };
  workType: { id: Uuid; name: string; groupName: string };
  contractor?: { id: Uuid; name: string } | null;
}

export interface WorkItemFilters {
  locationId?: Uuid;
  includeDescendants?: boolean;
  workTypeId?: Uuid;
  workTypeGroupId?: Uuid;
  contractorId?: Uuid;
  status?: WorkStatus;
  reviewState?: ReviewState;
  overdueDays?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Гүйцэтгэл, шалгалт
// ---------------------------------------------------------------------------
export interface ProgressEntry {
  id: Uuid;
  workItemId: Uuid;
  completedQty: number;
  recordedAt: IsoDate;
  workersCount?: number;
  remarks?: string;
  reportedBy: { id: Uuid; name: string; role: string };
  /** Энэ мэдээлэлд хавсаргасан зураг — түүхэн жагсаалтад доор нь харагдана. */
  photos?: Photo[];
  photoCount?: number;
}

export interface CreateProgressRequest {
  completedQty: number;
  recordedAt?: IsoDate;
  workersCount?: number;
  remarks?: string;
  photoIds?: Uuid[];
}

export interface Inspection {
  id: Uuid;
  workItemId: Uuid;
  stage: InspectionStage;
  result: InspectionResult;
  acceptedQty: number;
  rejectedQty: number;
  reason?: string;
  inspectedAt: IsoDate;
  inspector: { id: Uuid; name: string };
  /** Тухайн үед бөглөсөн чанарын хуудас — баримт болно. */
  checklist?: ChecklistAnswer[];
}

export interface CreateInspectionRequest {
  stage: InspectionStage;
  result: InspectionResult;
  acceptedQty: number;
  rejectedQty?: number;
  reason?: string;
  photoIds?: Uuid[];
  /** Чанарын хуудасны хариулт — загвартай ажилд заавал. */
  checklist?: { itemId: Uuid; result: ChecklistResult; note?: string }[];
}

/** Чанарын хуудасны хариулт. `na` = энэ ажилд хамаарахгүй. */
export type ChecklistResult = "pass" | "fail" | "na";

export interface ChecklistItem {
  id: Uuid;
  sequenceNumber: number;
  text: string;
  guidance?: string | null;
  /** Заавал зүйл "тэнцээгүй" бол ажлыг батлах боломжгүй. */
  isRequired: boolean;
}

export interface ChecklistTemplate {
  id: Uuid;
  name: string;
  workTypeId?: Uuid | null;
  workTypeName?: string | null;
  groupId?: Uuid | null;
  groupName?: string | null;
  isActive: boolean;
  items: ChecklistItem[];
}

export interface ChecklistAnswer {
  itemId: Uuid;
  text?: string | null;
  result: ChecklistResult;
  note?: string | null;
}

export type PhotoType = "before" | "progress" | "after";

export interface Photo {
  id: Uuid;
  workItemId: Uuid;
  progressEntryId: Uuid | null;
  type: PhotoType;
  /** Гарын үсэгтэй, хугацаатай хаяг — `<img src>`-д шууд тавина. */
  url: string;
  takenAt: IsoDate | null;
  uploadedAt: IsoDate | null;
  uploadedBy?: string | null;
  /** Шалгалт хийгдсэний дараа түгжигдэнэ — устгах боломжгүй. */
  locked: boolean;
}

export interface Issue {
  id: Uuid;
  workItemId: Uuid;
  workItemName?: string | null;
  locationPath?: string | null;
  /** Байршлын зам барилгын нэрийг агуулдаггүй — 75 объектод зайлшгүй. */
  blockName?: string | null;
  category: IssueCategory;
  /** Серверээс ирсэн монгол нэр — шошгыг client тал давхардуулж бичихгүй. */
  categoryLabel: string;
  severity: "low" | "medium" | "high";
  status: "open" | "resolved";
  description: string;
  reportedBy?: string | null;
  createdAt: IsoDate;
  resolvedAt?: IsoDate | null;
}

/** Ажлын төрөл нэмэх/засах хүсэлт. */
export interface WorkTypeInput {
  groupId: Uuid;
  name: string;
  code?: string;
  unit: string;
  level: LocationLevel;
}

/** "Надаас юу хүлээж байна" дарааллын төрөл. */
export type QueueType = "inspection" | "returned" | "overdue";

export interface QueueCounts {
  inspection: number;
  returned: number;
  overdue: number;
}

// ---------------------------------------------------------------------------
// Нэгтгэсэн үзүүлэлт — client тал дахин бодохгүй
// ---------------------------------------------------------------------------
export type SummaryGroupBy = "floor" | "workType" | "workTypeGroup" | "contractor";

export interface SummaryGroup extends StatusCounts {
  key: string;
  label: string;
  /**
   * Энэ бүлгийг яг сэргээх шүүлтүүр. Client тал `key`-ээс шүүлтүүр таамаглах
   * ёсгүй — бүлэглэлтийн утгыг сервер эзэмшинэ. (Жишээ: давхраар бүлэглэхэд
   * блокийн үндэс зангилаа удмаа хамруулж болохгүй, харин давхар хамруулна.)
   */
  filter: WorkItemFilters;
  workItems: number;
  plannedQty: number;
  reportedQty: number;
  acceptedQty: number;
  percentage: number;
  pendingInspections: number;
  overdue: number;
  /** Бүлгийн ажлын цонх — хамгийн эрт эхлэх, хамгийн сүүл дуусах огноо. */
  plannedStartDate?: IsoDate | null;
  plannedEndDate?: IsoDate | null;
}

export interface BlockSummary {
  block: { id: Uuid; name: string };
  totals: StatusCounts & {
    workItems: number;
    plannedQty: number;
    reportedQty: number;
    acceptedQty: number;
    /** Мөрүүдийн ДУНДАЖ явц — самбар дээрхтэй ижил дүрмээр. */
    percentage: number;
    pendingInspections: number;
    overdue: number;
    plannedStartDate?: IsoDate | null;
    plannedEndDate?: IsoDate | null;
  };
  groups: SummaryGroup[];
}

/**
 * Ажлын мөрийн тоогоор илэрхийлсэн явц.
 *
 * ЯАГААД ТОО ХЭМЖЭЭ БИШ ВЭ: м², м³, ширхгийг нэмэх нь утгагүй. «306,970
 * эхлээгүй» гэсэн тоо ЮУ 306,970 болохыг хэлж чадахгүй. Ажлын тоо нь нэгжгүй
 * тул нэмэгдэж болно.
 *
 * Гурав нь харилцан үл огтлолцоно: completed + inProgress + notStarted = total.
 */
export interface StatusCounts {
  completedItems: number;
  inProgressItems: number;
  notStartedItems: number;
}

export interface ItemCounts extends StatusCounts {
  totalItems: number;
}

export interface DashboardBlock extends ItemCounts {
  id: Uuid;
  name: string;
  /** Дууссан ажлын эзлэх хувь. */
  percentage: number;
  plannedQty: number;
  reportedQty: number;
  acceptedQty: number;
  pendingInspections: number;
  overdue: number;
}

export interface ProjectDashboard extends ItemCounts {
  /** Дууссан ажлын эзлэх хувь — ажлын ТООгоор. */
  percentage: number;
  plannedQty: number;
  reportedQty: number;
  acceptedQty: number;
  blocks: DashboardBlock[];
  pendingInspections: number;
  overdueWorkItems: number;
  openIssues: number;
  /** Нээлттэй асуудал ангиллаар — олноос цөөн рүү. */
  issuesByCategory: { category: IssueCategory; categoryLabel: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Тайлан
// ---------------------------------------------------------------------------
/** Актын нэг мөр — нэг шалгалтад батлагдсан хэмжээ. */
export interface AcceptanceRow {
  inspectionId: Uuid;
  workItemId: Uuid;
  blockName: string;
  locationPath: string;
  workTypeName: string;
  unit: string;
  acceptedQty: number;
  inspectedAt: IsoDate;
  inspectorName?: string | null;
}

/**
 * Нэгжийн дүн.
 *
 * м² ба м³-ийг нэг тоо болгож нэмэх нь утгагүй тул дүн нь НЭГЖ ТУС БҮРЭЭР
 * гарна — нэг «нийт» тоо байхгүй.
 */
export interface UnitTotal {
  unit: string;
  qty: number;
}

export interface AcceptanceGroup {
  name: string;
  rows: AcceptanceRow[];
  totals: UnitTotal[];
}

export interface AcceptanceReport {
  contractor: { id: Uuid; name: string } | null;
  project: { id: Uuid; name: string };
  period: { from: IsoDate; to: IsoDate };
  stage: InspectionStage;
  groups: AcceptanceGroup[];
  totals: UnitTotal[];
  workItemCount: number;
  inspectionCount: number;
}
