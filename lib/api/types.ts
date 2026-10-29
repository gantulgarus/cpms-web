/**
 * CPMS API — типүүд.
 *
 * `docs/api-endpoints.md`-д тодорхойлсон гэрээг тусгана. Ажлын төрөл
 * (WorkType) ба байршил (Location) тусдаа, тэдний огтлолцол нь WorkItem.
 * Гүйцэтгэл нь хувь биш тоо хэмжээгээр хөтлөгдөнө.
 */

export type Uuid = string;
/** `YYYY-MM-DD` эсвэл ISO date-time. */
export type IsoDate = string;

export type WorkStatus = "not_started" | "in_progress" | "completed" | "on_hold" | "cancelled";
/**
 * Хяналтын төлөв — ХЭН рүү бөмбөг байгааг хэлнэ.
 *
 * Хоёр шаттай каскад тул хүлээлт ба буцаалт ХОЁР ТУС БҮР байна:
 * «талбайн инженер зураасаа засуулахаар буцаасан» ба «хяналтын инженер
 * даац хүрэхгүй гэж буцаасан» хоёр нь гүйцэтгэгчийн хувьд тэс өөр ажил.
 */
export type ReviewState =
  | "none"
  | "pending_check"
  | "pending_approval"
  | "returned_by_site"
  | "returned_by_final"
  | "approved";

/** Ажлын төрөл ямар байршлын түвшинд хянагдахыг заана. */
export type LocationLevel = "block" | "entrance" | "floor" | "unit" | "room" | "common";

/** Шалгалтын шат — эхлээд гүйцэтгэгчийн, дараа нь захиалагчийн хяналт. */
/**
 * Шалгалтын шат.
 *
 * `site_check` — талбайн инженер шалгана, тоог засаж болно.
 * `final_approval` — хяналтын инженер батална. ЗӨВХӨН энэ шат актад орно.
 */
export type InspectionStage = "site_check" | "final_approval";
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
  /**
   * Төсвийн файлтай холбох ТҮЛХҮҮР.
   *
   * Импорт нь ажлыг НЭРЭЭР биш кодоор таньдаг: төсөвт «Блокон хана»,
   * лавлахад «блокон өрлөг» гэж бичигдсэн байдаг. Код хоосон бол тэр
   * төрөл рүү импортоор ажил үүсэхгүй — зөвхөн гараар нэмнэ.
   */
  code?: string | null;
  /** Нэг код олон ажилд хуваагдах үеийн ялгах шинж («Айлын тагт»). */
  codePart?: string | null;
  unit: string;
  /** Энэ төрлийн ажил ямар түвшинд үүсэхийг заана. */
  level: LocationLevel;
  /**
   * Шалгалтын цэг — далд хийгдэх ажил.
   *
   * Батлагдахаас өмнө дараагийн ажлын гүйцэтгэл бүртгэгдэхгүй: бетон
   * цутгасны дараа доторх арматурыг хэн ч шалгаж чадахгүй.
   */
  isHoldPoint?: boolean;
}

export type ContractorStatus = "active" | "suspended" | "terminated";

export interface Contractor {
  id: Uuid;
  name: string;
  companyName?: string | null;
  /** РД — 7 орон, давхардахгүй. Гүйцэтгэгчийг таних цорын гагц тэмдэг. */
  registrationNo?: string | null;
  tradeSpecialty?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
  status?: ContractorStatus;
  statusLabel?: string;
  /** Гэрээ цуцлагдсан гүйцэтгэгчид шинэ ажил оноогдохгүй. */
  canTakeWork?: boolean;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;

  /** Зөвхөн гүйцэтгэгч удирдах эрхтэй хэрэглэгчид ирнэ. */
  bankName?: string | null;
  bankAccount?: string | null;
  accessCode?: string | null;
  accessCodeExpiresAt?: string | null;
  hasValidAccessCode?: boolean;

  /**
   * Тохиролцоо бичихэд дутуу талбарууд.
   *
   * Дэлгэц дээр УРЬДЧИЛЖ харуулна: гэрээний мэргэжилтэн хуудас хэвлэх гэж
   * байж «РД байхгүй» гэдгийг мэдэх нь оройтсон.
   */
  missingContractFields?: string[];
}

/** Системийн хэрэглэгч — админы дэлгэцэд. */
export interface ManagedUser {
  id: number | string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  /** Албан тушаал — системийн үүргээс тусдаа. Жишээ: «Гэрээний мэргэжилтэн». */
  position?: string | null;
  /** Алба нэгж. */
  unit?: string | null;
  scopeBlockIds: Uuid[];
  contractorId: Uuid | null;
  contractorName?: string | null;
  isActive: boolean;
  canReportProgress: boolean;
  canInspect: boolean;
  /** 1-р шат хийх эрх — `canInspect`-ээс өргөн. */
  canCheck?: boolean;
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
  /**
   * Блокийн нэр — зөвхөн `block` ачаалагдсан үед ирнэ (дараалал, тайлан).
   *
   * Олон блокийн ажил нэг жагсаалтад холилдоход аль барилгынх вэ гэдэг нь
   * харцаар ялгагдах ёстой. `blockId` нь UUID тул хүнд юу ч хэлэхгүй.
   */
  blockName?: string | null;
  locationId: Uuid;
  workTypeId: Uuid;
  name: string;
  unit: string;

  plannedQty: number;
  /** Гүйцэтгэгчийн мэдээлсэн нийлбэр. */
  reportedQty: number;
  /**
   * 1-р шатаар шалгагдсан хэмжээ — мэдээлсэн ба баталсан хоёрын ХООРОНД.
   *
   * Үүнгүйгээр дэлгэц дээр «40 мэдээлсэн, 10 баталсан» гэж хоёр тоо
   * харагдаад, дунд нь 30 хаана байгаа нь ойлгомжгүй болно.
   */
  checkedQty: number;
  /**
   * Төсвийн нэгж үнэ — «Ажлын хөлсний төсөв»-ийн AD багана.
   *
   * Системд мөнгө орох цорын гагц эх сурвалж. Тохиролцооны үнэтэй
   * харьцуулахад хэрэглэгдэнэ.
   */
  budgetUnitPrice?: number | null;
  /** Хяналтын инженерийн баталсан нийлбэр — үлдэгдэл үүнээс бодогдоно. */
  acceptedQty: number;
  remainingQty: number;
  percentage: number;

  plannedStartDate?: IsoDate;
  plannedEndDate?: IsoDate;
  status: WorkStatus;
  reviewState: ReviewState;
  /** Ажлын төрөл хэдэн шаттай вэ — 1 бол талбайн шалгалт алгасна. */
  inspectionStages?: number;
  /** Дараагийн үйлдэл ямар шатад байна. `null` = хүлээх юм алга. */
  nextStage?: InspectionStage | null;
  /** Тэр шатаар дамжуулж болох хэмжээ — дэлгэц дахин бодохгүй. */
  stagePool?: number;
  /**
   * Шалгалтын цэгийн хориг — `null` бол замгүй.
   *
   * Зөвхөн ДЭЛГЭРЭНГҮЙ хуудсанд ирнэ: жагсаалтад мөр тутамд нэмэлт
   * query явуулахгүйн тулд сервер зориуд бодохгүй.
   */
  holdPointReason?: string | null;
  /** 1-р шатны хариуцагч ба тухайн ажлыг шалгах эрх; дэлгэрэнгүйд сервер өгнө. */
  siteEngineer?: { id: number | string; name: string; position: string | null } | null;
  canCheckThisWorkItem?: boolean;

  /**
   * ҮНДСЭН төлөвлөгөө — сунгалтаар ХӨДӨЛДӨГГҮЙ.
   *
   * `overdueDays` нь өнөөдрийн амлалтаас хоцорсон эсэхийг хэлнэ: сунгалт
   * батлагдах бүрд тэг болно. Дангаараа авбал «хэн ч хэзээ ч хоцроогүй»
   * гэсэн зураг гарна.
   */
  baselineEndDate?: string | null;
  baselineOverdueDays?: number;
  /** Батлагдсан сунгалтаар нийт хэдэн хоног хойшилсон. */
  extendedDays?: number;
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

  /**
   * Хяналт шалгалтыг хариуцах инженер — төсвөөс оноогддог.
   *
   * `position` нь ижил үүрэгтэй хүмүүсийг ялгах гол мэдээлэл:
   * дөрвөн хяналтын инженер бүгд `inspector` үүрэгтэй.
   */
  inspector?: { id: number | string; name: string; position: string | null } | null;
}

export type AgreementStatus = "draft" | "active" | "completed" | "cancelled";

/**
 * Ажил гүйцэтгэх тохиролцооны хуудас.
 *
 * МӨНГӨ системд эндээс орно: акт нь тохиролцооны нэгж үнэ дээр тогтоно.
 * Бүх ДҮН нь серверээс ирнэ — дэлгэц тоо × үнэ гэж дахин бодвол
 * бөөрөнхийлөл зөрч, нийт дүн мөрүүдийн нийлбэртэй таарахаа болино.
 */
export interface AgreementLine {
  id?: Uuid;
  workTypeId: Uuid;
  label?: string | null;
  unit: string;
  quantity: number;
  /** Хэлэлцээрийн үнэ — төсвийнхөөс ӨӨР байж болно. */
  unitPrice: number;
  /** Төсвийн үнэ — гэрээ бичих үед хөшөөлсөн. */
  budgetUnitPrice?: number | null;
  amount?: number;
  budgetAmount?: number;
  isExtra?: boolean;
}

/** Төсвөөс татсан, хараахан хадгалагдаагүй мөр. */
export interface AgreementDraftLine {
  workTypeId: Uuid;
  label: string;
  groupName?: string | null;
  unit: string;
  quantity: number;
  budgetUnitPrice: number | null;
  /** Төсөвт тэр төрөл хоёр өөр үнэтэй байсан — шалгах шаардлагатай. */
  priceConflict: boolean;
}

export interface Agreement {
  id: Uuid;
  number: string;
  blockId: Uuid;
  blockName?: string;
  contractorId: Uuid;
  contractorName?: string;
  contractorRegistrationNo?: string | null;
  scope?: string | null;

  startDate?: string | null;
  endDate?: string | null;

  retentionPercent: number;
  barterPercent: number;
  cashPercent: number;
  barterAmount?: number | null;
  barterNote?: string | null;

  warrantyYears: number;
  maintenanceMonths: number;
  workDaysPerWeek?: number | null;
  restDay?: string | null;
  headcount?: number | null;

  status: AgreementStatus;
  statusLabel: string;
  /** Батлагдсаны дараа мөр түгжигдэнэ — акт эдгээр үнэ дээр тогтдог. */
  isEditable: boolean;

  totalAmount?: number;
  budgetAmount?: number;
  /** Эерэг = төсвөөс ДЭЭШ гэрээлсэн. */
  variancePercent?: number | null;
  retentionAmount?: number;

  createdBy?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;

  lines?: AgreementLine[];
}

export type ExtensionStatus = "pending" | "approved" | "rejected";

/**
 * Хугацаа сунгах хүсэлт.
 *
 * Сунгалт нь ШУУД үйлдэл байхаа больсон: баримт болж, хэн хэзээ шийдсэн
 * нь хамт хадгалагдана. Батлах эрх нь ерөнхий инженер, захиралд.
 */
export interface ExtensionRequest {
  id: Uuid;
  workItemId: Uuid;
  workItemName?: string;
  locationPath?: string | null;
  currentEndDate: string | null;
  requestedEndDate: string;
  /** Хоногийг СЕРВЕР бодно — дэлгэц хоёр огноог хасахгүй. */
  requestedDays: number;
  category: IssueCategory;
  reason: string;
  status: ExtensionStatus;
  requestedBy?: { id: number | string; name: string } | null;
  decidedBy?: { id: number | string; name: string } | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt?: string;
}

export interface WorkItemFilters {
  locationId?: Uuid;
  includeDescendants?: boolean;
  workTypeId?: Uuid;
  workTypeGroupId?: Uuid;
  contractorId?: Uuid;
  /** `none` = инженер оноогдоогүй · `me` = өөрийн хянах ажил. */
  inspectorId?: number | string;
  status?: WorkStatus;
  /** Нэг төлөв, эсвэл `pending` / `returned` гэсэн БҮЛЭГ. */
  reviewState?: ReviewState | "pending" | "returned";
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
  /** Шатны нэрийг СЕРВЭР өгнө — дэлгэц хоёр газар бичихгүй. */
  stageLabel?: string;
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
  /** Хоосон мөр илгээвэл сервер кодыг АРИЛГАНА. */
  code?: string | null;
  codePart?: string | null;
  unit: string;
  level: LocationLevel;
}

/** "Надаас юу хүлээж байна" дарааллын төрөл. */
export type QueueType = "inspection" | "check" | "approval" | "returned" | "overdue";

export interface QueueCounts {
  inspection: number;
  /** 1-р шат — талбайн инженер шалгахыг хүлээж буй. */
  check: number;
  /** 2-р шат — хяналтын инженер батлахыг хүлээж буй. */
  approval: number;
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
  /**
   * Тоо хэмжээ нь бүртгэгдээгүй ажлын тоо.
   *
   * `notStartedItems`-ийн ДОТОР байна — тусдаа бүлэг биш, харин «яагаад
   * эхлээгүй вэ» гэсэн асуултын хариулт. Гүйцэтгэл оруулах боломжгүй тул
   * хувийн бодолтод ч ороогүй: «0% хийгдсэн» биш, «хэмжих боломжгүй».
   */
  unmeasuredItems: number;
  /**
   * Хариуцагч оноогоогүй ажлын тоо.
   *
   * Туслан гүйцэтгэгч эдгээрийг ХАРАХГҮЙ — хамрах хүрээ нь `contractorId`-аар
   * шүүдэг тул «хэнийх ч биш» ажил хэнд ч харагдахгүй. Оноохоо мартвал тэр
   * компани нэвтрээд хоосон дэлгэц харна.
   */
  unassignedItems: number;
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

// ---------------------------------------------------------------------------
// Төсвийн импорт
// ---------------------------------------------------------------------------

/** `quantities` = ажлын хөлсний төсөв, `materials` = материалын төсөв. */
export type BudgetImportType = "quantities" | "materials";

export type BudgetImportStatus = "pending" | "applied" | "discarded";

/** Байршуулсан файлын бүртгэл — түүх, хэн хэзээ оруулсан. */
export interface BudgetImport {
  id: Uuid;
  blockId: Uuid;
  /** Таслалаар: `quantities`, `materials`, эсвэл `quantities,materials`. */
  type: string;
  /**
   * Файлд байсан төсвүүд.
   *
   * НЭГ ФАЙЛД ХОЁУЛАА байж болно — захиалагчийн 29 хуудастай файлын
   * хоёр нь яг тэр. Тиймээс массив.
   */
  types: BudgetImportType[];
  typeLabel: string;
  originalName: string;
  sizeBytes: number;
  status: BudgetImportStatus;
  statusLabel: string;
  summary: ImportSummary | null;
  uploadedBy: string | null;
  appliedBy: string | null;
  appliedAt: IsoDate | null;
  createdAt: IsoDate | null;
}

export interface ImportSummary {
  /** Файлаас уншсан мөр — ажлын/материалын мөр, толгой орохгүй. */
  sourceRows: number;
  /** Оруулахаар бэлтгэгдсэн мөр. */
  planned: number;
  /** ТАТГАЛЗСАН мөр — чимээгүй алгасаагүй, бүгд `errors`-т жагсагдсан. */
  rejected: number;
  /** «нийт» зэрэг дэд дүнгийн мөр — алдаа биш. */
  skipped: number;
  /** Импортоос ӨМНӨ блокт байсан мөр. */
  existing: number;
}

export interface ImportStatRow {
  label: string;
  value: number | null;
  format: "money" | "percent" | "count";
  tone?: "green" | "amber" | "red" | "gray";
  note?: string;
}

export interface ImportSection {
  title: string;
  rows: ImportStatRow[];
}

/**
 * Анхааруулга.
 *
 * `danger` нь эргэж буцахгүй алдагдлыг л хэлнэ (гүйцэтгэл устах) —
 * бусад тохиолдолд хэт их улаан өнгө нь жинхэнэ аюулыг нуудаг.
 */
export interface ImportWarning {
  level: "danger" | "warn" | "info";
  title: string;
  items: string[];
}

export interface ImportError {
  row: number;
  code: string;
  name: string;
  reason: string;
}

/**
 * Ажлын төсөв бичих ГОРИМ.
 *
 * `replace` — бүгдийг солино, ГҮЙЦЭТГЭЛ УСТАНА (анхдагч)
 * `update`  — тоо хэмжээ, үнэ, инженер солигдоно, явц ҮЛДЭНЭ
 *
 * Материалын төсөвт хамаарахгүй: тэнд гүйцэтгэл гэж байхгүй.
 */
export type ImportMode = "replace" | "update";

/** Төсвийн шинэ тоо нь мэдээлсэн хэмжээнээс БАГА болсон ажил. */
export interface ImportConflict {
  name: string;
  location: string | null;
  reportedQty: number;
  newPlannedQty: number;
  unit: string;
}

/** Бичилтийн үр дүн — зөвхөн батласны дараа. */
export interface ImportResult {
  materialsCreated?: number;
  materialsUpdated?: number;
  items: number;
  quantities?: number;
  withoutQuantity?: number;
  pruned?: number;
  created?: number;
  updated?: number;
  /** Тоо хэмжээ нь ШИНЭЧЛЭГДЭЭГҮЙ ажлууд — хүн гараар шийднэ. */
  conflicts?: ImportConflict[];
}

/**
 * Урьдчилан харах тайлан.
 *
 * `plan` ЭНД БАЙХГҮЙ: 3,000 мөрийг хөтөч рүү илгээх нь утгагүй. Сервер
 * түүнийг өөртөө хадгалж, батлах үед файлаас дахин задална.
 */
export interface ImportReport {
  type: BudgetImportType;
  typeLabel: string;
  sheet: string;
  blockId: Uuid;
  blockName: string;
  canApply: boolean;
  summary: ImportSummary;
  sections: ImportSection[];
  warnings: ImportWarning[];
  errors: ImportError[];
  errorsByReason: { reason: string; count: number }[];
  result?: ImportResult;
}

/**
 * Серверийн хариу.
 *
 * `reports` нь МАССИВ: нэг файлд хоёр төсөв байж болно. Дараалал нь
 * бичих дараалал — ажлын төсөв эхэлнэ, материал нь түүн дээр холбогдоно.
 */
export interface ImportEnvelope {
  data: BudgetImport;
  reports: ImportReport[];
}

// ---------------------------------------------------------------------------
// Бетон зуурмагийн захиалга
// ---------------------------------------------------------------------------

export type ConcreteOrderStatus =
  | "draft"
  | "submitted"
  | "confirmed"
  | "delivered"
  | "cancelled";

export interface ConcreteOrder {
  id: Uuid;
  number: string;
  blockId: Uuid;
  blockName: string | null;
  locationId: Uuid;
  locationName: string | null;
  materialId: Uuid;
  materialName: string | null;
  grade: string | null;
  concreteClass: string | null;
  slumpCm: number | null;
  structure: string;

  pourDate: IsoDate;
  /** `am` = үдээс өмнө, `pm` = үдээс хойш. */
  pourHalf: "am" | "pm" | null;
  pourTime: string | null;

  quantity: number;
  needsPump: boolean;
  /** Бодит ирсэн хэмжээ — машин 7 м³-аар ирдэг тул захиалгаас зөрнө. */
  deliveredQty: number | null;
  deliveredAt: IsoDate | null;

  status: ConcreteOrderStatus;
  statusLabel: string;
  isEditable: boolean;

  /** 3 хоногийн хугацаанаас хожуу захиалга — хориглоогүй, тэмдэглэсэн. */
  isRush: boolean;

  /** Тухайн байршил × маркийн төсөв. */
  budgetQty: number;
  /** Энэ захиалгыг ОРУУЛААГҮЙ, өмнө нь захиалсан хэмжээ. */
  orderedQty: number;
  /** Энэ захиалгын ДАРААХ үлдэгдэл. Сөрөг = хэтэрсэн. */
  remainingQty: number;
  /** Хэдэн м³-ээр хэтэрсэн. 0 = хэтрээгүй. */
  overBy: number;

  requestedBy: string | null;
  receivedBy: string | null;
  confirmedBy: string | null;
  submittedAt: IsoDate | null;
  confirmedAt: IsoDate | null;
  notes: string | null;
  createdAt: IsoDate | null;
}

/** Блокийн байршил × марк бүрийн төсвийн үлдэгдэл. */
export interface ConcreteBalanceRow {
  locationId: Uuid;
  locationName: string;
  sequence: number;
  materialId: Uuid;
  materialName: string;
  grade: string | null;
  unit: string;
  budget: number;
  ordered: number;
  remaining: number;
  overBy: number;
}

// ---------------------------------------------------------------------------
// Материалын захиалга (үндсэн, туслах, модон, арматур)
// ---------------------------------------------------------------------------

/** Захиалагчийн дөрвөн бланк — зөвхөн хэвлэх загвар, шүүлтэд нөлөөлнө. */
export type MaterialOrderKind = "main" | "aux" | "timber" | "rebar";

export type MaterialOrderStatus = ConcreteOrderStatus;

export interface MaterialOrderLine {
  id: Uuid;
  /** Лавлахгүй мөр байж болно — бланкны зарим мөр төсөвт байдаггүй. */
  materialId: Uuid | null;
  name: string;
  unit: string;
  /** «Агуулах үлдэгдэл» — систем хөтөлдөггүй, гараар бичигдэнэ. */
  stockQty: number | null;
  quantity: number;
  /** Баталгаажуулагчийн тогтоосон тоо — захиалсанаас зөрж болно. */
  approvedQty: number | null;
  deliveredQty: number | null;
  unitWeightKg: number | null;
  totalWeightKg: number | null;
  note: string | null;

  /** Төсөвгүй (гараар бичсэн) мөрөнд `null`. */
  budgetQty: number | null;
  orderedQty: number | null;
  remainingQty: number | null;
  overBy: number;
}

export interface MaterialOrder {
  id: Uuid;
  number: string;
  blockId: Uuid;
  blockName: string | null;
  kind: MaterialOrderKind;
  kindLabel: string;
  isRebar: boolean;
  locationId: Uuid | null;
  locationName: string | null;
  neededBy: IsoDate | null;
  status: MaterialOrderStatus;
  statusLabel: string;
  isEditable: boolean;
  lineCount: number;
  /** Төсвөөс хэтэрсэн мөрийн тоо — жагсаалтад шууд харуулна. */
  overLineCount: number;
  lines: MaterialOrderLine[];
  requestedBy: string | null;
  receivedBy: string | null;
  confirmedBy: string | null;
  submittedAt: IsoDate | null;
  confirmedAt: IsoDate | null;
  notes: string | null;
  createdAt: IsoDate | null;
}

/** Блокийн материал бүрийн үлдэгдэл — бетоноос бусад. */
export interface MaterialBalanceRow {
  materialId: Uuid;
  code: string | null;
  name: string;
  unit: string;
  budget: number;
  ordered: number;
  remaining: number;
  overBy: number;
}

/** Блок устгахад юу алга болохыг урьдчилан тоолсон дүн. */
export interface BlockDeletionImpact {
  blockName: string;
  locations: number;
  workItems: number;
  progressEntries: number;
  inspections: number;
  photos: number;
  agreements: number;
  concreteOrders: number;
  materialOrders: number;
  budgetImports: number;
  /** АКТАД орсон байж болзошгүй — хамгийн чухал тоо. */
  acceptedInspections: number;
}

// ---------------------------------------------------------------------------
// Блокийн ерөнхий тайлан
// ---------------------------------------------------------------------------

export interface BlockReport {
  block: {
    id: Uuid;
    name: string;
    buildingNo: string;
    purpose: string;
    floors: number;
    unitsPerFloor: number;
    startDate: IsoDate | null;
    projectName: string | null;
    companyName: string | null;
  };
  generatedAt: IsoDate;

  progress: {
    workItems: number;
    completed: number;
    unmeasured: number;
    pending: number;
    returned: number;
    /** МӨРИЙН дунджаар — тоо хэмжээгээр бол м² ба м³ нийлнэ. */
    percentage: number;
  };

  byGroup: { name: string; items: number; completed: number; percentage: number }[];

  /** ГУРВАН ҮНЭ: төсөв (жишиг) → гэрээ (амлалт) → акт (бодит төлбөр). */
  money: {
    budgetAmount: number;
    withoutBudgetPrice: number;
    agreementCount: number;
    agreedAmount: number;
    acceptedAmount: number;
    /** Суурь нь 0 бол `null` — тэгд хуваахгүй. */
    agreedVariancePercent: number | null;
    acceptedVariancePercent: number | null;
  };

  schedule: {
    plannedStart: IsoDate | null;
    plannedEnd: IsoDate | null;
    /** Анхны амлалт — сунгалтын дараа ч ХӨДӨЛДӨГГҮЙ. */
    baselineEnd: IsoDate | null;
    slippageDays: number | null;
    /** СУНГАГДСАН МӨРИЙН тоо — нийт хоног биш (нэмэх нь утгагүй). */
    extendedItems: number;
    overdueItems: number;
  };

  quality: {
    inspections: number;
    rejected: number;
    partial: number;
    /** Шалгалтгүй бол `null` — 0% гэж худал хэлэхгүй. */
    rejectionRate: number | null;
    openIssues: number;
    resolvedIssues: number;
  };

  materials: {
    budgetedItems: number;
    actualAmount: number;
    marketAmount: number;
    marketVariancePercent: number | null;
    concreteOrders: number;
    materialOrders: number;
    concreteDelivered: number;
  };
}

// ---------------------------------------------------------------------------
// Блокт ОРСОН төсөв
// ---------------------------------------------------------------------------

/** Ажлын хөлсний төсөв — ажлын ТӨРЛӨӨР нэгтгэсэн. */
export interface BudgetWorkRow {
  workTypeId: Uuid;
  code: string | null;
  name: string;
  groupName: string;
  level: string;
  unit: string;
  /** Энэ төрлөөр хэдэн ажил үүссэн (давхар, айлаар). */
  works: number;
  plannedQty: number;
  acceptedQty: number;
  unitPrice: number | null;
  amount: number;
  /** Нэг төрөлд хоёр өөр үнэ орсон — төсөв дээр гарах ёсгүй зүйл. */
  priceConflict: boolean;
  worksWithoutPrice: number;
}

/** Материалын төсөв — байршлын задаргаатай. */
export interface BudgetMaterialRow {
  id: Uuid;
  code: string | null;
  name: string | null;
  grade: string | null;
  unit: string | null;
  workLabel: string | null;
  workTypeName: string | null;
  totalQty: number;
  actualUnitPrice: number | null;
  marketUnitPrice: number | null;
  actualAmount: number | null;
  marketAmount: number | null;
  variancePercent: number | null;
  locations: { name: string; qty: number }[];
}

export interface BlockBudget {
  work: BudgetWorkRow[];
  materials: BudgetMaterialRow[];
}

/** Server-computed reporting eligibility; never inferred from reviewState alone. */
export type ReportingState = "ready" | "blocked" | "pending" | "completed";
export interface MyWorkItem extends WorkItem {
  reportingState: ReportingState;
  reportableQty: number;
  reportingReason: string | null;
  blockingWorkItems: { id: Uuid; name: string; locationPath: string }[];
}
export interface MyWorkEnvelope extends ListEnvelope<MyWorkItem> {
  counts: Record<ReportingState, number>;
}

export interface SiteEngineerAssignmentSummary {
  groups: {
    groupId: Uuid;
    groupName: string;
    workItems: number;
    pendingCheck: number;
    siteEngineer: { id: number | string; name: string; position: string | null } | null;
    needsAssignment: boolean;
  }[];
  engineers: { id: number | string; name: string; position: string | null }[];
}
