/**
 * Mock өгөгдлийн сан — v2 гэрээний дагуу.
 *
 * `work-types.json` (Хавсралт-2-оос гаргасан 47 ажлын төрөл) дээр тулгуурлан
 * бодит хэмжээний блокуудыг үүсгэнэ. Анхны блок нь 17 давхар, 144 айл,
 * ~3,290 WorkItem — UI-г ЖИНХЭНЭ хэмжээнд шалгахад зориулав. 5 мөртэй mock
 * дээр бүх зүйл сайхан харагддаг; v1-ийг унагасан асуудлууд яг энэ хэмжээнд
 * илэрдэг.
 *
 * Санамсаргүй утга бүр seed-тэй (mulberry32) тул дахин ачаалахад өгөгдөл
 * өөрчлөгдөхгүй. Явцын бичлэг, шалгалтыг урьдчилж хадгалахгүй — шаардсан үед
 * WorkItem-ийн seed-ээс дахин үүсгэнэ.
 */
import rawWorkTypes from "./work-types.json";
import type {
  Block,
  BlockDesign,
  Contractor,
  Inspection,
  Job,
  Location,
  LocationLevel,
  Photo,
  ProgressEntry,
  ReviewState,
  WorkItem,
  WorkStatus,
  WorkType,
  WorkTypeGroup,
} from "@/lib/api/v2/types";

interface RawWorkType {
  no: number;
  group: string;
  name: string;
  unit: string;
  level: string;
  plannedQty: number;
  estimated: boolean;
}

const PROJECT_ID = "prj-inel-01";
const SEED_BLOCK_ID = "blk-a-01";
const PROJECT_START = "2026-03-01";
const UNIT_NAMES = ["А1", "А2", "B1", "B2", "C", "D1", "D2", "E1", "E2"];

/**
 * Явцын фронт — төсөл хаана явж байгааг заана (`order * 12 + давхар` нэгжээр).
 * Жижиг утга = барилга дөнгөж эхэлсэн, том утга = дуусах шатандаа.
 */
const PROGRESS_FRONT = 72;
/** Фронтын өргөн — энэ зурваст байгаа ажил хэсэгчлэн хийгдсэн байна. */
const PROGRESS_BAND = 22;

/** Детерминист PRNG — ижил seed → ижил дараалал. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Ажлын өдрөөр урагшлуулах — бямба, ням алгасна.
 *
 * Backend-ийн `TaktSchedule` мөн `addWeekdays` хэрэглэдэг. Зөрвөл дэлгэц
 * mock дээр өөр огноо, серверт өөр огноо харуулна.
 */
function addWeekdays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  let left = days;

  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--;
  }
  // Эхлэл нь амралтын өдөр байвал дараагийн ажлын өдөр рүү шилжинэ.
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }

  return d.toISOString().slice(0, 10);
}

/**
 * Хугацааны цонх — backend-ийн `TaktSchedule::window()`-тэй ЯГ ижил томьёо.
 *
 *   эхлэх  = эхлэл + (багийн дараалал + давхар) × давхрын хугацаа  [ажлын өдөр]
 *   дуусах = эхлэх + давхрын хугацаа − 1
 *
 * Барилгын түвшний ажил давхраар давтагдахгүй тул багийн бүх зурвасыг эзэлнэ.
 */
export function taktWindow(
  startDate: string,
  taktDays: number,
  floors: number,
  level: string,
  floorNo: number,
  order: number,
): { plannedStartDate: string; plannedEndDate: string } {
  const duration =
    level === "block" ? taktDays * Math.max(floors, 1) : taktDays;
  const offset = (Math.max(order, 0) + Math.max(floorNo, 0)) * taktDays;
  const plannedStartDate = addWeekdays(startDate, offset);

  return {
    plannedStartDate,
    plannedEndDate: addWeekdays(plannedStartDate, Math.max(duration - 1, 0)),
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Тоо хэмжээг МЯНГАТЫН орон хүртэл — backend-ийн `round(\$x, 3)`-тай ижил.
 *
 * Урьд нь энд 2 орон байсан: mock 12.35 гэж хадгалахад жинхэнэ сервер
 * 12.347 гэж хадгалдаг байв. Дэлгэц mock дээр "ажиллаад" бодит дээр
 * өөр тоо харуулна — mock-ийн ач холбогдол тэр дор нь үгүй болно.
 */
const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Давхардахгүй mock id.
 *
 * `Date.now()` ганцаараа хангалтгүй: нэг миллисекундэд хоёр блок үүсгэвэл
 * ИЖИЛ id гарч, React-ийн `key` давхардаж, самбар дээр блокууд хоорондоо
 * холилдоно. Тоолуур нэмж баталгаажуулна.
 */
let idCounter = 0;
export function mockId(prefix: string): string {
  idCounter += 1;

  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Мастер өгөгдөл
// ---------------------------------------------------------------------------
/** Нэвтрэх кодын дуусах хугацаа — тогтмол, эс бөгөөс өдөр бүр өөр утга гарна. */
const ACCESS_CODE_EXPIRES = "2027-08-17";

/**
 * Гүйцэтгэгчид — backend-ийн `DemoSeeder::createContractors`-тэй ИЖИЛ.
 *
 * Код нь ЗУРГААУЛАНД нь байна. Урьд нь зөвхөн `GOO-2026` байсан тул mock дээр
 * гүйцэтгэгчийн дэлгэц ганцхан компаниар л шалгагдаж, хүснэгтийн бусад мөр
 * кодгүй харагддаг байв — жинхэнэ сервер дээр бүгд кодтой байхад mock худлаа
 * хэлж байсан хэрэг.
 */
const CONTRACTORS: Contractor[] = (
  [
    ["ctr-1", "Түшиг Констракшн", "Бетон, угсралт", "9911-2233", "TSH-2026"],
    ["ctr-2", "Мөнх Хишиг ХХК", "Өрлөг, шавардлага", "9922-3344", "MNH-2026"],
    ["ctr-3", "Сүлд Фасад", "Фасад, цонх", "9933-4455", "SLD-2026"],
    [
      "ctr-4",
      "Эрчим Инженеринг",
      "Цахилгаан, сантехник",
      "9944-5566",
      "ERH-2026",
    ],
    ["ctr-5", "Гоо Засал ХХК", "Дотор засал", "9955-6677", "GOO-2026"],
    ["ctr-6", "Ногоон Тохижилт", "Гадна ажил", "9966-7788", "NGN-2026"],
  ] as const
).map(([id, name, tradeSpecialty, phone, accessCode]) => ({
  id,
  name,
  tradeSpecialty,
  phone,
  accessCode,
  accessCodeExpiresAt: ACCESS_CODE_EXPIRES,
  hasValidAccessCode: true,
}));

/** Ажлын бүлэг → гүйцэтгэгч. Оноогдоогүй бүлэг null болно. */
const GROUP_CONTRACTOR: Record<string, string | null> = {
  "Газар шороо": "ctr-1",
  Угсралт: "ctr-1",
  Дээвэр: "ctr-1",
  Өрлөг: "ctr-2",
  Засал: "ctr-2",
  Фасад: "ctr-3",
  Цонх: "ctr-3",
  цахилгаан: "ctr-4",
  сантехник: "ctr-4",
  ХАС: "ctr-4",
  шал: "ctr-5",
  чулуу: "ctr-5",
  "гипсэн хана": "ctr-5",
  хаалга: "ctr-5",
  "Гадна ажил": "ctr-6",
};

/** Барилгын дараалал — эрт эхэлдэг бүлэг илүү дууссан байна. */
const GROUP_ORDER: Record<string, number> = {
  "Газар шороо": 0,
  Угсралт: 1,
  Дээвэр: 2,
  Өрлөг: 3,
  Цонх: 4,
  Фасад: 5,
  цахилгаан: 5,
  сантехник: 5,
  ХАС: 6,
  "гипсэн хана": 6,
  Засал: 7,
  шал: 8,
  чулуу: 8,
  хаалга: 9,
  "Гадна ажил": 9,
};

// ---------------------------------------------------------------------------
// Загварууд — захиалагчийн 9 стандарт зураг төслийн дүрслэл
// ---------------------------------------------------------------------------
interface DesignSpec {
  id: string;
  name: string;
  purpose: string;
  floors: number;
  unitsPerFloor: number;
  /** Хоосон бол бүх ажлын төрөл орно. */
  excludeLevels?: LocationLevel[];
}

const DESIGN_SPECS: DesignSpec[] = [
  {
    id: "dsg-16-9",
    name: "16 давхар орон сууц · 9 айл",
    purpose: "Орон сууцны бүс",
    floors: 16,
    unitsPerFloor: 9,
  },
  {
    id: "dsg-12-6",
    name: "12 давхар орон сууц · 6 айл",
    purpose: "Орон сууцны бүс",
    floors: 12,
    unitsPerFloor: 6,
  },
  {
    id: "dsg-4-svc",
    name: "4 давхар үйлчилгээний барилга",
    purpose: "Худалдаа үйлчилгээ",
    floors: 4,
    unitsPerFloor: 0,
    excludeLevels: ["unit"],
  },
];

/**
 * Нэмэлт demo блокууд.
 *
 * Төсөл нь «75 барилгын цогцолбор» нэртэй атлаа ганц блоктой байсан тул
 * блокуудын жагсаалт, хянах самбарын харьцуулалт ганц мөр харуулж, тэр хоёр
 * дэлгэц юу хийдгээ огт илэрхийлдэггүй байв.
 *
 * `front` нь явцын фронт: блок бүр өөр шатанд байна — дуусах шатандаа, дунд,
 * дөнгөж эхэлсэн. Бүгд ижил хувьтай бол харьцуулалт утгагүй.
 */
const EXTRA_BLOCKS: {
  id: string;
  buildingNo: string;
  name: string;
  designId: string;
  front: number;
}[] = [
  {
    id: "blk-b-02",
    buildingNo: "19",
    name: "Б блок — 12 давхар орон сууц",
    designId: "dsg-12-6",
    front: 104,
  },
  {
    id: "blk-c-03",
    buildingNo: "20",
    name: "В блок — 12 давхар орон сууц",
    designId: "dsg-12-6",
    front: 34,
  },
  {
    id: "blk-s-04",
    buildingNo: "21",
    name: "Үйлчилгээний барилга — 4 давхар",
    designId: "dsg-4-svc",
    front: 70,
  },
];

// ---------------------------------------------------------------------------
// Үүсгэлт
// ---------------------------------------------------------------------------
interface MockDb {
  blocks: Block[];
  designs: BlockDesign[];
  locations: Location[];
  groups: WorkTypeGroup[];
  workTypes: WorkType[];
  workItems: WorkItem[];
  contractors: Contractor[];
  jobs: Map<string, Job>;
  byId: Map<string, WorkItem>;
  /** locationId → бүх удам (өөрөө орно) — includeDescendants шүүлтэд. */
  descendants: Map<string, Set<string>>;
}

let db: MockDb | null = null;

function buildLocations(
  blockId: string,
  blockName: string,
  floors: number,
  unitsPerFloor: number,
): Location[] {
  const rootId = `loc-${blockId}-root`;
  const out: Location[] = [
    {
      id: rootId,
      blockId,
      parentId: null,
      level: "block",
      name: blockName,
      path: blockName,
      sequenceNumber: -1,
    },
    {
      id: `loc-${blockId}-f-0`,
      blockId,
      parentId: rootId,
      level: "floor",
      name: "Зоорийн давхар",
      path: `${blockName} › Зоорийн давхар`,
      sequenceNumber: 0,
    },
  ];

  for (let f = 1; f <= floors; f++) {
    const floorId = `loc-${blockId}-f-${f}`;
    out.push({
      id: floorId,
      blockId,
      parentId: rootId,
      level: "floor",
      name: `${f}-р давхар`,
      path: `${blockName} › ${f}-р давхар`,
      sequenceNumber: f,
    });
    for (let i = 0; i < unitsPerFloor; i++) {
      const u = UNIT_NAMES[i % UNIT_NAMES.length];
      out.push({
        id: `loc-${blockId}-u-${f}-${u}`,
        blockId,
        parentId: floorId,
        level: "unit",
        name: u,
        path: `${blockName} › ${f}-р давхар › ${u}`,
        sequenceNumber: i,
      });
    }
  }
  return out;
}

function deriveState(
  planned: number,
  reported: number,
  accepted: number,
  returned: boolean,
) {
  let reviewState: ReviewState = "none";
  if (returned) reviewState = "returned";
  else if (reported <= 0) reviewState = "none";
  else if (accepted < reported) reviewState = "pending";
  else reviewState = "approved";

  let status: WorkStatus = "not_started";
  if (accepted >= planned) status = "completed";
  else if (reported > 0) status = "in_progress";

  return { reviewState, status };
}

/**
 * Загварыг блокт буулгаж WorkItem үүсгэнэ.
 *
 * `simulateProgress=false` үед бүх ажил "эхлээгүй" төлөвтэй гарна — шинэ блок
 * үүсгэхэд яг ийм байх ёстой. Анхны demo блокт л явцыг дуурайлгана.
 */
function generateWorkItems(
  blockId: string,
  locations: Location[],
  workTypes: WorkType[],
  raw: RawWorkType[],
  startDate: string,
  simulateProgress: boolean,
  /** Явцын фронт — блок бүр өөр шатанд байхын тулд. Хоосон бол анхдагч. */
  progressFront: number = PROGRESS_FRONT,
): WorkItem[] {
  const byLevel = (lv: LocationLevel) =>
    locations.filter((l) => l.level === lv);
  const today = new Date().toISOString().slice(0, 10);
  const out: WorkItem[] = [];

  for (const [i, wt] of workTypes.entries()) {
    const spec = raw[i];
    const targets =
      wt.level === "block"
        ? byLevel("block")
        : wt.level === "floor"
          ? byLevel("floor")
          : byLevel("unit");
    if (targets.length === 0) continue;

    const order = GROUP_ORDER[wt.groupName] ?? 5;

    /**
     * Шинэ блокийн ажил ХАРИУЦАГЧГҮЙ үүснэ.
     *
     * Backend-ийн `ApplyBlockDesign` нь `contractor_id = null` гэж тавьдаг;
     * оноолт нь тусдаа алхам (`/work-items/assign`). Mock энд автоматаар
     * оноовол тэр алхам байхгүй байгааг нуух тул анхны demo блокт л ононо.
     */
    const contractorId = simulateProgress
      ? (GROUP_CONTRACTOR[wt.groupName] ?? null)
      : null;

    for (const loc of targets) {
      const id = `wi-${blockId}-${wt.id}-${loc.id}`;
      const r = rng(hash(id));
      const floorNo = Number(/-[fu]-(\d+)/.exec(loc.id)?.[1] ?? 0);

      // Барилга давалгаа маягаар урагшилдаг: доод давхрын угсралт бүрэн
      // дууссан байхад дээд давхрынх хийгдээгүй, дотор засал огт эхлээгүй.
      let ratio = 0;
      if (simulateProgress) {
        const position = order * 12 + floorNo;
        if (position <= progressFront - PROGRESS_BAND) ratio = 1;
        else if (position >= progressFront + PROGRESS_BAND) ratio = 0;
        else {
          const t =
            (progressFront + PROGRESS_BAND - position) / (2 * PROGRESS_BAND);
          ratio = Math.max(0, Math.min(1, t * (0.75 + r() * 0.5)));
        }
      }

      const plannedQty = round(spec.plannedQty);
      const reportedQty = round(plannedQty * ratio);
      // Мэдээлсэн ажлын 2/3 нь бүрэн батлагдсан, үлдсэн нь хяналт хүлээж байна.
      const acceptedQty =
        reportedQty <= 0
          ? 0
          : r() < 0.66
            ? reportedQty
            : round(reportedQty * (0.7 + r() * 0.25));
      const returned = reportedQty > 0 && r() < 0.05;
      const { reviewState, status } = deriveState(
        plannedQty,
        reportedQty,
        acceptedQty,
        returned,
      );

      const startOffset = order * 26 + floorNo * 11;
      const plannedStartDate = addDays(startDate, startOffset);
      const plannedEndDate = addDays(
        startDate,
        startOffset + 12 + Math.floor(r() * 10),
      );
      const overdueDays =
        status !== "completed" && plannedEndDate < today
          ? Math.round(
              (Date.parse(today) - Date.parse(plannedEndDate)) / 86400000,
            )
          : 0;

      out.push({
        id,
        blockId,
        locationId: loc.id,
        workTypeId: wt.id,
        name: `${wt.name} — ${loc.name}`,
        unit: wt.unit,
        plannedQty,
        reportedQty,
        acceptedQty,
        remainingQty: round(Math.max(plannedQty - acceptedQty, 0)),
        percentage:
          plannedQty > 0 ? Math.round((acceptedQty / plannedQty) * 100) : 0,
        plannedStartDate,
        plannedEndDate,
        status,
        reviewState,
        overdueDays,
        location: { id: loc.id, path: loc.path, level: loc.level },
        workType: { id: wt.id, name: wt.name, groupName: wt.groupName },
        contractor: contractorId
          ? {
              id: contractorId,
              name: CONTRACTORS.find((c) => c.id === contractorId)!.name,
            }
          : null,
      });
    }
  }
  return out;
}

/** Байршлын мод — includeDescendants шүүлтэд ашиглана. */
function rebuildDescendants(locations: Location[]): Map<string, Set<string>> {
  const children = new Map<string, string[]>();
  for (const l of locations) {
    if (!l.parentId) continue;
    children.set(l.parentId, [...(children.get(l.parentId) ?? []), l.id]);
  }
  const descendants = new Map<string, Set<string>>();
  const collect = (id: string): Set<string> => {
    const cached = descendants.get(id);
    if (cached) return cached;
    const set = new Set<string>([id]);
    for (const c of children.get(id) ?? [])
      for (const d of collect(c)) set.add(d);
    descendants.set(id, set);
    return set;
  };
  for (const l of locations) collect(l.id);
  return descendants;
}

/** Загварт хэдэн WorkItem үүсэхийг урьдчилж бодно — дэлгэц дээр харуулна. */
function countItems(spec: DesignSpec, raw: RawWorkType[]): number {
  const floors = spec.floors + 1; // + зоорь
  const units = spec.floors * spec.unitsPerFloor;
  return raw.reduce((sum, w) => {
    if (spec.excludeLevels?.includes(w.level as LocationLevel)) return sum;
    if (w.level === "block") return sum + 1;
    if (w.level === "floor") return sum + floors;
    return sum + units;
  }, 0);
}

function build(): MockDb {
  const raw = rawWorkTypes as RawWorkType[];

  const groupNames = [...new Set(raw.map((w) => w.group))];
  const groups: WorkTypeGroup[] = groupNames.map((name, i) => ({
    id: `wtg-${i + 1}`,
    name,
    sequenceNumber: i + 1,
  }));
  const groupId = new Map(groups.map((g) => [g.name, g.id]));

  const workTypes: WorkType[] = raw.map((w) => ({
    id: `wt-${w.no}`,
    groupId: groupId.get(w.group)!,
    groupName: w.group,
    name: w.name,
    unit: w.unit,
    level: w.level as LocationLevel,
  }));

  const designs: BlockDesign[] = DESIGN_SPECS.map((s) => ({
    id: s.id,
    name: s.name,
    purpose: s.purpose,
    floors: s.floors,
    unitsPerFloor: s.unitsPerFloor,
    workTypeCount: raw.filter(
      (w) => !s.excludeLevels?.includes(w.level as LocationLevel),
    ).length,
    estimatedItems: countItems(s, raw),
    missingQuantities: raw.filter(
      (w) =>
        w.estimated && !s.excludeLevels?.includes(w.level as LocationLevel),
    ).length,
  }));

  // Анхны demo блок — Хавсралт-2-ын 16 давхрын загвараар, явц дуурайлгасан.
  const seedSpec = DESIGN_SPECS[0];
  const seedName = "А блок — 16 давхар орон сууц";
  const locations = buildLocations(
    SEED_BLOCK_ID,
    seedName,
    seedSpec.floors,
    seedSpec.unitsPerFloor,
  );
  const workItems = generateWorkItems(
    SEED_BLOCK_ID,
    locations,
    workTypes,
    raw,
    PROJECT_START,
    true,
  );

  const block: Block = {
    id: SEED_BLOCK_ID,
    projectId: PROJECT_ID,
    buildingNo: "18",
    name: seedName,
    purpose: seedSpec.purpose,
    floors: seedSpec.floors,
    unitCount: seedSpec.floors * seedSpec.unitsPerFloor,
    designId: seedSpec.id,
    status: "in_progress",
  };

  const blocks: Block[] = [block];
  const allLocations = [...locations];
  const allItems = [...workItems];

  for (const extra of EXTRA_BLOCKS) {
    const spec = DESIGN_SPECS.find((d) => d.id === extra.designId)!;
    const locs = buildLocations(
      extra.id,
      extra.name,
      spec.floors,
      spec.unitsPerFloor,
    );
    const items = generateWorkItems(
      extra.id,
      locs,
      workTypes,
      raw,
      PROJECT_START,
      true,
      extra.front,
    );

    blocks.push({
      id: extra.id,
      projectId: PROJECT_ID,
      buildingNo: extra.buildingNo,
      name: extra.name,
      purpose: spec.purpose,
      floors: spec.floors,
      unitCount: spec.floors * spec.unitsPerFloor,
      designId: spec.id,
      status: "in_progress",
    });
    allLocations.push(...locs);
    allItems.push(...items);
  }

  return {
    blocks,
    designs,
    locations: allLocations,
    groups,
    workTypes,
    workItems: allItems,
    contractors: CONTRACTORS,
    jobs: new Map(),
    byId: new Map(allItems.map((w) => [w.id, w])),
    descendants: rebuildDescendants(allLocations),
  };
}

export function getDb(): MockDb {
  if (!db) db = build();
  return db;
}

export const MOCK_IDS = { projectId: PROJECT_ID, blockId: SEED_BLOCK_ID };

// ---------------------------------------------------------------------------
// Блок үүсгэх + загвар буулгах
// ---------------------------------------------------------------------------
export interface CreateBlockInput {
  name: string;
  buildingNo: string;
  startDate: string;
  /** Давхрын хугацаа — давхар тутамд ногдох ажлын өдөр. Хоосон бол 5. */
  taktDays?: number;
  /** Хоосон бол загваргүй блок — доорх хэмжээг гараас авна. */
  designId?: string;
  purpose?: string;
  floors?: number;
  unitsPerFloor?: number;
}

/**
 * Блок үүсгэнэ. Загвар нь ЗААВАЛ БИШ.
 *
 * Загваргүй бол давхар/айлын тоог гараас авч, байршлыг ТЭР ДОР НЬ үүсгэнэ —
 * backend-тэй ижил. Ажил үүсэхгүй тул блок нь хоосон боловч ажил нэмэх газартай
 * болно.
 */
export function createBlock(input: CreateBlockInput): Block | null {
  const store = getDb();
  const spec = input.designId
    ? DESIGN_SPECS.find((d) => d.id === input.designId)
    : null;

  // Загвар заасан ч олдохгүй бол алдаа — дуугүй өнгөрөх ёсгүй.
  if (input.designId && !spec) return null;

  const floors = spec?.floors ?? input.floors ?? 0;
  const unitsPerFloor = spec?.unitsPerFloor ?? input.unitsPerFloor ?? 0;

  if (!spec && floors <= 0) return null;

  const block: Block = {
    id: mockId("blk"),
    projectId: PROJECT_ID,
    buildingNo: input.buildingNo,
    name: input.name,
    purpose: spec?.purpose ?? input.purpose ?? "—",
    floors,
    unitCount: floors * unitsPerFloor,
    designId: spec?.id,
    startDate: input.startDate,
    taktDays: input.taktDays ?? 5,
    status: "not_started",
  };
  store.blocks.push(block);

  // Загваргүй блокт байршил тэр дор нь үүснэ.
  if (!spec) {
    const locations = buildLocations(
      block.id,
      block.name,
      floors,
      unitsPerFloor,
    );
    store.locations.push(...locations);
    store.descendants = rebuildDescendants(store.locations);
  }

  return block;
}

/**
 * Загварыг блокт буулгах ажлыг эхлүүлнэ.
 *
 * Жинхэнэ backend дээр 3,000+ мөр үүсгэх нь удаан тул синхрон биш байх ёстой.
 * Mock мөн адил ажилладаг: `jobId` буцаагаад, `GET /jobs/:id` дуудагдах бүрд
 * хэсэгчлэн үүсгэнэ. Ингэснээр дэлгэцийн poll хийх зам нь жинхэнээр шалгагдана.
 */
export function startApplyJob(
  blockId: string,
  startDate: string,
  designId?: string,
): Job | null {
  const store = getDb();
  const block = store.blocks.find((b) => b.id === blockId);

  // Загварыг ЗАМААС авна — блокоос биш. Загваргүй блокт дараа нь загвар
  // буулгах үед блок дээр `designId` байхгүй байдаг (backend-тэй ижил).
  const spec = DESIGN_SPECS.find((d) => d.id === (designId ?? block?.designId));
  if (!block || !spec) return null;

  const raw = rawWorkTypes as RawWorkType[];
  const job: Job = {
    id: mockId("job"),
    status: "running",
    progress: 0,
    total: countItems(spec, raw),
    result: { blockId },
  };
  store.jobs.set(job.id, job);

  // Байршил АЛЬ ХЭДИЙН байвал дахин үүсгэхгүй — загваргүй блок үүсгээд дараа
  // нь загвар буулгахад давхар/айл хоёр дахин үүсэх нь бүх тоог хоёр дахин
  // болгоно.
  let locations = store.locations.filter((l) => l.blockId === blockId);

  if (locations.length === 0) {
    locations = buildLocations(
      blockId,
      block.name,
      spec.floors,
      spec.unitsPerFloor,
    );
    store.locations.push(...locations);
    store.descendants = rebuildDescendants(store.locations);
    block.designId = spec.id;
    block.floors = spec.floors;
    block.unitCount = spec.floors * spec.unitsPerFloor;
  } else {
    // Загваргүй үүссэн блокт загвар холбогдоно.
    block.designId ??= spec.id;
  }

  const allowed = store.workTypes.filter(
    (w) => !spec.excludeLevels?.includes(w.level),
  );
  const allowedRaw = raw.filter(
    (w) => !spec.excludeLevels?.includes(w.level as LocationLevel),
  );
  pendingWork.set(job.id, {
    blockId,
    locations,
    workTypes: allowed,
    raw: allowedRaw,
    startDate,
    generated: false,
  });

  return job;
}

interface PendingWork {
  blockId: string;
  locations: Location[];
  workTypes: WorkType[];
  raw: RawWorkType[];
  startDate: string;
  generated: boolean;
}
const pendingWork = new Map<string, PendingWork>();

/** Job-ийн төлөвийг ахиулна — дуудагдах бүрд 40% урагшилна. */
export function pollJob(jobId: string): Job | null {
  const store = getDb();
  const job = store.jobs.get(jobId);
  if (!job) return null;
  if (job.status === "completed") return job;

  job.progress = Math.min(job.total, job.progress + Math.ceil(job.total * 0.4));

  if (job.progress >= job.total) {
    const work = pendingWork.get(jobId);
    if (work && !work.generated) {
      const items = generateWorkItems(
        work.blockId,
        work.locations,
        work.workTypes,
        work.raw,
        work.startDate,
        false,
      );
      store.workItems.push(...items);
      for (const w of items) store.byId.set(w.id, w);
      work.generated = true;
      job.total = items.length;
      job.progress = items.length;
    }
    job.status = "completed";
  }
  return job;
}

// ---------------------------------------------------------------------------
// Явц ба шалгалт — WorkItem-ийн seed-ээс шаардсан үед үүснэ
// ---------------------------------------------------------------------------
export function progressFor(item: WorkItem): ProgressEntry[] {
  if (item.reportedQty <= 0) return [];
  const r = rng(hash(`${item.id}:progress`));
  const count = 1 + Math.floor(r() * 4);

  const weights = Array.from({ length: count }, () => 0.5 + r());
  const sum = weights.reduce((a, b) => a + b, 0);

  const start = Date.parse(`${item.plannedStartDate}T00:00:00Z`);
  const entries: ProgressEntry[] = weights
    .map((w, i) => ({
      id: `pe-${item.id}-${i}`,
      workItemId: item.id,
      completedQty: round((item.reportedQty * w) / sum),
      recordedAt: new Date(start + (i + 1) * 3 * 86400000).toISOString(),
      workersCount: 3 + Math.floor(r() * 9),
      remarks: i === 0 ? "Ажил эхэллээ" : undefined,
      reportedBy: {
        id: "usr-site-1",
        name: "Б.Тамир",
        role: "Талбайн инженер",
      },
      photos: [],
      photoCount: 0,
    }))
    .reverse(); // шинэ → хуучин

  /*
   * Зураг — нотолгоо нь энэ системийн гол утга учраас mock-д ЗААВАЛ байна.
   *
   * Урьд нь хоосон байсан тул явцын түүхийн мөр бүр «Зураггүй» гэж гарч,
   * гүйцэтгэлийг зургаар нотлох урсгал огт харагддаггүй байв.
   *
   * Файлыг прокси өөрөө өгнө (`app/api/cpms/[...path]`) — mock нь JSON-оос
   * өөр юм буцаадаггүй тул зөвхөн БҮРТГЭЛийг нь энд үүсгэнэ.
   */
  for (const entry of entries) {
    const pr = rng(hash(`${entry.id}:photos`));
    const count = 1 + Math.floor(pr() * 3);
    entry.photos = Array.from({ length: count }, (_, j): Photo => {
      const type = (["before", "progress", "after"] as const)[j % 3];

      return {
        id: `ph-${entry.id}-${j}`,
        workItemId: item.id,
        progressEntryId: entry.id,
        type,
        // Backend-ийн хэлбэртэй ИЖИЛ харьцангуй зам — `photoUrl()` нь үүн дээр
        // проксигийн угтвар нэмнэ.
        url: `/photos/ph-${entry.id}-${j}/file`,
        takenAt: entry.recordedAt,
        uploadedAt: entry.recordedAt,
        uploadedBy: entry.reportedBy.name,
        // Шалгалт хийгдсэн ажлын зураг түгжигдэнэ — устгах боломжгүй.
        locked: item.acceptedQty > 0,
      };
    });
    entry.photoCount = entry.photos.length;
  }

  return entries;
}

export function inspectionsFor(item: WorkItem): Inspection[] {
  if (item.acceptedQty <= 0 && item.reviewState !== "returned") return [];
  const r = rng(hash(`${item.id}:inspection`));
  const rejectedQty = round(item.reportedQty - item.acceptedQty);
  const out: Inspection[] = [];

  const base = Date.parse(`${item.plannedStartDate}T00:00:00Z`) + 20 * 86400000;
  const stages = ["general_contractor", "client"] as const;

  for (const [i, stage] of stages.entries()) {
    if (i === 1 && r() < 0.4) break; // захиалагчийн хяналт хараахан ороогүй
    const isReturned =
      item.reviewState === "returned" && i === stages.length - 1;
    out.push({
      id: `insp-${item.id}-${stage}`,
      workItemId: item.id,
      stage,
      result: isReturned
        ? "rejected"
        : rejectedQty > 0.01
          ? "partial"
          : "accepted",
      acceptedQty: isReturned ? 0 : item.acceptedQty,
      rejectedQty: isReturned ? item.reportedQty : rejectedQty,
      reason: isReturned
        ? "Гадаргуугийн тэгш байдал зөрсөн — дахин хийх"
        : undefined,
      inspectedAt: new Date(base + i * 2 * 86400000).toISOString(),
      inspector: {
        id: stage === "client" ? "usr-insp-cl" : "usr-insp-gc",
        name:
          stage === "client"
            ? "Д.Хулан (захиалагч)"
            : "С.Ганбат (ерөнхий гүйцэтгэгч)",
      },
    });
  }
  return out.reverse();
}
