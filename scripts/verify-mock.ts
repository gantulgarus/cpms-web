import { handleMock } from "../lib/mock/handler";
import { forwardResponseHeaders, responseHasBody } from "../lib/proxy";
import { photoUrl } from "../lib/photo-url";
import { getDb } from "../lib/mock/store";

let fail = 0;
const t = (n: string, c: boolean, e = "") => {
  console.log((c ? "PASS" : "FAIL") + " · " + n + (e ? " → " + e : ""));
  if (!c) fail++;
};
const get = (p: string, s = "") => handleMock("GET", p.split("/"), s, undefined);
const body = <T>(r: { body: unknown }) => r.body as T;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Тоо хэмжээ нь МЯНГАТЫН орноор хадгалагддаг — тестийн арифметик мөн адил
 *  байх ёстой. 2 орноор бөөрөнхийлвөл 800 мөр дээр 0.26 зөрүү хуримтлагдана. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

const db = getDb();

/*
 * Хэмжээг ТУХАЙН БЛОКООР шалгана, нийт дүнгээр БИШ.
 *
 * Энэ шалгуурын утга нь «UI жинхэнэ ачаалал дааж байна уу» гэдэг бөгөөд тэрийг
 * анхны блокийн 3,290 мөр хэмждэг. Нийт дүнгээр шалгавал demo-д блок нэмэх
 * бүрд шалгуур унаж, тоог нь гараар засах болно — өөрөөр хэлбэл юу ч
 * хамгаалахаа болино.
 */
const seedItems = db.workItems.filter((w) => w.blockId === "blk-a-01");
const seedLocations = db.locations.filter((l) => l.blockId === "blk-a-01");
t("Анхны блокийн WorkItem 3,290", seedItems.length === 3290, String(seedItems.length));
t(
  "Байршил: 1 блок + 17 давхар + 144 айл = 162",
  seedLocations.length === 162,
  String(seedLocations.length),
);
t(
  "Demo нь олон блоктой — жагсаалт, харьцуулалтын дэлгэц ганц мөр байж болохгүй",
  db.blocks.length >= 4,
  `${db.blocks.length} блок`,
);
t("Ажлын төрөл 47", db.workTypes.length === 47);

// Хуудаслалт
const p1 = body<{ data: unknown[]; meta: { total: number } }>(
  get("blocks/blk-a-01/work-items", "?page=1&pageSize=50"),
);
t("Хуудас 50 мөр буцаана", p1.data.length === 50, String(p1.data.length));
t("meta.total бүх мөрийг заана", p1.meta.total === 3290, String(p1.meta.total));
const cap = body<{ data: unknown[] }>(get("blocks/blk-a-01/work-items", "?pageSize=9999"));
t("pageSize 200-аар таслагдана", cap.data.length === 200, String(cap.data.length));

// Шүүлтүүр
const f5 = body<{ meta: { total: number } }>(
  get("blocks/blk-a-01/work-items", "?locationId=loc-blk-a-01-f-5"),
);
const f5d = body<{ meta: { total: number } }>(
  get("blocks/blk-a-01/work-items", "?locationId=loc-blk-a-01-f-5&includeDescendants=true"),
);
t("5-р давхрын өөрийн ажил 15", f5.meta.total === 15, String(f5.meta.total));
t("Айлууд нь хамрагдвал 15 + 9×21 = 204", f5d.meta.total === 204, String(f5d.meta.total));
const pend = body<{ meta: { total: number } }>(
  get("blocks/blk-a-01/work-items", "?reviewState=pending"),
);
t(
  "Хүлээгдэж буй шүүлтүүр ажиллана",
  pend.meta.total > 0 && pend.meta.total < 3290,
  String(pend.meta.total),
);

// Нэгтгэл
const sum = body<{
  data: {
    totals: { workItems: number };
    groups: { label: string; workItems: number }[];
  };
}>(get("blocks/blk-a-01/summary", "?groupBy=floor"));
t("Давхраар нэгтгэвэл 18 бүлэг", sum.data.groups.length === 18, String(sum.data.groups.length));
t("Нэгтгэлийн нийлбэр 3,290", sum.data.groups.reduce((a, g) => a + g.workItems, 0) === 3290);
t(
  "Эхний бүлэг барилгын түвшний ажил",
  sum.data.groups[0].label === "Барилга бүхэлдээ",
  sum.data.groups[0].label,
);
t("Хоёр дахь нь зоорь", sum.data.groups[1].label === "Зоорийн давхар", sum.data.groups[1].label);
const byC = body<{ data: { groups: { label: string }[] } }>(
  get("blocks/blk-a-01/summary", "?groupBy=contractor"),
);
t("Гүйцэтгэгчээр нэгтгэнэ", byC.data.groups.length === 6, String(byC.data.groups.length));

// Доод давхар дээд давхраасаа илүү дууссан эсэх
const g = sum.data.groups as unknown as { label: string; percentage: number }[];
const f2 = g.find((x) => x.label === "2-р давхар")!.percentage;
const f15 = g.find((x) => x.label === "15-р давхар")!.percentage;
t("Доод давхар илүү дууссан байна", f2 > f15, `2-р=${f2}%  15-р=${f15}%`);

// Явц бичих — валидаци
const item = db.workItems.find((w) => w.remainingQty > 20)!;
const bad = handleMock("POST", ["work-items", item.id, "progress"], "", {
  completedQty: 999999,
});
t("Үлдэгдлээс их бол 422", bad.status === 422, String(bad.status));
const neg = handleMock("POST", ["work-items", item.id, "progress"], "", {
  completedQty: -5,
});
t("Сөрөг тоо бол 422", neg.status === 422, String(neg.status));

const before = item.reportedQty;
const okRes = handleMock("POST", ["work-items", item.id, "progress"], "", {
  completedQty: 10,
});
t("Зөв утга 201 буцаана", okRes.status === 201, String(okRes.status));
t("reportedQty нэмэгдсэн", Math.abs(item.reportedQty - (before + 10)) < 0.01);
t("Төлөв pending болсон", item.reviewState === "pending", item.reviewState);

// Шалгалт — ХҮЛЭЭГДЭЖ БУЙ бүх хэмжээг батална.
// Хэсэгчлэн батлавал үлдсэн нь хянагдаагүй тул `pending` хэвээр байх ёстой:
// «батлав» гэсэн товч дарахад бүх зүйл дуусдаг гэж үзвэл хэмжилт худал болно.
const pendingBefore = round3(item.reportedQty - item.acceptedQty);
const insp = handleMock("POST", ["work-items", item.id, "inspections"], "", {
  stage: "client",
  result: "accepted",
  acceptedQty: pendingBefore,
});
t("Шалгалт 201", insp.status === 201);
t("Бүгдийг батласны дараа approved", item.reviewState === "approved", item.reviewState);

const noReason = handleMock("POST", ["work-items", item.id, "inspections"], "", {
  result: "rejected",
  acceptedQty: 0,
});
t("Шалтгаангүй татгалзвал 422", noReason.status === 422, String(noReason.status));

// Явцын дараалал
const pr = body<{ data: { recordedAt: string }[] }>(get(`work-items/${item.id}/progress`));
const sorted = [...pr.data].every((e, i, arr) => i === 0 || arr[i - 1].recordedAt >= e.recordedAt);
t("Явц шинэ→хуучин дараалалтай", sorted);

// Нэгтгэлийн бүлэг бүрийн `filter`-ийг буцааж хэрэглэхэд яг тэр тоо гарах ёстой.
// Энэ бол дэлгэц дээр "11 ажил" гэж бичээд дарахад 3,290 гарч ирэх алдааны хамгаалалт.
const qs = (f: Record<string, unknown>) =>
  Object.entries(f)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

for (const gb of ["floor", "workTypeGroup", "contractor", "workType"] as const) {
  const s = body<{
    data: {
      groups: {
        label: string;
        workItems: number;
        filter: Record<string, unknown>;
      }[];
    };
  }>(get("blocks/blk-a-01/summary", `?groupBy=${gb}`));
  const bad = s.data.groups.filter((g) => {
    const r = body<{ meta: { total: number } }>(
      get("blocks/blk-a-01/work-items", `?${qs(g.filter)}&pageSize=1`),
    );
    return r.meta.total !== g.workItems;
  });
  t(
    `groupBy=${gb} — бүлгийн filter буцааж хэрэглэхэд таарна (${s.data.groups.length} бүлэг)`,
    bad.length === 0,
    bad.map((g) => g.label).join(", "),
  );
}

// Бүх хуудсыг гүйлгэхэд мөр алдагдахгүй эсэх.
let seen = 0;
let pageNo = 1;
for (;;) {
  const r = body<{ data: unknown[]; meta: { total: number } }>(
    get("blocks/blk-a-01/work-items", `?pageSize=200&page=${pageNo}`),
  );
  seen += r.data.length;
  if (seen >= r.meta.total || r.data.length === 0) break;
  pageNo++;
}
t("Бүх хуудсыг гүйлгэхэд мөр алдагдахгүй", seen === 3290, `${seen} / 3290 (${pageNo} хуудас)`);

// --- Загвараас блок хувилах урсгал ---
const designs = body<{
  data: { id: string; estimatedItems: number; floors: number }[];
}>(get("block-designs")).data;
t("Гурван загвар байна", designs.length === 3, String(designs.length));

const d16 = designs.find((d) => d.id === "dsg-16-9")!;
t("16 давхрын загвар 3,290 ажил тооцно", d16.estimatedItems === 3290, String(d16.estimatedItems));
const dSvc = designs.find((d) => d.id === "dsg-4-svc")!;
t(
  "Үйлчилгээний загварт айлын ажил ороогүй",
  dSvc.estimatedItems < 100,
  String(dSvc.estimatedItems),
);

const itemsBefore = getDb().workItems.length;
const newBlock = body<{ data: { id: string; name: string } }>(
  handleMock("POST", ["projects", "prj-inel-01", "blocks"], "", {
    name: "Б блок",
    buildingNo: "19",
    designId: "dsg-12-6",
    startDate: "2026-09-01",
  }),
).data;
t("Блок үүслээ", Boolean(newBlock?.id), newBlock?.id);

const noDesign = handleMock("POST", ["projects", "prj-inel-01", "blocks"], "", {
  name: "В блок",
});
t("Загваргүй бол 422", noDesign.status === 422, String(noDesign.status));

const applyRes = handleMock("POST", ["block-designs", "dsg-12-6", "apply"], "", {
  blockId: newBlock.id,
  startDate: "2026-09-01",
});
t("Загвар буулгах 202 + jobId", applyRes.status === 202);
let job = body<{
  data: { id: string; status: string; progress: number; total: number };
}>(applyRes).data;
let guard = 0;
while (job.status !== "completed" && guard++ < 20) {
  job = body<{ data: typeof job }>(get(`jobs/${job.id}`)).data;
}
t("Ажил дуусав", job.status === "completed", `${job.progress}/${job.total}`);

const d12 = designs.find((d) => d.id === "dsg-12-6")!;
t(
  "Тооцоолсон тоо яг таарлаа",
  job.total === d12.estimatedItems,
  `${job.total} vs ${d12.estimatedItems}`,
);
t("Ажлын нэгж нэмэгдсэн", getDb().workItems.length === itemsBefore + d12.estimatedItems);

// Хамгийн чухал: блок бүр өөрийн өгөгдлийг л харах ёстой.
const oldTotal = body<{ meta: { total: number } }>(get("blocks/blk-a-01/work-items", "?pageSize=1"))
  .meta.total;
const newTotal = body<{ meta: { total: number } }>(
  get(`blocks/${newBlock.id}/work-items`, "?pageSize=1"),
).meta.total;
t("Анхны блок хэвээр 3,290", oldTotal === 3290, String(oldTotal));
t("Шинэ блок зөвхөн өөрийнхөө ажлыг харуулна", newTotal === d12.estimatedItems, String(newTotal));

const newSum = body<{
  data: { totals: { percentage: number; workItems: number } };
}>(get(`blocks/${newBlock.id}/summary`)).data;
t("Шинэ блок 0% явцтай эхэлнэ", newSum.totals.percentage === 0, `${newSum.totals.percentage}%`);

t("Байхгүй блок 404", get("blocks/blk-zzz/summary").status === 404);
t("Байхгүй зам 404", get("blocks/blk-a-01/zzz").status === 404);

// ---------------------------------------------------------------------------
// Гүйцэтгэгчийн хамрах хүрээ
// ---------------------------------------------------------------------------
// Backend-ийн `ContractorScopeTest`-ийн mock хувилбар. Mock хамрах хүрээг
// мөрдөхгүй байвал дэлгэц mock дээр "ажиллаж", жинхэнэ backend дээр хоосон
// гарна — тэгвэл mock-ийн ач холбогдол үгүй болно.
const login = (code: string) => handleMock("POST", ["auth", "contractor-login"], "", { code });

t("Буруу кодоор нэвтрэхгүй", login("XXX-000000").status === 422);
t("GOO-2026 кодоор нэвтэрлээ", login("GOO-2026").status === 200);

const me = body<{ data: { contractorId: string; canInspect: boolean } }>(get("me")).data;
t("Сесс гүйцэтгэгч болсон", me.contractorId === "ctr-5", String(me.contractorId));
t("Гүйцэтгэгч батлах эрхгүй", me.canInspect === false);

const mineTotal = body<{ meta: { total: number } }>(
  get("blocks/blk-a-01/work-items", "?pageSize=1"),
).meta.total;
const expected = db.workItems.filter(
  (w) => w.blockId === "blk-a-01" && w.contractor?.id === "ctr-5",
).length;
t("Зөвхөн өөрийн ажил харагдана", mineTotal === expected, `${mineTotal} vs ${expected}`);
t("Бүх ажлаас багассан", mineTotal > 0 && mineTotal < 3290, String(mineTotal));

// Хамгийн чухал: нэгтгэл ба жагсаалт ижил хүрээтэй байх. Хоёр өөр код замаар
// бодогддог тул зөрөх магадлал өндөр — "204 ажил" гэж бичээд 12 гарвал
// хэрэглэгч програмд итгэхээ болино.
const repSum = body<{
  data: {
    totals: { workItems: number };
    groups: {
      label: string;
      workItems: number;
      filter: Record<string, unknown>;
    }[];
  };
}>(get("blocks/blk-a-01/summary", "?groupBy=floor")).data;
t(
  "Нэгтгэл жагсаалттай таарна",
  repSum.totals.workItems === mineTotal,
  `${repSum.totals.workItems} vs ${mineTotal}`,
);

let groupMismatch = "";
for (const grp of repSum.groups) {
  const qs = Object.entries(grp.filter)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const actual = body<{ meta: { total: number } }>(
    get("blocks/blk-a-01/work-items", `?${qs}&pageSize=1`),
  ).meta.total;
  if (actual !== grp.workItems) groupMismatch = `${grp.label}: ${grp.workItems} vs ${actual}`;
}
t("Бүлэг дарахад тоо таарна", groupMismatch === "", groupMismatch);

// Өөр компанийн id-г шүүлтүүрээр илгээх нь хамгийн хялбар халдлага.
const spoof = body<{ meta: { total: number } }>(
  get("blocks/blk-a-01/work-items", "?contractorId=ctr-1"),
).meta.total;
t("Шүүлтүүрээр хүрээ тэлэхгүй", spoof === 0, String(spoof));

const theirs = db.workItems.find((w) => w.blockId === "blk-a-01" && w.contractor?.id === "ctr-1")!;
t("Өөр компанийн ажил 403", get(`work-items/${theirs.id}`).status === 403);

const orphan = db.workItems.find((w) => w.blockId === "blk-a-01" && !w.contractor);
t("Хариуцагчгүй ажил ч 403", orphan ? get(`work-items/${orphan.id}`).status === 403 : true);

// Гүйцэтгэл оруулах нь ажиллах ёстой — энэ нь гол шаардлага.
const mineItem = db.workItems.find(
  (w) => w.blockId === "blk-a-01" && w.contractor?.id === "ctr-5" && w.remainingQty > 20,
)!;
const repReport = handleMock("POST", ["work-items", mineItem.id, "progress"], "", {
  completedQty: 3,
});
t("Гүйцэтгэгч өөрийн ажилд явц оруулна", repReport.status === 201, String(repReport.status));

const repInspect = handleMock("POST", ["work-items", mineItem.id, "inspections"], "", {
  stage: "client",
  result: "accepted",
  acceptedQty: 3,
});
t("Гүйцэтгэгч өөрийгөө батлахгүй", repInspect.status === 403, String(repInspect.status));

const theirReport = handleMock("POST", ["work-items", theirs.id, "progress"], "", {
  completedQty: 3,
});
t("Өөр компанийн ажилд явц оруулахгүй", theirReport.status === 403, String(theirReport.status));

const repBlocks = body<{ data: { id: string }[] }>(get("projects/prj-inel-01/blocks")).data;
// "Гоо Засал ХХК" дотор засал хийдэг тул хэд хэдэн барилгад ажиллаж болно.
// Тиймээс "зөвхөн нэг блок" гэж шалгах нь буруу — "ажил байгаа блок бүр,
// зөвхөн тэд" гэж шалгана.
const myBlocks = new Set(
  getDb()
    .workItems.filter((w) => w.contractor?.id === "ctr-5")
    .map((w) => w.blockId),
);
t(
  "Зөвхөн ажил байгаа барилга жагсаална",
  repBlocks.length === myBlocks.size && repBlocks.every((bl) => myBlocks.has(bl.id)),
  `${repBlocks.map((x) => x.id).join(",")} vs ${[...myBlocks].join(",")}`,
);
const emptyBlocks = getDb().blocks.filter((bl) => !myBlocks.has(bl.id));
t(
  "Ажил байхгүй барилга 403",
  emptyBlocks.every((bl) => get(`blocks/${bl.id}/work-items`).status === 403),
  `${emptyBlocks.length} хоосон блок шалгав`,
);

// Ажилтны сесс рүү буцаана — доорх шалгалтууд бүрэн хүрээ хүлээж байгаа.
handleMock("POST", ["auth", "login"], "", {
  email: "director@cpms.test",
  password: "x",
});
t(
  "Ажилтан бүх ажлыг харна",
  body<{ meta: { total: number } }>(get("blocks/blk-a-01/work-items", "?pageSize=1")).meta.total ===
    3290,
);

// ---------------------------------------------------------------------------
// Админы удирдлага: хэрэглэгч, лавлах сан, дараалал, асуудал
// ---------------------------------------------------------------------------
const post = (path: string, payload: unknown) => handleMock("POST", path.split("/"), "", payload);

// --- Хэрэглэгч ---
const usersBefore = body<{ meta: { total: number } }>(get("users")).meta.total;
const newUser = post("users", {
  name: "Б.Болд",
  email: "bold@cpms.mn",
  role: "inspector",
});
t("Хэрэглэгч үүслээ", newUser.status === 201, String(newUser.status));
t(
  "Түр нууц үг буцаана",
  Boolean(body<{ meta: { temporaryPassword: string } }>(newUser).meta.temporaryPassword),
);
t(
  "Хяналтын инженер батлах эрхтэй",
  body<{ data: { canInspect: boolean; canReportProgress: boolean } }>(newUser).data.canInspect ===
    true,
);
t(
  "Хяналтын инженер мэдээлэх эрхгүй",
  body<{ data: { canReportProgress: boolean } }>(newUser).data.canReportProgress === false,
);
t(
  "Жагсаалтад нэмэгдсэн",
  body<{ meta: { total: number } }>(get("users")).meta.total === usersBefore + 1,
);
t(
  "Давхардсан имэйл 422",
  post("users", { name: "Хоёр дахь", email: "bold@cpms.mn", role: "admin" }).status === 422,
);
t("Нэргүй бол 422", post("users", { email: "a@b.mn", role: "admin" }).status === 422);

const createdUserId = body<{ data: { id: string } }>(newUser).data.id;
const deact = handleMock("DELETE", ["users", createdUserId], "", undefined);
t("Идэвхгүй болголоо", body<{ data: { isActive: boolean } }>(deact).data.isActive === false);
// Данс УСТГАГДААГҮЙ — түүний мэдээлсэн явц эзэнгүй үлдэх ёсгүй.
t(
  "Данс устгагдаагүй",
  body<{ meta: { total: number } }>(get("users")).meta.total === usersBefore + 1,
);

// --- Хэрэглэгч засах ---
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  scopeBlockIds: string[];
  isActive: boolean;
  canInspect: boolean;
  canReportProgress: boolean;
}
const patchUser = (payload: Record<string, unknown>) =>
  handleMock("PATCH", ["users", createdUserId], "", payload);

const renamed = patchUser({ name: "Б.Болд-Эрдэнэ" });
t("Нэр засагдана", body<{ data: UserRow }>(renamed).data.name === "Б.Болд-Эрдэнэ");

// Хаасан дансыг ЭРГҮҮЛЭН нээх — урьд нь зөвхөн хаах зам байсан.
t(
  "Хаасан хэрэглэгчийг сэргээнэ",
  body<{ data: UserRow }>(patchUser({ isActive: true })).data.isActive === true,
);

const blockId = getDb().blocks[0].id;
t(
  "Хамрах барилга засагдана",
  body<{ data: UserRow }>(patchUser({ scopeBlockIds: [blockId] })).data.scopeBlockIds.length === 1,
);
t(
  "Хамрах барилгыг хоосон болгоно",
  body<{ data: UserRow }>(patchUser({ scopeBlockIds: [] })).data.scopeBlockIds.length === 0,
);

/*
 * Үүрэг солиход ТҮҮНЭЭС ГАРАХ эрхүүд хамт шинэчлэгдэх ёстой.
 *
 * Mock урьд нь `Object.assign` хийдэг байсан тул шошго, эрх нь хуучнаараа
 * үлдэж «Талбайн инженер · батална» гэсэн боломжгүй хослол үүсдэг байв.
 */
const changedRole = body<{ data: UserRow }>(patchUser({ role: "site_engineer" })).data;
t(
  "Үүрэг солиход эрх дагаж өөрчлөгдөнө",
  changedRole.role === "site_engineer" &&
    changedRole.roleLabel === "Талбайн инженер" &&
    changedRole.canInspect === false &&
    changedRole.canReportProgress === true,
  `${changedRole.roleLabel} · батална=${changedRole.canInspect}`,
);

t("Танигдахгүй үүрэг 422", patchUser({ role: "хаан" }).status === 422);
t("Хоосон нэр 422", patchUser({ name: "  " }).status === 422);
// Өөр хүний имэйл рүү шилжихийг хориглоно; өөрийнхөө хэвээр үлдээхийг зөвшөөрнө.
const someoneElse = body<{ data: UserRow[] }>(get("users")).data.find(
  (u) => u.id !== createdUserId,
)!;
t("Бусдын имэйл 422", patchUser({ email: someoneElse.email }).status === 422);
t("Өөрийн имэйл хэвээр 200", patchUser({ email: "bold@cpms.mn" }).status === 200);

// Сүүлчийн админ өөрийгөө буулгавал хэрэглэгч удирдах хаалга бүрмөсөн хаагдана.
const meId = body<{ data: { id: string } }>(get("me")).data.id;
t(
  "Өөрийн эрхээ бууруулахгүй",
  handleMock("PATCH", ["users", meId], "", { role: "site_engineer" }).status === 422,
);

t("Үүргийн жагсаалт 8", body<{ data: unknown[] }>(get("users/roles")).data.length === 8);
t(
  "Үүрэг бүр хэрэглэгч удирдах эрхээ мэдэгдэнэ",
  body<{ data: { value: string; canManageUsers: boolean }[] }>(get("users/roles")).data.every(
    (r) => typeof r.canManageUsers === "boolean",
  ) &&
    body<{ data: { value: string; canManageUsers: boolean }[] }>(get("users/roles")).data.find(
      (r) => r.value === "admin",
    )!.canManageUsers === true,
);

// --- Лавлах сан ---
const groupsRes = body<{ data: { id: string; workTypeCount: number }[] }>(get("work-type-groups"));
t(
  "Бүлгийн ажлын төрлийн тоо гарна",
  groupsRes.data.every((g) => g.workTypeCount >= 0),
);
t(
  "Бүлгүүдийн нийлбэр нийт төрлийн тоотой таарна",
  groupsRes.data.reduce((a, g) => a + g.workTypeCount, 0) === getDb().workTypes.length,
);

const typesRes = body<{ data: { id: string; inUse: boolean }[] }>(
  get("work-types", "?pageSize=200"),
);
const usedType = typesRes.data.find((x) => x.inUse)!;
t("Ашиглагдаж буй төрөл тэмдэглэгдэнэ", Boolean(usedType));
t(
  "Ашиглагдаж буй төрлийг устгахгүй",
  handleMock("DELETE", ["work-types", usedType.id], "", undefined).status === 409,
);

const newType = post("work-types", {
  groupId: getDb().groups[0].id,
  name: "Хөвөн дулаалга",
  unit: "м2",
  level: "floor",
});
t("Шинэ ажлын төрөл нэмэгдлээ", newType.status === 201, String(newType.status));
const newTypeId = body<{ data: { id: string } }>(newType).data.id;
t(
  "Ашиглагдаагүй төрлийг устгана",
  handleMock("DELETE", ["work-types", newTypeId], "", undefined).status === 204,
);
t(
  "Нэргүй төрөл 422",
  post("work-types", { groupId: getDb().groups[0].id, unit: "ш" }).status === 422,
);

// --- Дараалал ---
const counts = body<{ data: Record<string, number> }>(
  get("projects/prj-inel-01/queue/counts"),
).data;
let queueMismatch = "";
for (const type of ["inspection", "returned", "overdue"] as const) {
  const listed = body<{ meta: { total: number } }>(
    get("projects/prj-inel-01/queue", `?type=${type}&pageSize=1`),
  ).meta.total;
  if (listed !== counts[type]) queueMismatch = `${type}: ${counts[type]} vs ${listed}`;
}
// Табын тоо ба жагсаалт зөрвөл хэрэглэгч "5 хүлээгдэж байна" гэж хараад
// хоосон жагсаалт нээнэ — итгэл тэр дор нь алдагдана.
t("Табын тоо жагсаалттай таарна", queueMismatch === "", queueMismatch);
t("Батлахыг хүлээж буй ажил байна", counts.inspection > 0, String(counts.inspection));

// --- Асуудал ---
const issueItem = getDb().workItems[0];
const issuesBefore = body<{ data: { openIssues: number } }>(get("projects/prj-inel-01/dashboard"))
  .data.openIssues;

const badIssue = post(`work-items/${issueItem.id}/issues`, {
  category: "байхгүй_ангилал",
  description: "Тест",
});
t("Танигдахгүй ангилал 422", badIssue.status === 422, String(badIssue.status));
t(
  "Тайлбаргүй бол 422",
  post(`work-items/${issueItem.id}/issues`, { category: "weather" }).status === 422,
);

const issueRes = post(`work-items/${issueItem.id}/issues`, {
  category: "material_shortage",
  severity: "high",
  description: "Гипсэн хавтан ирээгүй.",
});
t("Асуудал бүртгэгдлээ", issueRes.status === 201, String(issueRes.status));
t(
  "Ангиллын монгол нэр серверээс ирнэ",
  body<{ data: { categoryLabel: string } }>(issueRes).data.categoryLabel === "Материал дутсан",
);

const afterCreate = body<{ data: { openIssues: number } }>(get("projects/prj-inel-01/dashboard"))
  .data.openIssues;
// Урьд нь энэ тоо хатуу 0 байсан — хүснэгт нь байсан ч хэзээ ч уншигддаггүй байв.
t(
  "Dashboard нээлттэй асуудлыг тоолно",
  afterCreate === issuesBefore + 1,
  `${issuesBefore} → ${afterCreate}`,
);

// --- Саатлын жагсаалт: шүүлт ба байршил ---
interface IssueRow {
  id: string;
  status: string;
  category: string;
  blockName: string | null;
  locationPath: string | null;
  workItemName: string;
}
const issueList = (query: string) =>
  body<{ data: IssueRow[] }>(get("projects/prj-inel-01/issues", query)).data;

const openIssueList = issueList("?status=open");
// Барилгын нэр байхгүй бол 75 объектын жагсаалтад «3 давхар / 3А» гэсэн мөр
// аль байшин дээр байгаа нь мэдэгдэхгүй — жагсаалт нь ашиггүй болно.
t(
  "Саатлын мөр барилга, байршлаа авчирна",
  openIssueList.every((i) => i.blockName !== null && i.locationPath !== null),
  JSON.stringify(openIssueList[0] ?? null),
);
t(
  "Ангиллаар шүүнэ",
  issueList("?category=material_shortage").every((i) => i.category === "material_shortage") &&
    issueList("?category=material_shortage").length > 0,
);
t("Байхгүй ангилал хоосон буцаана", issueList("?category=accident").length === 0);
t(
  "Блокоор шүүнэ",
  issueList(`?blockId=${issueItem.blockId}`).length > 0 &&
    issueList("?blockId=байхгүй-блок").length === 0,
);

const issueId = body<{ data: { id: string } }>(issueRes).data.id;
const resolved = handleMock("PATCH", ["issues", issueId], "", {
  status: "resolved",
});
t(
  "Шийдвэрлэсэн гэж тэмдэглэнэ",
  body<{ data: { status: string } }>(resolved).data.status === "resolved",
);
t(
  "Шийдэгдсэн нь тооноос хасагдана",
  body<{ data: { openIssues: number } }>(get("projects/prj-inel-01/dashboard")).data.openIssues ===
    issuesBefore,
);

// --- Гүйцэтгэгч админы хэсэгт хандахгүй ---
login("GOO-2026");
t("Гүйцэтгэгч хэрэглэгчийн жагсаалт харахгүй", get("users").status === 403);
t(
  "Гүйцэтгэгч ажлын төрөл нэмэхгүй",
  post("work-types", {
    groupId: getDb().groups[0].id,
    name: "Хууль бус",
    unit: "ш",
    level: "block",
  }).status === 403,
);
handleMock("POST", ["auth", "login"], "", {
  email: "director@cpms.test",
  password: "x",
});

// ---------------------------------------------------------------------------
// Хянах самбар ба явцын гурван тоо
// ---------------------------------------------------------------------------
interface Counts {
  totalItems: number;
  completedItems: number;
  inProgressItems: number;
  notStartedItems: number;
}

interface Dash extends Counts {
  percentage: number;
  unmeasuredItems: number;
  plannedQty: number;
  reportedQty: number;
  acceptedQty: number;
  blocks: (Counts & {
    id: string;
    percentage: number;
    unmeasuredItems: number;
    plannedQty: number;
    reportedQty: number;
    acceptedQty: number;
    pendingInspections: number;
    overdue: number;
  })[];
  pendingInspections: number;
  overdueWorkItems: number;
  openIssues: number;
  issuesByCategory: { category: string; count: number }[];
}

const dashboard = body<{ data: Dash }>(get("projects/prj-inel-01/dashboard")).data;

// Гурван тоо нь ЗААВАЛ энэ дарааллаар байх ёстой. Мэдээлэгдсэн нь батлагдсанаас
// бага байвал батлагдсан хэмжээ хаанаас ч ирээгүй гэсэн үг — тоо эвдэрсэн.
t(
  "Батлагдсан ≤ мэдээлэгдсэн ≤ төлөвлөсөн",
  dashboard.acceptedQty <= dashboard.reportedQty + 0.01 &&
    dashboard.reportedQty <= dashboard.plannedQty + 0.01,
  `${dashboard.acceptedQty} / ${dashboard.reportedQty} / ${dashboard.plannedQty}`,
);
/*
 * Хувь нь АЖЛЫН ТООгоор бодогдоно.
 *
 * Урьд нь тоо хэмжээгээр бодогддог байсан нь м², м³, ширхгийг нийлүүлдэг
 * байв: «306,970 эхлээгүй» гэсэн тоо ЮУ 306,970 болохыг хэлж чадахгүй.
 */
// Дундаж нь БҮРЭН ДУУССАНААС их, ДУУССАН+ЯВЦТАЙгаас бага байх ёстой:
// дутуу ажил хагас оноо авдаг тул хоёрын хооронд гарна.
/*
 * Хуваарь нь ХЭМЖИГДЭХ мөрүүд — тоо хэмжээгүй ажил хувьд ордоггүй тул
 * хязгаарыг бодоход ч оруулахгүй. Нийт тоогоор хуваавал хязгаар худал
 * нарийсаж, ЗӨВ хувийг «алдаа» гэж зарлана.
 */
const measurableTotal = dashboard.totalItems - dashboard.unmeasuredItems;
const doneShare = (dashboard.completedItems / measurableTotal) * 100;
const startedShare =
  ((dashboard.completedItems + dashboard.inProgressItems) / measurableTotal) * 100;
t(
  "Дундаж хувь дууссан ба эхэлсний хооронд",
  dashboard.percentage >= Math.floor(doneShare) && dashboard.percentage <= Math.ceil(startedShare),
  `${dashboard.percentage}% · дууссан ${Math.round(doneShare)}% · эхэлсэн ${Math.round(startedShare)}%`,
);
/*
 * Самбар дээрх блокийн хувь ба блокийн ХУУДАС дээрх хувь ЯГ таарах ёстой.
 *
 * Энэ нь бодит алдаа байсан: самбар мөрүүдийн дундажаар, блокийн хуудас
 * тоо хэмжээгээр бодож, нэг блок 3% ба 11% гэж хоёр өөр харагдаж байв.
 * Хэрэглэгч алинд нь итгэхээ мэдэхгүй бол хоёулаа хэрэггүй.
 */
for (const b of dashboard.blocks) {
  const page = body<{
    data: { totals: { percentage: number; workItems: number } };
  }>(get(`blocks/${b.id}/summary`)).data.totals;

  t(
    `Самбар ба блокийн хуудас таарна (${b.id})`,
    page.percentage === b.percentage && page.workItems === b.totalItems,
    `самбар ${b.percentage}% / ${b.totalItems} · хуудас ${page.percentage}% / ${page.workItems}`,
  );
}

// Эхлээгүй барилга ЗААВАЛ 0% байх ёстой — дундаж нь хоосон мөрүүд дээр
// хуваагдаад бага зэрэг эерэг тоо өгвөл "ажил эхэлсэн" гэж андуурагдана.
t(
  "Эхлээгүй барилга 0% харагдана",
  dashboard.blocks.every(
    (b) => b.completedItems > 0 || b.inProgressItems > 0 || b.percentage === 0,
  ),
);

// Гурван бүлэг нь ХАРИЛЦАН ҮЛ ОГТЛОЛЦОХ ёстой — эс бөгөөс зурвасын хэсгүүд
// 100%-иас хэтэрч, эсвэл дутаж, хэрэглэгч ялгааг нь тайлбарлаж чадахгүй.
t(
  "Дууссан + явцтай + эхлээгүй = нийт",
  dashboard.completedItems + dashboard.inProgressItems + dashboard.notStartedItems ===
    dashboard.totalItems,
  `${dashboard.completedItems}+${dashboard.inProgressItems}+${dashboard.notStartedItems} vs ${dashboard.totalItems}`,
);
t(
  "Блок бүрт ч нийлбэр таарна",
  dashboard.blocks.every(
    (b) => b.completedItems + b.inProgressItems + b.notStartedItems === b.totalItems,
  ),
);
t(
  "Блокуудын ажлын тоо төслийн тоотой таарна",
  dashboard.blocks.reduce((a, b) => a + b.totalItems, 0) === dashboard.totalItems,
  `${dashboard.blocks.reduce((a, b) => a + b.totalItems, 0)} vs ${dashboard.totalItems}`,
);
// Блокуудын жинлэсэн дундаж нь төслийн хувьтай таарах ёстой — эс бөгөөс
// самбарын том тоо ба барилгын картууд хоорондоо зөрж, аль нь зөв болох нь
// мэдэгдэхгүй болно.
const weighted =
  dashboard.blocks.reduce((a, b) => a + b.percentage * b.totalItems, 0) / dashboard.totalItems;
t(
  "Блокуудын жинлэсэн дундаж төслийн хувьтай таарна",
  Math.abs(weighted - dashboard.percentage) < 1,
  `${round2(weighted)} vs ${dashboard.percentage}`,
);

// Блокуудын нийлбэр төслийн дүнтэй таарах ёстой — эс бөгөөс самбар дээрх
// ерөнхий хувь ба барилга тус бүрийн хувь зөрнө.
const blockSum = dashboard.blocks.reduce((a, b) => a + b.acceptedQty, 0);
t(
  "Блокуудын нийлбэр төслийн дүнтэй таарна",
  Math.abs(blockSum - dashboard.acceptedQty) < 0.5,
  `${round3(blockSum)} vs ${round3(dashboard.acceptedQty)}`,
);
t(
  "Блок бүрт батлах хүлээж буй тоо гарна",
  dashboard.blocks.every((b) => typeof b.pendingInspections === "number"),
);
t(
  "Самбарын нийт нь блокуудын нийлбэртэй таарна",
  dashboard.blocks.reduce((a, b) => a + b.pendingInspections, 0) === dashboard.pendingInspections,
);

// ---------------------------------------------------------------------------
// Тоо хэмжээгүй ажил
// ---------------------------------------------------------------------------
/*
 * Seed өгөгдөл одоо мөр бүрд тоо хэмжээ өгдөг тул энэ урсгалыг ЗОРИУД
 * үүсгэж шалгана — backend-ийн `PlanQuantityTest::zeroItems()`-тэй ижил.
 *
 * Бодит амьдрал дээр ийм мөр гардаг: гэрээгээр нэмэгдсэн ажил, шинээр
 * нэмсэн ажлын төрөл. Тэдгээр нь «0% хийгдсэн» БИШ, «хэмжих боломжгүй» —
 * хувийн хуваарьт орвол блокийн хувь худал доогуур гарна.
 */
{
  const zeroed = getDb().workItems.filter(
    (w) => w.blockId === "blk-a-01" && w.workTypeId === getDb().workItems[0].workTypeId,
  );
  for (const w of zeroed) {
    w.plannedQty = 0;
    w.reportedQty = 0;
    w.acceptedQty = 0;
    w.remainingQty = 0;
    w.percentage = 0;
    w.status = "not_started";
    w.reviewState = "none";
  }

  const dash = body<{ data: Dash }>(get("projects/prj-inel-01/dashboard")).data;
  const blockA = dash.blocks.find((b) => b.id === "blk-a-01")!;

  t(
    "Тоо хэмжээгүй ажил тоологдоно",
    blockA.unmeasuredItems === zeroed.length,
    `${blockA.unmeasuredItems} vs ${zeroed.length}`,
  );
  // Эдгээр нь «эхлээгүй»-гийн ДОТОР — тусдаа бүлэг биш.
  t(
    "Тоо хэмжээгүй нь эхлээгүйгийн дотор",
    blockA.unmeasuredItems <= blockA.notStartedItems,
    `${blockA.unmeasuredItems} vs ${blockA.notStartedItems}`,
  );

  // Хувь нь ЗӨВХӨН хэмжигдэх мөрүүдийн дунд бодогдоно.
  const measurable = getDb().workItems.filter((w) => w.blockId === "blk-a-01" && w.plannedQty > 0);
  const expected = Math.round(
    (measurable.reduce((a, w) => a + Math.min(w.acceptedQty / w.plannedQty, 1), 0) /
      measurable.length) *
      100,
  );
  t(
    "Хувь нь хэмжигдэх мөрүүдийн дунд бодогдоно",
    blockA.percentage === expected,
    `${blockA.percentage}% vs ${expected}%`,
  );

  // Нөхөх жагсаалт нь тэр мөрүүдийг ажлын төрлөөр нэгтгэнэ.
  const missing = body<{ data: { workTypeId: string; workItems: number }[] }>(
    get("blocks/blk-a-01/missing-quantities"),
  ).data;
  t("Нөхөх жагсаалт гарна", missing.length === 1, `${missing.length} ажлын төрөл`);
  t(
    "Жагсаалтын нийлбэр самбартай таарна",
    missing.reduce((a, r) => a + r.workItems, 0) === blockA.unmeasuredItems,
  );

  // Нэг удаа бөглөхөд тухайн төрлийн БҮХ мөрд тарна.
  const filled = body<{ data: { affected: number } }>(
    post("blocks/blk-a-01/work-items/set-quantity", {
      workTypeId: missing[0].workTypeId,
      plannedQty: 12.5,
    }),
  ).data;
  t(
    "Нэг удаа бөглөхөд бүх мөрд тарна",
    filled.affected === missing[0].workItems,
    `${filled.affected} vs ${missing[0].workItems}`,
  );

  const after = body<{ data: Dash }>(get("projects/prj-inel-01/dashboard")).data;
  t(
    "Нөхсөний дараа хэмжээгүй ажил үлдсэнгүй",
    after.blocks.find((b) => b.id === "blk-a-01")!.unmeasuredItems === 0,
  );
  t(
    "Нөхсөн төрөл жагсаалтаас гарна",
    body<{ data: unknown[] }>(get("blocks/blk-a-01/missing-quantities")).data.length === 0,
  );
}

// ---------------------------------------------------------------------------
// Блокийн хамрах хүрээ — талбайн инженер
// ---------------------------------------------------------------------------
/*
 * БОДИТ АЛДАА БАЙСАН: блокийн ЖАГСААЛТ хамрах хүрээгээр шүүгддэг байсан ч
 * ХЯНАХ САМБАР, ДАРААЛАЛ шүүгддэггүй байв. Нэг барилга хариуцсан инженер
 * самбар дээр 75 барилгын тоог хараад, карт дээр нь дарахад 403 авна.
 * Дээрээс нь «таны ажил 3% явлаа» гэсэн тоо огт өөр барилгуудынх байсан.
 */
{
  const allBlocks = getDb().blocks;
  const mine = allBlocks[0];
  const scopedEmail = "site_engineer@cpms.test";

  const engineer = body<{ data: { id: string; email: string }[] }>(get("users")).data.find(
    (u) => u.email === scopedEmail,
  )!;
  handleMock("PATCH", ["users", engineer.id], "", { scopeBlockIds: [mine.id] });
  handleMock("POST", ["auth", "login"], "", {
    email: scopedEmail,
    password: "x",
  });

  t(
    "Хүрээ нь /me-д ирнэ",
    body<{ data: { scopeBlockIds: string[] } }>(get("me")).data.scopeBlockIds.length === 1,
  );

  const blockList = body<{ data: { id: string }[] }>(get("projects/prj-inel-01/blocks")).data;
  t(
    "Жагсаалтад зөвхөн өөрийн барилга",
    blockList.length === 1 && blockList[0].id === mine.id,
    `${blockList.length} барилга`,
  );

  const scopedDash = body<{ data: Dash }>(get("projects/prj-inel-01/dashboard")).data;
  t(
    "Самбарт зөвхөн өөрийн барилга",
    scopedDash.blocks.length === 1 && scopedDash.blocks[0].id === mine.id,
    `${scopedDash.blocks.length} барилга`,
  );
  // Ажлын тоо нь тухайн барилгынхтай ЯГ таарна — өөр барилгын мөр гоожвол
  // энэ тоо өснө.
  const ownItems = getDb().workItems.filter((w) => w.blockId === mine.id).length;
  t(
    "Самбарын ажлын тоо өөрийн барилгынх",
    scopedDash.totalItems === ownItems,
    `${scopedDash.totalItems} vs ${ownItems}`,
  );

  const scopedQueue = body<{ data: { blockId: string }[] }>(
    get("projects/prj-inel-01/queue", "?type=inspection&pageSize=200"),
  ).data;
  t(
    "Дараалалд бусад барилгын ажил алга",
    scopedQueue.every((w) => w.blockId === mine.id),
    `${scopedQueue.filter((w) => w.blockId !== mine.id).length} гадны мөр`,
  );

  // Хязгаарлалт нь зөвхөн гоо сайхны зүйл болж болохгүй — шууд хаягаар ч
  // нэвтэрч болохгүй.
  const other = allBlocks.find((bl) => bl.id !== mine.id)!;
  t("Гадны блок 403", get(`blocks/${other.id}`).status === 403);
  t("Өөрийн блок нээгдэнэ", get(`blocks/${mine.id}`).status === 200);
  t("Гадны блокийн нэгтгэл 403", get(`blocks/${other.id}/summary`).status === 403);

  // Цэвэрлэгээ: хүрээг нь авч, захирлаар буцаж нэвтэрнэ.
  handleMock("POST", ["auth", "login"], "", {
    email: "director@cpms.test",
    password: "x",
  });
  handleMock("PATCH", ["users", engineer.id], "", { scopeBlockIds: [] });
  t(
    "Хүрээ авахад бүх барилга буцаж ирнэ",
    body<{ data: unknown[] }>(get("projects/prj-inel-01/blocks")).data.length === allBlocks.length,
  );
}

// Блокийн нэгтгэлд товлосон дуусах огноо
interface DateWindow {
  plannedStartDate: string | null;
  plannedEndDate: string | null;
}
const sumDates = body<{
  data: { totals: DateWindow; groups: (DateWindow & { label: string })[] };
}>(get("blocks/blk-a-01/summary", "?groupBy=floor")).data;
t(
  "Блокийн товлосон огноо гарна",
  Boolean(sumDates.totals.plannedEndDate),
  String(sumDates.totals.plannedEndDate),
);
/*
 * Бүлэг бүр ЭХЛЭХ огноотой байх ёстой.
 *
 * Огноог хэрэглэгч бичдэггүй — давхрын хугацаагаар автоматаар бодогддог.
 * Тиймээс хоосон огноо гарвал хуваарь огт тооцогдоогүй гэсэн үг бөгөөд
 * хоцролтын бүх тоо утгагүй болно.
 */
t(
  "Бүлэг бүр эхлэх, дуусах огноотой",
  sumDates.groups.every((g) => Boolean(g.plannedStartDate && g.plannedEndDate)),
  `${sumDates.groups.filter((g) => !g.plannedStartDate).length} бүлэг огноогүй`,
);
t(
  "Эхлэх огноо дуусахаасаа өмнө",
  sumDates.groups.every((g) => (g.plannedStartDate ?? "") <= (g.plannedEndDate ?? "")),
);
t(
  "Блокийн эхлэл нь бүлгүүдийн хамгийн эртийнх",
  sumDates.totals.plannedStartDate ===
    sumDates.groups
      .map((g) => g.plannedStartDate)
      .filter(Boolean)
      .sort()
      .at(0),
  String(sumDates.totals.plannedStartDate),
);
// Дээд давхар доод давхраасаа ХОЙШ эхэлнэ — давхрын хугацааны гол зүй тогтол.
// Энэ зөрчигдвөл «галт тэрэг» урсгал алдагдаж, бүх ажил нэг өдөр эхэлнэ.
const floor2 = sumDates.groups.find((g) => g.label === "2-р давхар");
const floor15 = sumDates.groups.find((g) => g.label === "15-р давхар");
t(
  "Дээд давхар хожуу эхэлнэ",
  Boolean(floor2 && floor15 && floor2.plannedStartDate! < floor15.plannedStartDate!),
  `2-р ${floor2?.plannedStartDate} · 15-р ${floor15?.plannedStartDate}`,
);
t(
  "Блокийн огноо нь бүлгүүдийн хамгийн сүүлийнх",
  sumDates.totals.plannedEndDate ===
    sumDates.groups
      .map((g) => g.plannedEndDate)
      .filter(Boolean)
      .sort()
      .at(-1),
);

// ---------------------------------------------------------------------------
// Олон блоктой үед самбар холилдох эсэх
// ---------------------------------------------------------------------------
// Захиалагчид 75 барилга байна. Блокуудын тоо холилдож байвал самбар бүхэлдээ
// утгагүй — тиймээс энэ нь заавал шалгагдах ёстой.
for (const [name, no] of [
  ["В блок", "20"],
  ["Г блок", "21"],
] as const) {
  const nb = body<{ data: { id: string } }>(
    handleMock("POST", ["projects", "prj-inel-01", "blocks"], "", {
      name,
      buildingNo: no,
      designId: "dsg-4-svc",
      startDate: "2026-09-01",
    }),
  ).data;
  const j = body<{ data: { id: string } }>(
    handleMock("POST", ["block-designs", "dsg-4-svc", "apply"], "", {
      blockId: nb.id,
    }),
  ).data;
  for (let k = 0; k < 30; k++) get(`jobs/${j.id}`);
}

const multi = body<{ data: Dash }>(get("projects/prj-inel-01/dashboard")).data;
t("Олон блок самбарт гарна", multi.blocks.length >= 4, String(multi.blocks.length));
t("Блокийн id давхардахгүй", new Set(multi.blocks.map((b) => b.id)).size === multi.blocks.length);

// Блок бүрийн тоо нь ЗӨВХӨН өөрийнх байх ёстой — хөрш блокийн ажил
// хутгалдвал "Б блок 40%" гэж худал харагдана.
let leak = "";
for (const b of multi.blocks) {
  const own = getDb().workItems.filter((w) => w.blockId === b.id);
  const ownPlanned = own.reduce((a, w) => a + w.plannedQty, 0);
  if (Math.abs(ownPlanned - b.plannedQty) > 0.5)
    leak = `${b.id}: ${b.plannedQty} vs ${round3(ownPlanned)}`;
}
t("Блок бүр зөвхөн өөрийн тоог харуулна", leak === "", leak);

// Самбарын дээд тоо ба блокуудын нийлбэр таарах ёстой. Урьд нь энд босго
// зөрж (`>= 3` vs `> 0`) 52 vs 56 гэж зөрж байсан.
t(
  "Хоцорсны нийт нь блокуудын нийлбэртэй таарна",
  multi.blocks.reduce((a, b) => a + b.overdue, 0) === multi.overdueWorkItems,
  `${multi.blocks.reduce((a, b) => a + b.overdue, 0)} vs ${multi.overdueWorkItems}`,
);

// Дарааллын тоо ба самбарын хайрцаг ижил босго ашиглах ёстой — хэрэглэгч
// "52 хоцорсон" дараад 56 мөртэй жагсаалт нээх ёсгүй.
const qc = body<{ data: { overdue: number; inspection: number } }>(
  get("projects/prj-inel-01/queue/counts"),
).data;
t(
  "Самбар ба дараалал ижил тоо хэлнэ",
  qc.overdue === multi.overdueWorkItems,
  `${qc.overdue} vs ${multi.overdueWorkItems}`,
);
t(
  "Батлах хүлээж буй нь мөн таарна",
  qc.inspection === multi.pendingInspections,
  `${qc.inspection} vs ${multi.pendingInspections}`,
);

// ---------------------------------------------------------------------------
// Чанарын шалгах хуудас (checklist)
// ---------------------------------------------------------------------------
// Захиалагчийн дүрэм: "Зөвхөн зураг дээр үндэслэн ажил батлахгүй."
// Энэ хэсэг нь тэр дүрэм КОД дотор үнэхээр мөрдөгдөж байгаа эсэхийг шалгана.
interface Tmpl {
  id: string;
  name: string;
  items: { id: string; text: string; isRequired: boolean }[];
}

const templates = body<{ data: Tmpl[] }>(get("checklist-templates")).data;
t("Чанарын хуудасны загвар байна", templates.length > 0, String(templates.length));

// Загвартай бүлгийн ажлыг олно.
const guarded = getDb().workItems.find(
  (w) => w.workType.groupName === "Угсралт" && w.remainingQty > 30,
)!;
t("Загвартай ажил олдлоо", Boolean(guarded), guarded?.name);

const tmpl = body<{ data: Tmpl | null }>(get(`work-items/${guarded.id}/checklist`)).data;
t("Ажилд хуудас хамаарна", Boolean(tmpl), tmpl?.name);
const required = tmpl!.items.filter((i) => i.isRequired);
t("Заавал зүйлүүд байна", required.length > 0, String(required.length));

// Батлахын өмнө гүйцэтгэл мэдээлнэ.
handleMock("POST", ["work-items", guarded.id, "progress"], "", {
  completedQty: 5,
});

const inspect = (payload: Record<string, unknown>) =>
  handleMock("POST", ["work-items", guarded.id, "inspections"], "", payload);

// 1. Хуудас бөглөхгүйгээр батлах — хориглоно. Энэ бол гол шалгалт.
const noChecklist = inspect({
  stage: "client",
  result: "accepted",
  acceptedQty: 5,
});
t("Хуудасгүйгээр батлахгүй", noChecklist.status === 422, String(noChecklist.status));

// 2. Дутуу бөглөвөл мөн хориглоно.
const partialFill = inspect({
  stage: "client",
  result: "accepted",
  acceptedQty: 5,
  checklist: [{ itemId: required[0].id, result: "pass" }],
});
t(
  "Дутуу бөглөвөл батлахгүй",
  required.length === 1 || partialFill.status === 422,
  String(partialFill.status),
);

// 3. Заавал зүйл тэнцээгүй бол батлах боломжгүй.
const withFail = inspect({
  stage: "client",
  result: "accepted",
  acceptedQty: 5,
  checklist: tmpl!.items.map((i, idx) => ({
    itemId: i.id,
    result: idx === 0 ? "fail" : "pass",
  })),
});
t("Тэнцээгүй зүйлтэй бол батлахгүй", withFail.status === 422, String(withFail.status));

// 4. Гэхдээ ТАТГАЛЗАХ боломжтой — тэнцээгүй байх нь яг буцаах шалтгаан.
const rejectWithFail = inspect({
  stage: "client",
  result: "rejected",
  acceptedQty: 0,
  reason: "Хамгаалалтын давхарга хүрэлцэхгүй",
  checklist: tmpl!.items.map((i, idx) => ({
    itemId: i.id,
    result: idx === 0 ? "fail" : "pass",
  })),
});
t("Тэнцээгүй үед татгалзаж болно", rejectWithFail.status === 201, String(rejectWithFail.status));

// 5. Танигдахгүй зүйл илгээвэл хориглоно — өөр загварын хариулт орж ирэх эрсдэл.
const bogus = inspect({
  stage: "client",
  result: "accepted",
  acceptedQty: 1,
  checklist: [{ itemId: "cli-байхгүй", result: "pass" }],
});
t("Танигдахгүй зүйл 422", bogus.status === 422, String(bogus.status));

// 6. Бүгд тэнцсэн бол батлагдана.
handleMock("POST", ["work-items", guarded.id, "progress"], "", {
  completedQty: 3,
});
const okInspect = inspect({
  stage: "client",
  result: "accepted",
  acceptedQty: 1,
  checklist: tmpl!.items.map((i) => ({ itemId: i.id, result: "pass" })),
});
t("Бүгд тэнцсэн бол батлагдана", okInspect.status === 201, String(okInspect.status));

// 7. Загваргүй бүлгийн ажил хаалтгүй хэвээр — тохируулаагүй газарт талбайг
//    гацаах ёсгүй.
const free = getDb().workItems.find(
  (w) =>
    !["Угсралт", "Өрлөг", "Засал", "цахилгаан", "сантехник"].includes(w.workType.groupName) &&
    w.remainingQty > 20,
)!;
t("Загваргүй ажил олдлоо", Boolean(free), free?.workType.groupName);
t(
  "Загваргүй ажилд хуудас шаардахгүй",
  body<{ data: Tmpl | null }>(get(`work-items/${free.id}/checklist`)).data === null,
);
handleMock("POST", ["work-items", free.id, "progress"], "", {
  completedQty: 4,
});
const freeInspect = handleMock("POST", ["work-items", free.id, "inspections"], "", {
  stage: "client",
  result: "accepted",
  acceptedQty: 4,
});
t("Загваргүй ажил хэвийн батлагдана", freeInspect.status === 201, String(freeInspect.status));

/** Тухайн ажилд чанарын хуудас хамаарвал түүний зүйлүүдийн id. */
function checklistItemIds(workItemId: string): string[] | null {
  const tmpl = body<{ data: { items: { id: string }[] } | null }>(
    get(`work-items/${workItemId}/checklist`),
  ).data;

  return tmpl ? tmpl.items.map((i) => i.id) : null;
}

// ---------------------------------------------------------------------------
// Төлөвлөгөөт тоо хэмжээ гүйцээх
// ---------------------------------------------------------------------------
// Захиалагчийн Хавсралт-2-т ~30 ажлын төрлийн тоо хэмжээ хоосон байсан.
// Тэдгээр ажилд үлдэгдэл 0 тул ГҮЙЦЭТГЭЛ ОРУУЛАХ БОЛОМЖГҮЙ болдог.
//
// Mock-ийн seed бүх ажилд тоо хэмжээ өгдөг тул нөхцөлийг ЭНД өөрсдөө үүсгэнэ —
// жинхэнэ backend дээр `qty_per_location` null байхад ингэж үүсдэг.
const victimType = getDb().workTypes.find((wt) => wt.level === "unit")!;
const victims = getDb().workItems.filter(
  (w) => w.blockId === "blk-a-01" && w.workTypeId === victimType.id,
);
t("Туршилтын ажлын төрөл олдлоо", victims.length > 1, `${victimType.name}: ${victims.length}`);

for (const w of victims) {
  w.plannedQty = 0;
  w.reportedQty = 0;
  w.acceptedQty = 0;
  w.remainingQty = 0;
  w.percentage = 0;
}

interface Missing {
  workTypeId: string;
  name: string;
  workItems: number;
}

const missing = body<{ data: Missing[] }>(get("blocks/blk-a-01/missing-quantities")).data;
const listed = missing.find((m) => m.workTypeId === victimType.id);
t("Дутуу жагсаалтад орлоо", listed?.workItems === victims.length, String(listed?.workItems));

const zeroItem = victims[0];

// 1. Тоо хэмжээгүй бол гүйцэтгэл оруулах боломжгүй — асуудлыг батлана.
t(
  "Тоо хэмжээгүй бол явц оруулахгүй",
  handleMock("POST", ["work-items", zeroItem.id, "progress"], "", {
    completedQty: 1,
  }).status === 422,
);

// 2. Нэг ажилд тоо хэмжээ оруулна.
t(
  "Нэг ажилд тоо хэмжээ орлоо",
  handleMock("PATCH", ["work-items", zeroItem.id], "", { plannedQty: 25 }).status === 200,
);
t("Үлдэгдэл шинэчлэгдсэн", zeroItem.remainingQty === 25, String(zeroItem.remainingQty));

// 3. Одоо явц орно — ГОЛ шалгалт. Энэ унавал хэрэглэгч гацсан хэвээр.
t(
  "Тоо хэмжээ орсны дараа явц орно",
  handleMock("POST", ["work-items", zeroItem.id, "progress"], "", {
    completedQty: 10,
  }).status === 201,
);

// 4. Батлагдсанаас бага болгох боломжгүй — хувь 100-аас давахаас сэргийлнэ.
const ids = checklistItemIds(zeroItem.id);
handleMock("POST", ["work-items", zeroItem.id, "inspections"], "", {
  stage: "client",
  result: "accepted",
  acceptedQty: 10,
  ...(ids ? { checklist: ids.map((id) => ({ itemId: id, result: "pass" })) } : {}),
});
t("Батлагдсан 10 боллоо", zeroItem.acceptedQty === 10, String(zeroItem.acceptedQty));
t(
  "Батлагдсанаас бага төлөвлөгөө 409",
  handleMock("PATCH", ["work-items", zeroItem.id], "", { plannedQty: 1 }).status === 409,
);

// 5. Бөөнөөр оруулах — 144 мөрийг гараар бөглөх нь боломжгүй.
const stillZero = victims.filter((w) => w.plannedQty === 0).length;
const bulk = handleMock("POST", ["blocks", "blk-a-01", "work-items", "set-quantity"], "", {
  workTypeId: victimType.id,
  plannedQty: 12,
});
t("Бөөнөөр оруулав", bulk.status === 200, String(bulk.status));
t(
  "Бүх хоосон мөр хамрагдсан",
  body<{ data: { affected: number } }>(bulk).data.affected === stillZero,
  `${body<{ data: { affected: number } }>(bulk).data.affected} vs ${stillZero}`,
);
t(
  "Тэр төрөлд дутуу үлдсэнгүй",
  victims.every((w) => w.plannedQty > 0),
);

// 6. Аль хэдийн бөглөсөн мөрийг ДАРЖ БИЧИХГҮЙ — засах гэж байгаад зөв
//    өгөгдлийг устгах нь хамгийн муу үр дүн.
t("Гараар оруулсан 25 хэвээр", zeroItem.plannedQty === 25, String(zeroItem.plannedQty));

// 7. Гүйцэтгэгч төлөвлөгөө засахгүй — тоо хэмжээ бол гэрээний асуудал.
login("GOO-2026");
t(
  "Гүйцэтгэгч тоо хэмжээ засахгүй",
  handleMock("PATCH", ["work-items", zeroItem.id], "", { plannedQty: 5 }).status === 403,
);
handleMock("POST", ["auth", "login"], "", {
  email: "director@cpms.test",
  password: "x",
});

// ---------------------------------------------------------------------------
// Ажилд хариуцагч оноох
// ---------------------------------------------------------------------------
// `ApplyBlockDesign` нь ажлыг ХАРИУЦАГЧГҮЙ үүсгэдэг. Оноох зам байхгүй бол
// гүйцэтгэгчийн бүхэл функц (нэвтрэх код, хамрах хүрээ, явц оруулах) шинэ
// блок дээр өгөгдөлгүй үлдэнэ.
interface AssignRow {
  groupId: string;
  groupName: string;
  workItems: number;
  unassigned: number;
  contractors: { id: string; name: string; workItems: number }[];
}

// Шинээр үүсгэсэн блок дээр шалгана — seed-ийн блок аль хэдийн оноогдсон.
const freshBlock = body<{ data: { id: string } }>(
  handleMock("POST", ["projects", "prj-inel-01", "blocks"], "", {
    name: "Оноолтын тест блок",
    buildingNo: "99",
    designId: "dsg-4-svc",
    startDate: "2026-09-01",
  }),
).data;
const freshJob = body<{ data: { id: string } }>(
  handleMock("POST", ["block-designs", "dsg-4-svc", "apply"], "", {
    blockId: freshBlock.id,
  }),
).data;
for (let k = 0; k < 30; k++) get(`jobs/${freshJob.id}`);

const assignBefore = body<{ data: AssignRow[] }>(get(`blocks/${freshBlock.id}/assignments`)).data;
const totalUnassigned = assignBefore.reduce((a, r) => a + r.unassigned, 0);
const totalItems = assignBefore.reduce((a, r) => a + r.workItems, 0);

// Энэ бол илэрсэн алдаа: шинэ блокийн БҮХ ажил хариуцагчгүй үүснэ.
t(
  "Шинэ блокийн ажил хариуцагчгүй үүснэ",
  totalUnassigned === totalItems && totalItems > 0,
  `${totalUnassigned} / ${totalItems}`,
);

// Хамгийн олон ажилтай бүлгийг сонгоно — 1 мөртэй бүлэг дээр шалгавал
// бөөний оноолт үнэхээр ажиллаж байгаа эсэх нь батлагдахгүй.
const target = [...assignBefore].sort((a, b) => b.unassigned - a.unassigned)[0];
t("Олон ажилтай бүлэг сонгов", target.unassigned > 1, `${target.groupName}: ${target.unassigned}`);
const goo = getDb().contractors.find((c) => c.name === "Гоо Засал ХХК")!;

const assigned = handleMock("POST", ["blocks", freshBlock.id, "work-items", "assign"], "", {
  workTypeGroupId: target.groupId,
  contractorId: goo.id,
});
t("Бүлгээр оноолоо", assigned.status === 200, String(assigned.status));
t(
  "Бүх хариуцагчгүй ажил хамрагдсан",
  body<{ data: { affected: number } }>(assigned).data.affected === target.unassigned,
);

const after = body<{ data: AssignRow[] }>(get(`blocks/${freshBlock.id}/assignments`)).data;
const targetAfter = after.find((r) => r.groupId === target.groupId)!;
t("Тэр бүлэгт хариуцагчгүй үлдсэнгүй", targetAfter.unassigned === 0);
t(
  "Хариуцагч зөв бүртгэгдсэн",
  targetAfter.contractors.some((c) => c.id === goo.id && c.workItems === target.unassigned),
);

// Бүлэг/төрөл заахгүй бол 422 — санамсаргүйгээр бүх ажлыг оноохоос сэргийлнэ.
t(
  "Зорилтгүй оноолт 422",
  handleMock("POST", ["blocks", freshBlock.id, "work-items", "assign"], "", {
    contractorId: goo.id,
  }).status === 422,
);

/*
 * Гүйцэтгэл бүртгэгдсэн ажлын хариуцагчийг солихгүй — түүх өөр компанид
 * шилжинэ.
 *
 * ХЭМЖИГДЭХ мөр сонгоно: загварын 47 ажлын төрлөөс 30 нь тоо хэмжээгүй тул
 * `remainingQty` нь 0, гүйцэтгэл огт оруулж болохгүй. Бөөний оноолт нь
 * хамгийн олон мөртэй бүлгийг сонгодог бөгөөд тэр нь тоо хэмжээгүй бүлэг
 * байж болно.
 */
const workedItem = getDb().workItems.find(
  (w) => w.blockId === freshBlock.id && w.plannedQty > 5 && w.remainingQty > 5,
)!;
handleMock("PATCH", ["work-items", workedItem.id, "contractor"], "", {
  contractorId: goo.id,
});
handleMock("POST", ["work-items", workedItem.id, "progress"], "", {
  completedQty: 2,
});
const other = getDb().contractors.find((c) => c.id !== goo.id)!;
t(
  "Ажилласан ажлын хариуцагчийг солихгүй",
  handleMock("PATCH", ["work-items", workedItem.id, "contractor"], "", {
    contractorId: other.id,
  }).status === 409,
);

// Оноосон даруйд гүйцэтгэгч ажлаа ХАРНА — гол зорилго нь энэ.
login("GOO-2026");
const repSees = body<{ meta: { total: number } }>(
  get(`blocks/${freshBlock.id}/work-items`, "?pageSize=1"),
).meta.total;
// Бүлгээр оноосон мөрүүд + дээр нь гараар оноосон нэг мөр.
const expectedForRep = target.unassigned + (workedItem.contractor?.id === goo.id ? 1 : 0);
t(
  "Оноосны дараа гүйцэтгэгч ажлаа харна",
  repSees === expectedForRep,
  `${repSees} vs ${expectedForRep}`,
);

// Гүйцэтгэгч өөрөө хариуцагч оноохгүй — гэрээний шийдвэр.
t(
  "Гүйцэтгэгч оноох эрхгүй",
  handleMock("POST", ["blocks", freshBlock.id, "work-items", "assign"], "", {
    workTypeGroupId: target.groupId,
    contractorId: goo.id,
  }).status === 403,
);
handleMock("POST", ["auth", "login"], "", {
  email: "director@cpms.test",
  password: "x",
});

// ---------------------------------------------------------------------------
// Загваргүй (хоосон) блок
// ---------------------------------------------------------------------------
// 75 барилгыг бүгдийг нь загвартай үүсгэвэл ~247,000 мөр төрнө. Эхэлж байгаа
// барилгад нь л ажил үүсгэх нь зөв тул "одоо бүртгээд дараа буулгах" зам
// байх ёстой.
const emptyBlock = body<{
  data: { id: string; floors: number; unitCount: number };
}>(
  handleMock("POST", ["projects", "prj-inel-01", "blocks"], "", {
    name: "Хоосон блок",
    buildingNo: "77",
    floors: 5,
    unitsPerFloor: 4,
    purpose: "Орон сууц",
  }),
).data;
t("Загваргүй блок үүслээ", Boolean(emptyBlock?.id), emptyBlock?.id);
t("Давхар, айл нь бичигдсэн", emptyBlock.floors === 5 && emptyBlock.unitCount === 20);

// Давхрын тоогүй бол үүсэхгүй — байршил үүсгэх мэдээлэлгүй болно.
t(
  "Загваргүй, давхаргүй бол 422",
  handleMock("POST", ["projects", "prj-inel-01", "blocks"], "", {
    name: "Мэдээлэлгүй",
  }).status === 422,
);

// Байршил нь ТЭР ДОР НЬ үүснэ — эс бөгөөс ажил нэмэх газар байхгүй.
const emptyLocs = body<{ data: { level: string }[] }>(
  get(`blocks/${emptyBlock.id}/locations`),
).data;
t(
  "Байршил үүссэн: 1 блок + 6 давхар + 20 айл = 27",
  emptyLocs.length === 27,
  String(emptyLocs.length),
);
t(
  "Ажил үүсээгүй",
  body<{ meta: { total: number } }>(get(`blocks/${emptyBlock.id}/work-items`)).meta.total === 0,
);

// --- Ажлын төрлийг гараар нэмэх ---
const floorType = getDb().workTypes.find((w) => w.level === "floor")!;
const added = handleMock("POST", ["blocks", emptyBlock.id, "work-items"], "", {
  workTypeId: floorType.id,
  plannedQty: 30,
});
t("Ажлын төрөл нэмэгдлээ", added.status === 201, String(added.status));
// Давхрын түвшний ажил — зоорь + 5 давхар = 6 мөр.
t(
  "Түвшний бүх байршилд мөр үүссэн",
  body<{ data: { created: number } }>(added).data.created === 6,
  String(body<{ data: { created: number } }>(added).data.created),
);

// Давхардвал тоо хэмжээ давхарлаж, гүйцэтгэлийн хувь худал болно.
t(
  "Дахин нэмэхэд 409",
  handleMock("POST", ["blocks", emptyBlock.id, "work-items"], "", {
    workTypeId: floorType.id,
    plannedQty: 30,
  }).status === 409,
);

// Айлын түвшний ажил — 5 давхар × 4 айл = 20 мөр.
const unitType = getDb().workTypes.find((w) => w.level === "unit")!;
const addedUnits = handleMock("POST", ["blocks", emptyBlock.id, "work-items"], "", {
  workTypeId: unitType.id,
  plannedQty: 8,
});

// ОЛНООР нэмэх — барилгын төлөвлөлт "нэг давхарт ямар ажлууд" гэсэн багцаар
// явдаг тул 15 удаа диалог нээх нь бодит урсгалд тохирохгүй.
const floorTypes = getDb()
  .workTypes.filter((w) => w.level === "floor" && w.id !== floorType.id)
  .slice(0, 3);
const bulkAdd = handleMock("POST", ["blocks", emptyBlock.id, "work-items"], "", {
  workTypeIds: floorTypes.map((w) => w.id),
  plannedQty: 5,
});
t("Олон төрлийг нэг дор нэмэв", bulkAdd.status === 201, String(bulkAdd.status));
t(
  "3 төрөл × 6 давхар = 18 мөр",
  body<{ data: { created: number } }>(bulkAdd).data.created === floorTypes.length * 6,
  String(body<{ data: { created: number } }>(bulkAdd).data.created),
);

// Давхардсаныг алгасаад үлдсэнийг нь нэмнэ — бүхэлд нь унагах ёсгүй.
const mixed = getDb()
  .workTypes.filter((w) => w.level === "floor")
  .slice(0, 5);
const partial = handleMock("POST", ["blocks", emptyBlock.id, "work-items"], "", {
  workTypeIds: mixed.map((w) => w.id),
  plannedQty: 5,
});
// --- Давхрын хугацаа (хуваарь) ---
// Гараар нэмсэн ажил огноотой байх ёстой: огноогүй бол хоцролт хэзээ ч
// тооцогдохгүй, "Хугацаа хэтэрсэн" самбар үүрд хоосон харагдана.
{
  const rows = getDb()
    .workItems.filter((w) => w.blockId === emptyBlock.id && w.location.level === "floor")
    .sort((a, b) => a.location.path.localeCompare(b.location.path));
  t("Гараар нэмсэн ажилд огноо бий", Boolean(rows[0]?.plannedEndDate), rows[0]?.plannedEndDate);
  t(
    "Дуусах огноо эхлэхээсээ хойно",
    rows.every((w) => (w.plannedEndDate ?? "") >= (w.plannedStartDate ?? "")),
  );

  const starts = [...new Set(rows.map((w) => w.plannedStartDate))].sort();
  t("Давхрууд өөр өөр өдөр эхэлнэ", starts.length > 1, starts.join(" · "));

  // Амралтын өдөр дуусдаг төлөвлөгөө нь эхнээсээ худал.
  const weekend = rows.filter((w) => {
    const d = new Date(`${w.plannedEndDate}T00:00:00Z`).getUTCDay();
    return d === 0 || d === 6;
  });
  t("Огноо амралтын өдөр таарахгүй", weekend.length === 0, String(weekend.length));
}

// Давхрын хугацаа уртсахад хуваарь сунана.
const beforeEnd = Math.max(
  ...getDb()
    .workItems.filter((w) => w.blockId === emptyBlock.id)
    .map((w) => Date.parse(`${w.plannedEndDate}T00:00:00Z`)),
);
const resched = handleMock("POST", ["blocks", emptyBlock.id, "schedule"], "", {
  taktDays: 12,
});
t("Хуваарь дахин татав", resched.status === 200, String(resched.status));
t("Батлагдаагүй ажлууд шинэчлэгдэв", body<{ data: { updated: number } }>(resched).data.updated > 0);
const afterEnd = Math.max(
  ...getDb()
    .workItems.filter((w) => w.blockId === emptyBlock.id)
    .map((w) => Date.parse(`${w.plannedEndDate}T00:00:00Z`)),
);
t("Давхрын хугацаа уртсахад хуваарь сунав", afterEnd > beforeEnd, `${beforeEnd} → ${afterEnd}`);

const badTakt = handleMock("POST", ["blocks", emptyBlock.id, "schedule"], "", {
  taktDays: 0,
});
t("Давхрын хугацаа 0 бол 422", badTakt.status === 422, String(badTakt.status));

t(
  "Давхардсаныг алгасаад үлдсэнийг нэмнэ",
  partial.status === 201 || partial.status === 409,
  String(partial.status),
);
if (partial.status === 201) {
  t("Алгассаныг мэдээлнэ", body<{ data: { skipped: unknown[] } }>(partial).data.skipped.length > 0);
}
t(
  "Айлын түвшинд 20 мөр",
  body<{ data: { created: number } }>(addedUnits).data.created === 20,
  String(body<{ data: { created: number } }>(addedUnits).data.created),
);

// Нэмсэн ажилд гүйцэтгэл шууд орох ёстой — тоо хэмжээтэй үүссэн.
const addedItem = getDb().workItems.find(
  (w) => w.blockId === emptyBlock.id && w.workTypeId === floorType.id,
)!;
t(
  "Гараар нэмсэн ажилд явц орно",
  handleMock("POST", ["work-items", addedItem.id, "progress"], "", {
    completedQty: 5,
  }).status === 201,
);

// --- Дараа нь загвар буулгах ---
const emptyBlock2 = body<{ data: { id: string } }>(
  handleMock("POST", ["projects", "prj-inel-01", "blocks"], "", {
    name: "Дараа загвартай",
    buildingNo: "78",
    floors: 4,
    unitsPerFloor: 0,
  }),
).data;
const locsBefore = body<{ data: unknown[] }>(get(`blocks/${emptyBlock2.id}/locations`)).data.length;

const laterJob = handleMock("POST", ["block-designs", "dsg-4-svc", "apply"], "", {
  blockId: emptyBlock2.id,
});
t("Загваргүй блокт дараа нь загвар буулгана", laterJob.status === 202, String(laterJob.status));
const lj = body<{ data: { id: string } }>(laterJob).data;
for (let k = 0; k < 30; k++) get(`jobs/${lj.id}`);

t(
  "Загвар буулгасны дараа ажил үүссэн",
  body<{ meta: { total: number } }>(get(`blocks/${emptyBlock2.id}/work-items`)).meta.total > 0,
);
// ХАМГИЙН ЧУХАЛ: байршил ДАХИН үүсэх ёсгүй — тэгвэл бүх тоо хоёр дахин болно.
t(
  "Байршил давхардсангүй",
  body<{ data: unknown[] }>(get(`blocks/${emptyBlock2.id}/locations`)).data.length === locsBefore,
  `${body<{ data: unknown[] }>(get(`blocks/${emptyBlock2.id}/locations`)).data.length} vs ${locsBefore}`,
);

// --- Ажлыг устгах (гараар нэмсэн, буруу бүртгэсэн) ---
const delType = getDb().workTypes.find(
  (w) => w.level === "block" && w.id !== floorType.id && w.id !== unitType.id,
)!;
handleMock("POST", ["blocks", emptyBlock.id, "work-items"], "", {
  workTypeId: delType.id,
  plannedQty: 10,
});
const toDelete = getDb().workItems.find(
  (w) => w.blockId === emptyBlock.id && w.workTypeId === delType.id,
)!;
t("Устгах ажил үүслээ", Boolean(toDelete));
t(
  "Гүйцэтгэлгүй ажлыг устгана",
  handleMock("DELETE", ["work-items", toDelete.id], "", undefined).status === 204,
);
t("Жагсаалтаас алга болсон", !getDb().workItems.some((w) => w.id === toDelete.id));

// Гүйцэтгэл орсон ажлыг устгавал түүх алга болно.
const worked = getDb().workItems.find((w) => w.blockId === emptyBlock.id && w.reportedQty > 0)!;
t(
  "Гүйцэтгэлтэй ажлыг устгахгүй",
  handleMock("DELETE", ["work-items", worked.id], "", undefined).status === 409,
);

// Гүйцэтгэгч ажил устгахгүй — төлөвлөгөөний шийдвэр.
login("GOO-2026");
const someItem = getDb().workItems.find((w) => w.contractor?.id === "ctr-5")!;
t(
  "Гүйцэтгэгч ажил устгахгүй",
  handleMock("DELETE", ["work-items", someItem.id], "", undefined).status === 403,
);
handleMock("POST", ["auth", "login"], "", {
  email: "director@cpms.test",
  password: "x",
});

// --- Буцаагдсан ажлыг ДАХИН илгээх ---
// ЯАГААД ЧУХАЛ: татгалзсан хэмжээ мэдээлсэн дүнгээс хасагдахгүй бол
// «үлдэгдэл 0» болж, гүйцэтгэгч засвараа огт илгээж чадахгүй болно.
// Мөн тусдаа «дахин хийх» мөр үүсгэвэл блокийн төлөвлөгөө хоёр дахин болно.
{
  const target = getDb().workItems.find(
    (w) => w.plannedQty > 30 && w.reportedQty === 0 && w.blockId === "blk-a-01",
  )!;
  const planned = target.plannedQty;
  const rowsBefore = getDb().workItems.length;

  handleMock("POST", ["work-items", target.id, "progress"], "", {
    completedQty: planned,
  });
  t("Бүх хэмжээг мэдээлэв", target.reportedQty === planned, String(target.reportedQty));
  t("Мэдээлсний дараа pending", target.reviewState === "pending", target.reviewState);

  const rej = handleMock("POST", ["work-items", target.id, "inspections"], "", {
    stage: "client",
    result: "rejected",
    acceptedQty: 0,
    reason: "Гадаргуу тэгш бус",
  });
  t("Татгалзал 201", rej.status === 201, String(rej.status));
  t("Татгалзсаны дараа returned", target.reviewState === "returned", target.reviewState);
  t(
    "Татгалзсан хэмжээ мэдээлсэн дүнгээс хасагдав",
    target.reportedQty === 0,
    String(target.reportedQty),
  );
  t(
    "Үлдэгдэл эргэж бүтэн болов",
    target.remainingQty === planned,
    `${target.remainingQty} / ${planned}`,
  );
  t(
    "Давхардсан «дахин хийх» мөр үүсээгүй",
    getDb().workItems.length === rowsBefore,
    `${getDb().workItems.length} vs ${rowsBefore}`,
  );

  // Засвараа ижил мөрөн дээрээ дахин илгээнэ.
  const again = handleMock("POST", ["work-items", target.id, "progress"], "", {
    completedQty: planned,
  });
  t("Дахин илгээх боломжтой", again.status === 201, String(again.status));
  t(
    "Дахин илгээвэл хянагдахаар дараалалд орно",
    target.reviewState === "pending",
    target.reviewState,
  );

  handleMock("POST", ["work-items", target.id, "inspections"], "", {
    stage: "client",
    result: "accepted",
    acceptedQty: planned,
  });
  t("Эцэст нь 100% болно", target.percentage === 100, `${target.percentage}%`);
  t("Төлөв нь дууссан", target.status === "completed", target.status);
}

// --- Гүйцэтгэлийн акт ---
// ЯАГААД ШАЛГАХ ЁСТОЙ: акт нь захиалагчтай тооцоо хийх баримт. Хугацааны
// шүүлт алдвал өнгөрсөн сарын ажил дахин актлагдаж, давхар тооцоо гарна.
{
  const wide = body<{
    data: {
      groups: {
        name: string;
        rows: { inspectedAt: string; acceptedQty: number; unit: string }[];
      }[];
      totals: { unit: string; qty: number }[];
      inspectionCount: number;
      workItemCount: number;
    };
  }>(get("projects/prj-inel-01/reports/acceptance", "?from=2020-01-01&to=2030-12-31")).data;

  t("Акт мөр буцаана", wide.inspectionCount > 0, String(wide.inspectionCount));
  t("Ажлын тоо шалгалтаас их биш", wide.workItemCount <= wide.inspectionCount);
  t(
    "Нэгж тус бүрээр дүн гарна",
    wide.totals.length > 0 && wide.totals.every((x) => x.unit && x.qty > 0),
    wide.totals.map((x) => `${x.qty} ${x.unit}`).join(" · "),
  );
  // Бүлгийн дүнгүүдийн нийлбэр нь нийт дүнтэй ЯГ таарах ёстой — актын
  // хамгийн чухал шалгуур. Зөрвөл захиалагчтай тооцоо буруу гарна.
  const perUnit = new Map<string, number>();
  for (const g of wide.groups) {
    for (const row of g.rows) {
      perUnit.set(row.unit, round3((perUnit.get(row.unit) ?? 0) + row.acceptedQty));
    }
  }
  const mismatched = wide.totals.filter((x) => Math.abs((perUnit.get(x.unit) ?? 0) - x.qty) > 0.01);
  t(
    "Мөрүүдийн нийлбэр нийт дүнтэй таарна",
    mismatched.length === 0,
    mismatched.map((x) => `${x.unit}: ${perUnit.get(x.unit)} vs ${x.qty}`).join(", "),
  );

  // Хугацааны шүүлт үнэхээр ажиллаж байгаа эсэх.
  const narrow = body<{ data: { inspectionCount: number } }>(
    get("projects/prj-inel-01/reports/acceptance", "?from=2020-01-01&to=2020-01-31"),
  ).data;
  t("Хоосон хугацаанд мөр гарахгүй", narrow.inspectionCount === 0, String(narrow.inspectionCount));

  // Мөр бүрийн огноо хүсэлтийн хүрээнд байх ёстой.
  const mid = body<{
    data: { groups: { rows: { inspectedAt: string }[] }[] };
  }>(get("projects/prj-inel-01/reports/acceptance", "?from=2026-01-01&to=2026-06-30")).data;
  const outside = mid.groups
    .flatMap((g) => g.rows)
    .filter(
      (r) => r.inspectedAt.slice(0, 10) < "2026-01-01" || r.inspectedAt.slice(0, 10) > "2026-06-30",
    );
  t("Мөр бүр хугацаанд багтана", outside.length === 0, String(outside.length));

  // Огноо буруу бол 422.
  const bad = get("projects/prj-inel-01/reports/acceptance", "?from=2026-06-30&to=2026-01-01");
  t("Урвуу хугацаа бол 422", bad.status === 422, String(bad.status));

  // Гүйцэтгэгчийн шүүлт.
  const one = body<{ data: { contractor: { name: string } | null } }>(
    get(
      "projects/prj-inel-01/reports/acceptance",
      "?from=2020-01-01&to=2030-12-31&contractorId=ctr-5",
    ),
  ).data;
  t(
    "Гүйцэтгэгч сонгоход нэр нь буцна",
    Boolean(one.contractor?.name),
    String(one.contractor?.name),
  );

  // Гүйцэтгэгчийн сессэд ЗӨВХӨН өөрийн ажил.
  login("GOO-2026");
  const mine = body<{
    data: { groups: { rows: { workItemId: string }[] }[] };
  }>(get("projects/prj-inel-01/reports/acceptance", "?from=2020-01-01&to=2030-12-31")).data;
  const ids = new Set(mine.groups.flatMap((g) => g.rows).map((r) => r.workItemId));
  const foreign = [...ids].filter((id) => getDb().byId.get(id)?.contractor?.id !== "ctr-5");
  t("Гүйцэтгэгчийн актад бусдын ажил ороогүй", foreign.length === 0, String(foreign.length));
  handleMock("POST", ["auth", "login"], "", {
    email: "director@cpms.test",
    password: "x",
  });
}

// --- Backend прокси ---
// ЯАГААД: прокси нэгэн үе хариуг текст болгож уншдаг байсан тул Excel файл
// эвдэрч «corrupted» болдог байв. Энд толгойн дамжуулалтыг шалгана.
{
  const upstream = new Headers({
    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": 'attachment; filename="akt-goo-2026-09-01_2026-09-30.xlsx"',
    "content-length": "4821",
    "set-cookie": "session=secret",
  });
  const out = forwardResponseHeaders(upstream);

  t("Файлын төрөл дамжина", out.get("content-type")?.includes("spreadsheetml") === true);
  t(
    "Файлын нэр дамжина",
    out.get("content-disposition")?.includes("akt-goo") === true,
    String(out.get("content-disposition")),
  );
  t("Cookie дамжихгүй", out.get("set-cookie") === null);
  t(
    "Төрөлгүй хариу JSON гэж үзэгдэнэ",
    forwardResponseHeaders(new Headers()).get("content-type") === "application/json",
  );
  t("204-д их бие байхгүй", responseHasBody(204) === false);
  t("200-д их бие байна", responseHasBody(200) === true);
}

// --- Зургийн хаяг ---
// Frontend ба backend тус тусдаа шинэчлэгддэг тул хоёр хэлбэрийг зэрэг
// дэмжинэ. Үүнгүйгээр шинэчлэлтийн хооронд хаяг наалдаж зураг эвдэрнэ.
t(
  "Харьцангуй хаягт проксигийн угтвар нэмэгдэнэ",
  photoUrl({ url: "/photos/abc/file?signature=x" }) === "/api/cpms/photos/abc/file?signature=x",
  photoUrl({ url: "/photos/abc/file?signature=x" }),
);
t(
  "Ташуу зураасгүй байсан ч зөв нийлнэ",
  photoUrl({ url: "photos/abc/file" }) === "/api/cpms/photos/abc/file",
  photoUrl({ url: "photos/abc/file" }),
);
t(
  "Бүтэн хаягийг хэвээр үлдээнэ (хуучин backend)",
  photoUrl({ url: "http://127.0.0.1/api/v1/photos/abc/file" }) ===
    "http://127.0.0.1/api/v1/photos/abc/file",
);

// --- Хугацаа сунгах ---
// ЯАГААД ЧУХАЛ: огноог чимээгүй хойшлуулж болдог бол «хугацаа хэтэрсэн»
// гэсэн тоо утгагүй болно. Шалтгаан заавал бичигдэж, асуудлын бүртгэлд
// хадгалагдах ёстой.
{
  const late = getDb().workItems.find(
    (w) => w.overdueDays > 0 && w.status !== "completed" && w.blockId === "blk-a-01",
  )!;
  const before = late.plannedEndDate;
  const path = ["work-items", late.id, "extend"];
  const future = "2030-12-31";

  t("Шалтгаангүй бол 422", handleMock("POST", path, "", { plannedEndDate: future }).status === 422);
  t(
    "Тайлбаргүй бол 422",
    handleMock("POST", path, "", {
      plannedEndDate: future,
      category: "weather",
    }).status === 422,
  );
  t(
    "Огноог урагш татвал 422",
    handleMock("POST", path, "", {
      plannedEndDate: "2000-01-01",
      category: "weather",
      reason: "x",
    }).status === 422,
  );

  const issuesBefore = body<{ data: unknown[] }>(get(`work-items/${late.id}/issues`)).data.length;
  const res = handleMock("POST", path, "", {
    plannedEndDate: future,
    category: "material_shortage",
    reason: "Цонхны хүргэлт хоцорсон.",
  });

  t("Сунгалт 200", res.status === 200, String(res.status));
  t("Огноо шинэчлэгдэв", late.plannedEndDate === future, String(late.plannedEndDate));
  t("Хоцролт тэглэгдэв", late.overdueDays === 0, String(late.overdueDays));

  const issuesAfter = body<{
    data: { description: string; categoryLabel: string }[];
  }>(get(`work-items/${late.id}/issues`)).data;
  t("Шалтгаан асуудлын бүртгэлд орлоо", issuesAfter.length === issuesBefore + 1);
  t(
    "Хуучин огноо тайлбарт үлдэв",
    issuesAfter[0].description.includes(String(before)) &&
      issuesAfter[0].description.includes(future),
    issuesAfter[0].description,
  );
  t("Ангилал хадгалагдав", issuesAfter[0].categoryLabel === "Материал дутсан");

  // Гүйцэтгэгч төлөвлөгөө засах эрхгүй.
  login("GOO-2026");
  t(
    "Гүйцэтгэгч хугацаа сунгахгүй",
    handleMock("POST", path, "", {
      plannedEndDate: "2031-01-01",
      category: "weather",
      reason: "x",
    }).status === 403,
  );
  handleMock("POST", ["auth", "login"], "", {
    email: "director@cpms.test",
    password: "x",
  });
}

console.log("\nАмжилтгүй: " + fail);
process.exit(fail ? 1 : 0);
