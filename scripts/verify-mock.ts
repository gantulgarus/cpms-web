import * as nodeFs from "node:fs";
import * as nodePath from "node:path";

import { handleMock } from "../lib/mock/handler";
import { forwardResponseHeaders, responseHasBody } from "../lib/proxy";
import { photoUrl } from "../lib/photo-url";
import { getDb, GROUP_ORDER } from "../lib/mock/store";

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

/**
 * Ажлыг БҮРЭН батална — хоёр шатыг хоёр ӨӨР хүнээр дамжуулна.
 *
 * Хоёр шаттай болсон тул «батлах» нь нэг дуудлага биш. Нэг хүн хоёр шатыг
 * ч хийж чадахгүй (backend 403 буцаана) тул 1-р шатыг талбайн инженер,
 * 2-рыг захирал хийнэ. Эцэст нь сессийг БУЦААЖ сэргээнэ — эс бөгөөс
 * дараагийн шалгуурууд өөр хүний эрхээр ажиллана.
 */
function approveFully(itemId: string, checklist?: { itemId: string; result: string }[]) {
  const login = (email: string) =>
    handleMock("POST", ["auth", "login"], "", { email, password: "x" });

  const extra = checklist ? { checklist } : {};
  const row = getDb().byId.get(itemId)!;

  /*
   * Хэмжээг ӨГӨГДЛӨӨС авна, гараар бичихгүй.
   *
   * Шатны сан нь `мэдээлсэн − шалгасан` ба `шалгасан − баталсан`. Тоог
   * гараар бичвэл өмнөх шалгуурууд тухайн мөрийг хөндсөн үед чимээгүй
   * 422 аваад, үр дүн нь хол доошоо «батлагдсан 0» гэж гарна.
   */
  login("admin@cpms.test");
  const allocations = handleMock("GET", ["blocks", row.blockId, "site-engineer-assignments"], "", undefined).body as { data: { engineers: { id: string }[] } };
  handleMock("POST", ["blocks", row.blockId, "site-engineer-assignments"], "", {
    workTypeGroupId: db.workTypes.find((w) => w.id === row.workTypeId)!.groupId,
    siteEngineerId: allocations.data.engineers[0]?.id,
  });
  login("site_engineer@cpms.test");
  const check = handleMock("POST", ["work-items", itemId, "inspections"], "", {
    stage: "site_check",
    result: "accepted",
    acceptedQty: round3(row.reportedQty - (row.checkedQty ?? 0)),
    ...extra,
  });

  login("admin@cpms.test");
  const approve = handleMock("POST", ["work-items", itemId, "inspections"], "", {
    stage: "final_approval",
    result: "accepted",
    acceptedQty: round3((row.checkedQty ?? 0) - row.acceptedQty),
    ...extra,
  });

  return { check, approve };
}

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

/*
 * Хүлээгдэж буй мөрийн тоог ЛАВЛАХ САНГААС БОДНО, гараар бичихгүй.
 *
 * Урьд нь 3,290 гэж бичсэн байв. Ажлын төрөл нэмэгдэх бүрд 11 шалгуур зэрэг
 * унаж, тоог нь гараар засдаг байсан — өөрөөр хэлбэл шалгуур юу ч
 * хамгаалахаа больж, зөвхөн ажил нэмдэг байв.
 */
/*
 * Байршлын тоог ӨГӨГДЛӨӨС тоолно, гараар бичихгүй.
 *
 * Техникийн давхар нэмэгдэхэд 17 → 18 давхар, 144 → 148 айл болсон.
 * Гараар бичсэн бол 15 шалгуур зэрэг унана — яг тэр болсон.
 */
const LOCS_PER_LEVEL: Record<string, number> = seedLocations.reduce(
  (acc, l) => ({ ...acc, [l.level]: (acc[l.level] ?? 0) + 1 }),
  {} as Record<string, number>,
);
const SEED_ITEMS = db.workTypes.reduce((sum, wt) => sum + (LOCS_PER_LEVEL[wt.level] ?? 0), 0);

/*
 * Нэг блокт зарлагдсан давхраас ХЭД ИЛҮҮ байршил үүсэх, техникийн давхарт
 * хэдэн зай байхыг ӨГӨГДЛӨӨС бодно.
 *
 * Одоогоор +2 давхар (зоорь, техникийн) ба 4 зай. Гараар бичвэл дараагийн
 * удаа давхар нэмэхэд арав гаруй шалгуур зэрэг унана — яг тэр болсон.
 */
const techFloor = seedLocations.find((l) => l.level === "floor" && l.name === "Техникийн давхар")!;
const TECH_SPACES = seedLocations.filter((l) => l.parentId === techFloor.id).length;
const EXTRA_FLOORS = LOCS_PER_LEVEL.floor - db.blocks.find((b) => b.id === "blk-a-01")!.floors;
t(
  `Блок бүрт нэмэлт ${EXTRA_FLOORS} давхар, техникийн давхарт ${TECH_SPACES} зай`,
  EXTRA_FLOORS === 2 && TECH_SPACES === 4,
  `${EXTRA_FLOORS} / ${TECH_SPACES}`,
);
t(
  `Анхны блокийн WorkItem ${SEED_ITEMS.toLocaleString("mn-MN")}`,
  seedItems.length === SEED_ITEMS,
  `${seedItems.length} vs ${SEED_ITEMS}`,
);
t(
  `Байршил: ${LOCS_PER_LEVEL.block} блок + ${LOCS_PER_LEVEL.floor} давхар + ${LOCS_PER_LEVEL.unit} айл`,
  seedLocations.length === LOCS_PER_LEVEL.block + LOCS_PER_LEVEL.floor + LOCS_PER_LEVEL.unit,
  String(seedLocations.length),
);
t(
  "Demo нь олон блоктой — жагсаалт, харьцуулалтын дэлгэц ганц мөр байж болохгүй",
  db.blocks.length >= 4,
  `${db.blocks.length} блок`,
);
t("Ажлын төрөл бүртгэгдсэн", db.workTypes.length >= 47, `${db.workTypes.length} төрөл`);

// Хуудаслалт
const p1 = body<{ data: unknown[]; meta: { total: number } }>(
  get("blocks/blk-a-01/work-items", "?page=1&pageSize=50"),
);
t("Хуудас 50 мөр буцаана", p1.data.length === 50, String(p1.data.length));
t("meta.total бүх мөрийг заана", p1.meta.total === SEED_ITEMS, String(p1.meta.total));
const cap = body<{ data: unknown[] }>(get("blocks/blk-a-01/work-items", "?pageSize=9999"));
t("pageSize 200-аар таслагдана", cap.data.length === 200, String(cap.data.length));

// Шүүлтүүр
const f5 = body<{ meta: { total: number } }>(
  get("blocks/blk-a-01/work-items", "?locationId=loc-blk-a-01-f-5"),
);
const f5d = body<{ meta: { total: number } }>(
  get("blocks/blk-a-01/work-items", "?locationId=loc-blk-a-01-f-5&includeDescendants=true"),
);
/*
 * Давхрын ажлын тоо = давхрын түвшний төрлийн тоо.
 * Удам хамруулбал дээр нь айлын түвшний төрөл × 9 айл нэмэгдэнэ.
 *
 * Тоог гараар бичихгүй: ажлын төрөл нэмэгдэх бүрд энэ хоёр шалгуур унана.
 */
const FLOOR_TYPES = db.workTypes.filter((w) => w.level === "floor").length;
const UNIT_TYPES = db.workTypes.filter((w) => w.level === "unit").length;
t(
  `5-р давхрын өөрийн ажил ${FLOOR_TYPES}`,
  f5.meta.total === FLOOR_TYPES,
  `${f5.meta.total} vs ${FLOOR_TYPES}`,
);
t(
  `Айлууд нь хамрагдвал ${FLOOR_TYPES} + ${UNIT_TYPES}×9`,
  f5d.meta.total === FLOOR_TYPES + UNIT_TYPES * 9,
  `${f5d.meta.total} vs ${FLOOR_TYPES + UNIT_TYPES * 9}`,
);
const pend = body<{ meta: { total: number } }>(
  get("blocks/blk-a-01/work-items", "?reviewState=pending"),
);
t(
  "Хүлээгдэж буй шүүлтүүр ажиллана",
  pend.meta.total > 0 && pend.meta.total < SEED_ITEMS,
  String(pend.meta.total),
);

// Нэгтгэл
const sum = body<{
  data: {
    totals: { workItems: number };
    groups: { label: string; workItems: number }[];
  };
}>(get("blocks/blk-a-01/summary", "?groupBy=floor"));
// Давхар бүр нэг бүлэг, дээр нь «Барилга бүхэлдээ».
const FLOOR_GROUPS = LOCS_PER_LEVEL.floor + 1;
t(
  `Давхраар нэгтгэвэл ${FLOOR_GROUPS} бүлэг`,
  sum.data.groups.length === FLOOR_GROUPS,
  String(sum.data.groups.length),
);
t(
  "Нэгтгэлийн нийлбэр нийт мөртэй тэнцэнэ",
  sum.data.groups.reduce((a, g) => a + g.workItems, 0) === SEED_ITEMS,
);
t(
  "Эхний бүлэг барилгын түвшний ажил",
  sum.data.groups[0].label === "Барилга бүхэлдээ",
  sum.data.groups[0].label,
);
t("Хоёр дахь нь зоорь", sum.data.groups[1].label === "Зоорийн давхар", sum.data.groups[1].label);
const byC = body<{ data: { groups: { label: string }[] } }>(
  get("blocks/blk-a-01/summary", "?groupBy=contractor"),
);
/*
 * ГАНЦ мөрийн хариуцагчийг солих.
 *
 * Бүлгээр оноох нь 1,889 мөрийг хөдөлгөдөг тул нэг айлын хаалгыг өөр
 * компанид өгөхөд тохиромжгүй. Сервер дээр эндпойнт бэлэн байсан ч дуудах
 * цонх байгаагүй — одоо нэмэгдсэн тул mock-д ч ажиллахыг шалгана.
 */
{
  const goo2 = getDb().contractors[0];
  // Гүйцэтгэл ОРООГҮЙ мөр — орсон бол сервер солихыг хориглоно.
  const free = getDb().workItems.find((w) => w.reportedQty === 0)!;
  const originalContractorId = free.contractor?.id ?? null;

  const res = handleMock("PATCH", ["work-items", free.id, "contractor"], "", {
    contractorId: goo2.id,
  });
  t("Ганц мөрд хариуцагч оноож болно", res.status === 200, String(res.status));
  t("Хариуцагч бүртгэгдсэн", free.contractor?.id === goo2.id);

  // Хоосон утга илгээвэл хариуцагчийг АВНА — буруу оноосныг буцаах зам.
  handleMock("PATCH", ["work-items", free.id, "contractor"], "", { contractorId: null });
  t("Хариуцагчийг авч болно", !free.contractor);

  // Дараагийн шалгуурууд энэ мөрийг тоолдог тул ХУУЧИН байдалд нь буцаана.
  handleMock("PATCH", ["work-items", free.id, "contractor"], "", {
    contractorId: originalContractorId,
  });
}

/*
 * --- Хяналт шалгалт хариуцах инженер ---
 *
 * Төсвийн «Хяналт шалгалт хийх инженер» баганаас оногддог. Хамгийн чухал
 * хориг нь БАТЛАХ ЭРХГҮЙ хүнийг оноож болохгүй гэдэг: оноовол тэр ажил
 * мөнхөд батлагдахгүй гацах бөгөөд шалтгаан нь дэлгэц дээр хаана ч
 * харагдахгүй.
 */
{
  const target = getDb().workItems.find((w) => w.inspector)!;
  t("Ажилд хяналтын инженер оноогдсон", Boolean(target), target?.inspector?.name);
  t(
    "Албан тушаал ч хамт ирнэ — ижил үүрэгтэй хүмүүсийг ялгана",
    Boolean(target.inspector?.position),
    target.inspector?.position ?? "—",
  );

  /*
   * Mock-ийн ажлын мөр дээрх оноолт хэрэглэгчийн ЖАГСААЛТАД байх ёстой.
   * Хоёр файлд тусад нь бичсэн тул id зөрвөл дэлгэц «олдохгүй хүн»
   * харуулна — зөвхөн гараар нээж байж мэдэгдэх алдаа.
   */
  const users = body<{ data: { id: string; name: string; canInspect: boolean }[] }>(
    get("users"),
  ).data;
  const assigned = users.find((u) => String(u.id) === String(target.inspector!.id));
  t("Оноогдсон инженер хэрэглэгчийн жагсаалтад бий", Boolean(assigned), target.inspector?.name);
  t("Оноогдсон инженер батлах эрхтэй", assigned?.canInspect === true);

  // Жинхэнэ staff.json дээр хяналт хариуцдаг хүн гэрээний мэргэжилтэн байдаг.
  t(
    "Албан тушаал нь «хяналтын инженер» биш хүн ч хяналт хариуцаж байна",
    users.some((u) => u.canInspect && u.name === "Б.Сайхантамир"),
  );

  /*
   * Хяналтын инженер СОНГОХ жагсаалт нь оноох эрхтэй бүх үүрэгт нээлттэй.
   *
   * `/users` нь зөвхөн админ, захиралд нээлттэй. Хэрэв цонх түүнийг
   * дууддаг бол ерөнхий инженер 403 аваад жагсаалт хоосон гарна —
   * дэлгэцээс харагдахгүй, зөвхөн жинхэнэ хэрэглэгчийн гарт тулж мэдэх
   * алдаа. Тиймээс `/users/inspectors` гэсэн тусдаа зам шалгагдана.
   */
  const choices = body<{ data: { id: string; name: string; position: string | null }[] }>(
    get("users/inspectors"),
  ).data;
  t("Сонгох жагсаалт хоосон биш", choices.length > 0, `${choices.length} хүн`);
  t(
    "Жагсаалтад батлах эрхгүй хүн ороогүй",
    choices.every((c) => users.find((u) => String(u.id) === String(c.id))?.canInspect === true),
  );
  t(
    "Албан тушаал нь жагсаалтад ирнэ",
    choices.some((c) => Boolean(c.position)),
    choices.map((c) => c.position ?? "—").join(" · "),
  );

  const insp = getDb().workItems.find((w) => w.inspector)!;
  const original = insp.inspector!.id;

  // Хоосон илгээвэл авна — төсвөөс хасагдсан хариуцлага үлдэх ёсгүй.
  t(
    "Хяналтын инженерийг авч болно",
    handleMock("PATCH", ["work-items", insp.id, "inspector"], "", { inspectorId: null })
      .status === 200,
  );
  t("Инженер хоосон болов", !insp.inspector);

  // ГОЛ ХОРИГ: батлах эрхгүй хүнийг оноож болохгүй.
  const reporter = users.find((u) => !u.canInspect)!;
  const refused = handleMock("PATCH", ["work-items", insp.id, "inspector"], "", {
    inspectorId: reporter.id,
  });
  t("Батлах эрхгүй хүнийг оноохгүй → 422", refused.status === 422, String(refused.status));
  t("Татгалзсаны дараа хоосон хэвээр", !insp.inspector);

  t(
    "Байхгүй хэрэглэгч → 422",
    handleMock("PATCH", ["work-items", insp.id, "inspector"], "", { inspectorId: "usr-байхгүй" })
      .status === 422,
  );

  // Буцааж онооно — доорх шалгуурууд энэ мөрийг тоолно.
  handleMock("PATCH", ["work-items", insp.id, "inspector"], "", { inspectorId: original });
  t("Дахин оноогдов", insp.inspector?.id === original);

  /*
   * Эрхийн ПАРИТЕТ: `/me` нь backend-тэй ижил эрх буцаах ёстой.
   *
   * Урьд нь mock-д `canManageContractors` нь admin, director гэж бичигдсэн
   * байв; backend дээр төслийн менежер БАС эрхтэй. Дэлгэц mock-ийг үзэж
   * бүтээгддэг тул тэр товчийг нуух шийдвэр чимээгүй гарах эрсдэлтэй байв.
   */
  {
    const roleRights: Record<
      string,
      { contractors: boolean; inspectors: boolean; extensions: boolean }
    > = {
      admin: { contractors: true, inspectors: true, extensions: true },
      /*
       * ЗАХИРАЛ ЮУ Ч ХИЙХГҮЙ.
       *
       * Удирдлагын эрхийг «бүх зүйлд хүрнэ» гэж ойлговол хяналт утгагүй
       * болно: хэн ч захирлаар батлуулж, «мэдээлэгч ба батлагч өөр хүн»
       * гэсэн дүрмийг тойрч болно. Захирлын ажил нь ХАРАХ.
       */
      director: { contractors: false, inspectors: false, extensions: false },
      /*
       * Төслийн менежер сунгалт БАТЛАХГҮЙ.
       *
       * Хуваарийн гулсалтыг хамгийн их нуумаар байдаг хүн нь тэр хуваарийг
       * хариуцдаг хүн. Тиймээс гүйцэтгэгч оноох эрхтэй ч сунгалт батлах
       * эрхгүй — энэ зөрүү зориудынх.
       */
      project_manager: { contractors: true, inspectors: true, extensions: false },
      general_engineer: { contractors: false, inspectors: true, extensions: true },
      site_engineer: { contractors: false, inspectors: false, extensions: false },
      inspector: { contractors: false, inspectors: false, extensions: false },
    };

    for (const [role, want] of Object.entries(roleRights)) {
      /*
       * Хэрэглэгч үүсгэхийн ТУТАМД захирлаар дахин нэвтэрнэ.
       *
       * Эс бөгөөс өмнөх давталтын үүргээр (жишээ нь төслийн менежер)
       * үүсгэх гэж оролдож 403 авна, дараа нь байхгүй и-мэйлээр нэвтрэхэд
       * mock нь анхдагч ЗАХИРЛЫН сесс буцаана — тэгээд шалгуур «бүх эрхтэй»
       * гэж уншаад хуурамчаар унана. Яг тэр болсон.
       */
      handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });

      const created = body<{ data: { id: string } }>(
        handleMock("POST", ["users"], "", {
          name: `Эрх ${role}`,
          email: `rights-${role}@cpms.test`,
          role,
        }),
      ).data;

      t(`${role}: хэрэглэгч үүслээ`, Boolean(created?.id), created?.id);

      handleMock("POST", ["auth", "login"], "", {
        email: `rights-${role}@cpms.test`,
        password: "x",
      });

      const me = body<{
        data: {
          role: string;
          canManageContractors: boolean;
          canAssignInspectors: boolean;
          canApproveExtensions: boolean;
        };
      }>(get("me")).data;

      /*
       * Нэвтэрсэн хүн ЯГ ТЭР эсэхийг эхлээд шалгана. Mock нь олдоогүй
       * и-мэйлийг анхдагч сессээр хувааж буцаадаг тул үүнгүйгээр доорх
       * шалгуур өөр хүний эрхийг хэмжиж байж болно.
       */
      t(`${role}: тэр хүнээр нэвтэрлээ`, me.role === role, me.role);

      t(
        `${role}: гүйцэтгэгч=${want.contractors} хяналт=${want.inspectors} сунгалт=${want.extensions}`,
        me.canManageContractors === want.contractors &&
          me.canAssignInspectors === want.inspectors &&
          me.canApproveExtensions === want.extensions,
        `${me.canManageContractors} / ${me.canAssignInspectors} / ${me.canApproveExtensions}`,
      );
    }

    handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });
  }

  // --- Шүүлтүүр ---
  const none = body<{ meta: { total: number } }>(
    get("blocks/blk-a-01/work-items", "?inspectorId=none&pageSize=1"),
  ).meta.total;
  const mine = body<{ meta: { total: number } }>(
    get("blocks/blk-a-01/work-items", `?inspectorId=${original}&pageSize=1`),
  ).meta.total;

  /*
   * Хоёулаа 0-ээс их байх ёстой. Төсвийн 64 мөрийн 36-д инженер заагаагүй
   * тул «хариуцагчгүй» самбар ҮРГЭЛЖ агуулгатай байна — mock-д бүх бүлгийг
   * хамруулбал тэр дэлгэц хэзээ ч шалгагдахгүй.
   */
  t(`Инженергүй ажил бий: ${none}`, none > 0, String(none));
  t(`Нэг инженерийн ажил: ${mine}`, mine > 0, String(mine));
  t(
    "Инженергүй + оноогдсон нь нийт мөрөөс хэтрэхгүй",
    none + mine <= SEED_ITEMS,
    `${none} + ${mine} vs ${SEED_ITEMS}`,
  );
}

/*
 * --- Хоёр шаттай каскад ---
 *
 * Дэлгэц нь батлах дээд хязгаарыг СЕРВЭРЭЭС (`stagePool`) уншина. Хэрэв
 * сервер ба дэлгэц хоёр өөрөөр бодвол товч нь 40 санал болгоод сервер
 * 10-аас илүүг татгалзаж, хэрэглэгч шалтгааныг ойлгохгүй.
 */
{
  const login = (email: string) =>
    handleMock("POST", ["auth", "login"], "", { email, password: "x" });

  login("site_engineer@cpms.test");
  const row = getDb().workItems.find((w) => w.plannedQty > 50 && w.reportedQty === 0)!;
  handleMock("POST", ["work-items", row.id, "progress"], "", { completedQty: 40 });

  const fresh = () =>
    body<{ data: { nextStage: string | null; stagePool: number; checkedQty: number } }>(
      get(`work-items/${row.id}`),
    ).data;

  let view = fresh();
  t("Мэдээлсний дараа 1-р шат хүлээнэ", view.nextStage === "site_check", String(view.nextStage));
  t("1-р шатны сан = мэдээлсэн дүн", view.stagePool === 40, String(view.stagePool));

  handleMock("POST", ["work-items", row.id, "inspections"], "", {
    stage: "site_check",
    result: "accepted",
    acceptedQty: 40,
  });

  login("admin@cpms.test");
  view = fresh();
  t("Шалгасны дараа 2-р шат хүлээнэ", view.nextStage === "final_approval", String(view.nextStage));
  t("Шалгасан хэмжээ бичигдэв", view.checkedQty === 40, String(view.checkedQty));

  /*
   * ЭНЭ МӨР нь шатыг хасахад хүргэсэн алдааг барина: хуучин томьёогоор
   * (мэдээлсэн − баталсан) бол 40 гарна, зөв нь мөн 40 — тиймээс дараагийн
   * шалгуур ялгааг нь харуулна.
   */
  t("2-р шатны сан = ШАЛГАСАН дүн", view.stagePool === 40, String(view.stagePool));

  // Хэсэгчлэн батлахад сан нь ШАЛГАСНААС хасагдана, мэдээлсэнээс биш.
  handleMock("POST", ["work-items", row.id, "inspections"], "", {
    stage: "final_approval",
    result: "accepted",
    acceptedQty: 15,
  });

  view = fresh();
  t(
    "Хэсэгчлэн батласны дараа сан = шалгасан − баталсан",
    view.stagePool === 25,
    `${view.stagePool} (хуучин томьёогоор бол 25 — ялгаа нь доорх мөрөнд)`,
  );

  // Гүйцэтгэгч ШИНЭ ажил мэдээлэхэд 1-р шат дахин хүлээнэ, 2-р шатны сан
  // ХӨДӨЛӨХГҮЙ. Хуучин томьёогоор бол 2-р шатны сан 25 → 65 болж, хяналтын
  // инженер хараахан шалгагдаагүй 40-ийг батлах боломжтой болно.
  login("site_engineer@cpms.test");
  handleMock("POST", ["work-items", row.id, "progress"], "", { completedQty: 40 });
  login("admin@cpms.test");
  view = fresh();

  t("Шинэ гүйцэтгэл 1-р шат руу орно", view.nextStage === "site_check", String(view.nextStage));
  t(
    "Шалгагдаагүй ажил 2-р шатны санд ОРОХГҮЙ",
    getDb().byId.get(row.id)!.checkedQty === 40,
    String(getDb().byId.get(row.id)!.checkedQty),
  );

  login("admin@cpms.test");
}

/*
 * --- Шалгалтын цэг ---
 *
 * Хоёр шаттай баталгаажуулалт байгаа ч дараагийн ажил зогсдоггүй бол тэр
 * нь хоосон хэлбэр: гүйцэтгэгч арматураа шалгуулалгүй бетоноо цутгачихвал
 * хяналтын инженер дараа нь юу ч шалгаж чадахгүй.
 */
{
  handleMock("POST", ["auth", "login"], "", { email: "site_engineer@cpms.test", password: "x" });

  const types = getDb().workTypes;
  const hold = types.find((t) => t.isHoldPoint && t.level === "floor")!;
  t("Шалгалтын цэг тэмдэглэгдсэн", Boolean(hold), hold?.name);

  /*
   * АЙЛТАЙ давхрыг сонгоно.
   *
   * Зоорь нь давхрын түвшний байршил ч доороо айлгүй — түүнийг сонговол
   * хориг шалгах зүйлгүй болно. Эхний таарсныг авбал яг тэр болно.
   */
  const pair = getDb()
    .workItems.filter((w) => w.workTypeId === hold.id && w.blockId === "blk-a-01" && w.plannedQty > 0)
    .map((holdItem) => {
      const unitIds = new Set(
        getDb()
          .locations.filter((l) => l.parentId === holdItem.locationId)
          .map((l) => l.id),
      );
      const later = getDb().workItems.find(
        (w) =>
          unitIds.has(w.locationId) &&
          w.plannedQty > 0 &&
          w.remainingQty > 1 &&
          (GROUP_ORDER[w.workType.groupName] ?? 0) > (GROUP_ORDER[hold.groupName] ?? 0),
      );

      return later ? { holdItem, later } : null;
    })
    .find((x) => x !== null)!;

  t("Доорх айлд дараагийн ажил бий", Boolean(pair), pair?.later.name);

  const { holdItem, later } = pair;

  /*
   * Далд ажлыг ДУУСААГҮЙ болгоно.
   *
   * Хориг нь `status === "completed"`-оор шалгадаг, төлөвөөр биш: «батлагдсан»
   * гэдэг нь зөвхөн хүлээх юм алга гэсэн утгатай, ажил дууссан гэсэн утгатай
   * биш. Тиймээс тестэд ч ЯГ ТЭР талбарыг хөндөх ёстой.
   */
  const keep = {
    reported: holdItem.reportedQty,
    checked: holdItem.checkedQty,
    accepted: holdItem.acceptedQty,
    state: holdItem.reviewState,
    status: holdItem.status,
    remaining: holdItem.remainingQty,
  };
  holdItem.acceptedQty = 0;
  holdItem.checkedQty = 0;
  holdItem.reviewState = "pending_check";
  holdItem.status = "in_progress";
  holdItem.remainingQty = holdItem.plannedQty;

  const blocked = handleMock("POST", ["work-items", later.id, "progress"], "", {
    completedQty: 1,
  });
  t("Батлагдаагүй далд ажил замыг хаана", blocked.status === 422, String(blocked.status));
  t(
    "Хориг нь ҮЛДЭГДЛИЙГ хэлнэ",
    JSON.stringify(blocked.body).includes("үлдсэн"),
    JSON.stringify(blocked.body).slice(0, 160),
  );
  t(
    "Хаасан ажлын НЭРИЙГ хэлнэ",
    JSON.stringify(blocked.body).includes(hold.name),
    JSON.stringify(blocked.body).slice(0, 120),
  );

  // Дэлгэрэнгүй хуудас хоригийг УРЬДЧИЛЖ харуулна — товч дарж байж 422
  // авах нь оройтсон: гүйцэтгэгч аль хэдийн ажлаа хийчихсэн байна.
  const detail = body<{ data: { holdPointReason: string | null } }>(
    get(`work-items/${later.id}`),
  ).data;
  t("Хориг дэлгэрэнгүйд харагдана", Boolean(detail.holdPointReason), detail.holdPointReason ?? "—");

  // Жагсаалтад БОДОГДОХГҮЙ — 200 мөр тутамд нэмэлт тооцоо явуулахгүй.
  const listRow = body<{ data: Record<string, unknown>[] }>(
    get("blocks/blk-a-01/work-items", "?pageSize=1"),
  ).data[0];
  t("Жагсаалтад хориг бодогдохгүй", !("holdPointReason" in listRow));

  // Дуусгасны дараа зам нээгдэнэ.
  holdItem.reportedQty = holdItem.plannedQty;
  holdItem.checkedQty = holdItem.plannedQty;
  holdItem.acceptedQty = holdItem.plannedQty;
  holdItem.remainingQty = 0;
  holdItem.reviewState = "approved";
  holdItem.status = "completed";

  t(
    "Батлагдсаны дараа зам нээгдэнэ",
    handleMock("POST", ["work-items", later.id, "progress"], "", { completedQty: 1 }).status ===
      201,
  );

  holdItem.reportedQty = keep.reported;
  holdItem.checkedQty = keep.checked;
  holdItem.acceptedQty = keep.accepted;
  holdItem.reviewState = keep.state;
  holdItem.status = keep.status;
  holdItem.remainingQty = keep.remaining;
  handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });
}

/*
 * --- Гүйцэтгэгчийн гэрээний профайл ---
 *
 * «Ажил гүйцэтгэх тохиролцооны хуудас» нь РД, данс, банк, утсыг шаарддаг.
 * Эдгээргүйгээр тохиролцоо бичигдэхгүй, акт хэвлэгдэхгүй, төлбөр гарахгүй.
 */
{
  const list = body<{ data: typeof db.contractors }>(get("contractors")).data;

  t("Гүйцэтгэгчид ангилалтай", list.every((c) => Boolean(c.categoryLabel)), String(list.length));

  /*
   * Demo-д ДУТУУ профайл байх ЁСТОЙ.
   *
   * Бүх мөр төгс байвал «тохиролцоонд дутуу» гэсэн анхааруулга хэзээ ч
   * харагдахгүй, тэр дэлгэц шалгагдахгүй.
   */
  const incomplete = list.filter((c) => (c.missingContractFields?.length ?? 0) > 0);
  t(
    "Дутуу профайлтай гүйцэтгэгч бий",
    incomplete.length > 0,
    incomplete.map((c) => `${c.name}: ${c.missingContractFields?.join("/")}`).join(" · "),
  );

  const target = list.find((c) => c.registrationNo)!;

  // РД давхардуулах оролдлого — нэрээр барих нь хүрэлцэхгүй.
  const other = list.find((c) => c.id !== target.id)!;
  t(
    "Давхардсан РД-г татгалзана",
    handleMock("PATCH", ["contractors", other.id], "", {
      registrationNo: target.registrationNo,
    }).status === 422,
  );

  t(
    "РД 7 орон биш бол 422",
    handleMock("PATCH", ["contractors", other.id], "", { registrationNo: "123" }).status === 422,
  );

  /*
   * НЭГ талбар засахад бусад нь ЦЭВЭРЛЭГДЭХГҮЙ.
   *
   * Бүх талбарыг дарж бичдэг PATCH нь утас засахад РД, данс, банкийг
   * хоосон болгодог — яг тэр алдаа хэрэглэгчийн хуудсанд нэг удаа гарсан.
   */
  const keepReg = target.registrationNo;
  const keepBank = target.bankAccount;
  t(
    "Хэсэгчилсэн засвар 200",
    handleMock("PATCH", ["contractors", target.id], "", { phone: "9900-1122" }).status === 200,
  );
  t("РД хэвээр", target.registrationNo === keepReg, String(target.registrationNo));
  t("Данс хэвээр", target.bankAccount === keepBank, String(target.bankAccount));
  t("Утас шинэчлэгдэв", target.phone === "9900-1122", String(target.phone));

  /*
   * ГЭРЭЭ ЦУЦЛАГДСАН гүйцэтгэгчид шинэ ажил оноогдохгүй.
   *
   * Оноовол акт нь түүн рүү явж, төлбөр гарах эрсдэлтэй.
   */
  const gone = list.find((c) => c.canTakeWork === false)!;
  t("Цуцлагдсан гүйцэтгэгч demo-д бий", Boolean(gone), gone?.name);

  const free = db.workItems.find((w) => w.reportedQty === 0 && w.blockId === "blk-a-01")!;
  const keepContractor = free.contractor;

  const refused = handleMock("PATCH", ["work-items", free.id, "contractor"], "", {
    contractorId: gone.id,
  });
  t("Цуцлагдсанд ажил оноохгүй → 422", refused.status === 422, String(refused.status));
  t("Хариуцагч хөдлөөгүй", free.contractor === keepContractor);

  // Бөөний оноолт ч ижил хоригтой — хоёр зам, нэг дүрэм.
  t(
    "Бөөнөөр ч оноохгүй → 422",
    handleMock("POST", ["blocks", "blk-a-01", "work-items", "assign"], "", {
      workTypeGroupId: db.groups[0].id,
      contractorId: gone.id,
    }).status === 422,
  );

  // Төлөв сэргээвэл зам нээгдэнэ.
  handleMock("PATCH", ["contractors", gone.id], "", { status: "active" });
  t("Сэргээсний дараа оноогдоно", gone.canTakeWork === true, String(gone.statusLabel));
  handleMock("PATCH", ["contractors", gone.id], "", { status: "terminated" });
}

/*
 * --- Ажил гүйцэтгэх тохиролцоо ---
 *
 * МӨНГӨ системд эндээс орно: акт нь тохиролцооны нэгж үнэ дээр тогтоно.
 * Эндэх дүрмүүд нь төлбөрийн дүрмүүд — нэг нь зөрвөл акт худал болно.
 */
{
  handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });

  // 1. Төсвөөс мөр татна — ажлын ТӨРЛӨӨР нэгтгэгдэнэ.
  const drafted = body<{
    data: { workTypeId: string; quantity: number; budgetUnitPrice: number | null }[];
    meta: { withoutPrice: number; priceConflicts: number };
  }>(get("blocks/blk-a-01/agreement-draft"));

  t("Төсвөөс мөр татагдана", drafted.data.length > 0, `${drafted.data.length} мөр`);
  t(
    "Ажлын төрөл ДАВХАРДААГҮЙ",
    new Set(drafted.data.map((l) => l.workTypeId)).size === drafted.data.length,
  );
  t(
    "Нэгтгэсэн тоо нь мөрүүдийн нийлбэртэй тэнцэнэ",
    (() => {
      const first = drafted.data[0];
      const sum = getDb()
        .workItems.filter((w) => w.blockId === "blk-a-01" && w.workTypeId === first.workTypeId)
        .reduce((s2, w) => s2 + w.plannedQty, 0);

      return Math.abs(sum - first.quantity) < 0.01;
    })(),
  );
  t("Төсвийн үнэ ирнэ", drafted.data.every((l) => l.budgetUnitPrice !== null));

  const line = drafted.data[0];
  const payload = {
    contractorId: "ctr-1",
    scope: "Дотор засал",
    retentionPercent: 5,
    barterPercent: 0,
    cashPercent: 100,
    lines: [
      {
        workTypeId: line.workTypeId,
        unit: "м2",
        quantity: line.quantity,
        unitPrice: (line.budgetUnitPrice ?? 1000) * 1.1,
        budgetUnitPrice: line.budgetUnitPrice,
      },
    ],
  };

  // 2. Мөнгөний дүрмүүд.
  t(
    "Бартер+бэлэн 100% биш бол 422",
    handleMock("POST", ["blocks", "blk-a-01", "agreements"], "", {
      ...payload,
      barterPercent: 60,
      cashPercent: 50,
    }).status === 422,
  );
  t(
    "Нэгж үнэ 0 бол 422",
    handleMock("POST", ["blocks", "blk-a-01", "agreements"], "", {
      ...payload,
      lines: [{ ...payload.lines[0], unitPrice: 0 }],
    }).status === 422,
  );
  t(
    "Профайл дутуу гүйцэтгэгчтэй 422",
    handleMock("POST", ["blocks", "blk-a-01", "agreements"], "", {
      ...payload,
      contractorId: "ctr-5",
    }).status === 422,
  );
  t(
    "Цуцлагдсан гүйцэтгэгчтэй 422",
    handleMock("POST", ["blocks", "blk-a-01", "agreements"], "", {
      ...payload,
      contractorId: "ctr-6",
    }).status === 422,
  );

  // 3. Үүсгэх — дүн СЕРВЕРЭЭС.
  const created = handleMock("POST", ["blocks", "blk-a-01", "agreements"], "", payload);
  t("Тохиролцоо 201", created.status === 201, String(created.status));

  const agr = body<{
    data: {
      id: string;
      number: string;
      status: string;
      totalAmount: number;
      budgetAmount: number;
      variancePercent: number;
      retentionAmount: number;
      isEditable: boolean;
    };
  }>(created).data;

  t("Дугаар үүссэн", /^ТХ-\d{4}-\d{3}$/.test(agr.number), agr.number);
  t("Драфт төлөвтэй", agr.status === "draft" && agr.isEditable);
  t(
    "Нийт дүн зөв бодогдов",
    Math.abs(agr.totalAmount - line.quantity * (line.budgetUnitPrice ?? 1000) * 1.1) < 1,
    String(agr.totalAmount),
  );
  t(
    "Төсвөөс +10% зөрүү",
    Math.abs(agr.variancePercent - 10) < 0.2,
    `${agr.variancePercent}%`,
  );
  t(
    "Барьцаа 5% бодогдов",
    Math.abs(agr.retentionAmount - agr.totalAmount * 0.05) < 1,
    String(agr.retentionAmount),
  );

  // 4. Батлах — зөвхөн эрхтэй хүн, дараа нь түгжигдэнэ.
  handleMock("POST", ["auth", "login"], "", { email: "site_engineer@cpms.test", password: "x" });
  t(
    "Талбайн инженер харахгүй → 403",
    get(`agreements/${agr.id}`).status === 403,
    String(get(`agreements/${agr.id}`).status),
  );

  handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });
  t(
    "Батлагдав",
    handleMock("POST", ["agreements", agr.id, "approve"], "", {}).status === 200,
  );

  const after = body<{ data: { status: string; isEditable: boolean } }>(
    get(`agreements/${agr.id}`),
  ).data;
  t("Хүчин төгөлдөр болов", after.status === "active");

  /*
   * ХАМГИЙН ЧУХАЛ ДҮРЭМ: батлагдсаны дараа мөр ТҮГЖИГДЭНЭ.
   *
   * Акт нь тохиролцооны үнэ дээр тогтдог. Үнэ хойшоо хөдөлвөл гарсан акт
   * бүр худал болж, төлбөрийн баримт хүчингүй болно.
   */
  t("Мөр түгжигдэв", after.isEditable === false);
  t(
    "Батлагдсаныг засахгүй → 422",
    handleMock("PATCH", ["agreements", agr.id], "", payload).status === 422,
  );
  t(
    "Дахин батлахгүй → 422",
    handleMock("POST", ["agreements", agr.id, "approve"], "", {}).status === 422,
  );

  // 5. Жагсаалтад харагдана.
  const listed = body<{ data: { id: string }[] }>(get("projects/prj-inel-01/agreements")).data;
  t("Жагсаалтад харагдана", listed.some((x) => x.id === agr.id), `${listed.length} тохиролцоо`);
}

// Бүлгийн тоо нь оноосон гүйцэтгэгч + «хариуцагчгүй» мөрөөс хамаарна.
t("Гүйцэтгэгчээр нэгтгэнэ", byC.data.groups.length >= 2, `${byC.data.groups.length} бүлэг`);

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
t("Төлөв «шалгалт хүлээж буй» болсон", item.reviewState === "pending_check", item.reviewState);

// Шалгалт — ХҮЛЭЭГДЭЖ БУЙ бүх хэмжээг батална.
// Хэсэгчлэн батлавал үлдсэн нь хянагдаагүй тул `pending` хэвээр байх ёстой:
// «батлав» гэсэн товч дарахад бүх зүйл дуусдаг гэж үзвэл хэмжилт худал болно.
const insp = approveFully(item.id);
t("1-р шат 201", insp.check.status === 201, String(insp.check.status));
t("2-р шат 201", insp.approve.status === 201, String(insp.approve.status));
t("Бүгдийг батласны дараа approved", item.reviewState === "approved", item.reviewState);

/*
 * НЭГ хүн хоёр шатыг ч хийж болохгүй — backend-тэй ижил 403.
 *
 * Эс бөгөөс каскад нь зүгээр л хоёр товч болж, мэдээлэх ба батлах эрхийг
 * салгасан зарчим утгаа алдана.
 */
t(
  "Нэг хүн хоёр шатыг хийхгүй",
  (() => {
    const other = db.workItems.find(
      (w) => w.id !== item.id && w.plannedQty > 20 && w.reportedQty === 0,
    )!;
    handleMock("POST", ["auth", "login"], "", { email: "site_engineer@cpms.test", password: "x" });
    handleMock("POST", ["work-items", other.id, "progress"], "", { completedQty: 5 });
    handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });
    handleMock("POST", ["work-items", other.id, "inspections"], "", {
      stage: "site_check",
      result: "accepted",
      acceptedQty: 5,
    });
    const second = handleMock("POST", ["work-items", other.id, "inspections"], "", {
      stage: "final_approval",
      result: "accepted",
      acceptedQty: 5,
    });

    return second.status === 403;
  })(),
);

/*
 * ХЯНАГДААГҮЙ хэмжээнээс ИЛҮҮГ батлах боломжгүй.
 *
 * Энэ нь хоёр шатны хяналтын гол хамгаалалт: нэг ажлыг ерөнхий гүйцэтгэгч
 * батлаад, дараа нь захиалагч ДАХИН батлах гэвэл батлагдсан хэмжээ хоёр
 * дахин болно. Backend үүнийг 422-оор няцаадаг байсан ч mock зөвшөөрдөг
 * байв — дэлгэц mock дээр «ажиллаад» бодит сервер дээр алдаа өгнө.
 */
{
  const before = item.acceptedQty;
  const again = handleMock("POST", ["work-items", item.id, "inspections"], "", {
    stage: "site_check",
    result: "accepted",
    acceptedQty: 10,
  });
  t("Хянагдаагүйгээс илүүг батлахгүй", again.status === 422, String(again.status));
  t("Татгалзсан шалгалт батлагдсан тоог хөдөлгөөгүй", item.acceptedQty === before);
}

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
t(
  "Бүх хуудсыг гүйлгэхэд мөр алдагдахгүй",
  seen === SEED_ITEMS,
  `${seen} / ${SEED_ITEMS} (${pageNo} хуудас)`,
);

// --- Загвараас блок хувилах урсгал ---
const designs = body<{
  data: { id: string; estimatedItems: number; floors: number }[];
}>(get("block-designs")).data;
t("Гурван загвар байна", designs.length === 3, String(designs.length));

const d16 = designs.find((d) => d.id === "dsg-16-9")!;
t(
  "16 давхрын загварын тооцоо мөрийн тоотой таарна",
  d16.estimatedItems === SEED_ITEMS,
  String(d16.estimatedItems),
);
const dSvc = designs.find((d) => d.id === "dsg-4-svc")!;
/*
 * «100-аас бага» гэсэн бүдэг шалгуур биш, ЯГ тоогоор шалгана: үйлчилгээний
 * барилгад айл байхгүй тул айлын түвшний төрөл бүрэн гарах ёстой. Техникийн
 * давхрын дөрвөн зай нь айлын түвшний байршил хэдий ч загвар нь тэр түвшнийг
 * хассан тул тэдгээрт ч ажил үүсэхгүй.
 */
const svcLocs = db.locations.filter((l) => l.blockId === "blk-s-04");
const svcPerLevel = svcLocs.reduce(
  (acc, l) => ({ ...acc, [l.level]: (acc[l.level] ?? 0) + 1 }),
  {} as Record<string, number>,
);
const SVC_ITEMS = db.workTypes.reduce(
  (sum, wt) => sum + (wt.level === "unit" ? 0 : (svcPerLevel[wt.level] ?? 0)),
  0,
);
t(
  "Үйлчилгээний загварт айлын ажил ороогүй",
  dSvc.estimatedItems === SVC_ITEMS,
  `${dSvc.estimatedItems} vs ${SVC_ITEMS}`,
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
t("Анхны блок хэвээр үлдэв", oldTotal === SEED_ITEMS, String(oldTotal));
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
t("Бүх ажлаас багассан", mineTotal > 0 && mineTotal < SEED_ITEMS, String(mineTotal));

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
  stage: "site_check",
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
  email: "admin@cpms.test",
  password: "x",
});
t(
  "Ажилтан бүх ажлыг харна",
  body<{ meta: { total: number } }>(get("blocks/blk-a-01/work-items", "?pageSize=1")).meta.total ===
    SEED_ITEMS,
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

/*
 * Ажлын төрөл ЗАСАХ.
 *
 * Урьд нь үүсгэх, устгах л боломжтой байв. Гэтэл ашиглагдаж эхэлсэн төрлийг
 * устгах боломжгүй тул нэр буруу бичигдсэн төрөл мөнхөд буруу хэвээр үлддэг
 * байсан: устгаж ч болохгүй, засаж ч болохгүй.
 */
const patchType = (id: string, payload: Record<string, unknown>) =>
  handleMock("PATCH", ["work-types", id], "", payload);

t(
  "Ашиглагдаагүй төрлийн нэр засагдана",
  body<{ data: { name: string } }>(patchType(newTypeId, { name: "Шинэ нэр" })).data.name ===
    "Шинэ нэр",
);
t("Хоосон нэр 422", patchType(newTypeId, { name: "  " }).status === 422);
t(
  "Ашиглагдаагүй төрлийн нэгж засагдана",
  body<{ data: { unit: string } }>(patchType(newTypeId, { unit: "м3" })).data.unit === "м3",
);

/*
 * АШИГЛАГДАЖ ЭХЭЛСЭН төрлийн нэгж, түвшин ТҮГЖИГДЭНЭ.
 *
 * «м²» гэж бүртгэсэн 3,290 мөрийг «ш» болгон дахин тайлбарлах боломжгүй.
 * Нэр, бүлэг нь харин чөлөөтэй — ажлын мөрүүд хөндөгдөхгүй.
 */
const usedTypeId = getDb().workItems[0].workTypeId;
t(
  "Ашиглагдсан төрлийн нэр засагдана",
  patchType(usedTypeId, { name: "Засварласан" }).status === 200,
);
t("Ашиглагдсан төрлийн нэгж солихгүй", patchType(usedTypeId, { unit: "ш" }).status === 409);
// Одоогийнхоос ӨӨР түвшин сонгоно — ижил утга илгээх нь өөрчлөлт биш.
const usedLevel = getDb().workTypes.find((w) => w.id === usedTypeId)!.level;
t(
  "Ашиглагдсан төрлийн түвшин солихгүй",
  patchType(usedTypeId, { level: usedLevel === "unit" ? "floor" : "unit" }).status === 409,
);
// Ижил утга илгээх нь өөрчлөлт БИШ — няцаах шалтгаангүй.
t(
  "Ижил нэгж илгээхэд асуудалгүй",
  patchType(usedTypeId, { unit: getDb().workTypes.find((w) => w.id === usedTypeId)!.unit })
    .status === 200,
);

/*
 * --- ТӨСВИЙН КОД ---
 *
 * Код нь төсвийн файлыг системтэй холбох цорын ганц түлхүүр. Нэрээр
 * тааруулах оролдлого 64 мөрийн 43-д нь бүдэрсэн тул кодыг харуулах,
 * засах, давхардуулахгүй байх гурвуулаа чухал.
 */
{
  const seeded = body<{ data: { code: string | null; codePart: string | null }[] }>(
    get("work-types", "?pageSize=200"),
  ).data;

  t(
    "Лавлах кодтой ирнэ",
    seeded.filter((x) => x.code).length > 40,
    `${seeded.filter((x) => x.code).length} кодтой`,
  );
  t(
    "Нэг код олон ажилд хуваагдана",
    seeded.filter((x) => x.code === "17.1.6" && x.codePart).length > 1,
  );

  // Кодоор ХАЙНА — инженер төсвийн мөрөө гартаа барьж суудаг.
  const found = body<{ data: { code: string | null }[] }>(get("work-types", "?search=17.1.6")).data;
  t("Кодоор хайлт ажиллана", found.length > 0 && found.every((x) => x.code === "17.1.6"));

  t(
    "Код хадгалагдана",
    body<{ data: { code: string } }>(patchType(newTypeId, { code: "9.9.9" })).data.code === "9.9.9",
  );

  // Давхардсан код нь ЧИМЭЭГҮЙ дарагдана — эхлээд таарсан нь хожино.
  t(
    "Давхардсан код татгалзагдана",
    post("work-types", {
      groupId: getDb().groups[0].id,
      name: "Өөр ажил",
      code: "9.9.9",
      unit: "м2",
      level: "floor",
    }).status === 422,
  );

  // Бүрдэл нь ялгаж өгвөл нэг кодыг хуваахыг ЗӨВШӨӨРНӨ.
  const split = post("work-types", {
    groupId: getDb().groups[0].id,
    name: "Хуваасан ажил",
    code: "9.9.9",
    codePart: "Айлын тагт",
    unit: "м2",
    level: "floor",
  });
  t("Бүрдлээр ялгавал зөвшөөрнө", split.status === 201, String(split.status));

  handleMock("DELETE", ["work-types", body<{ data: { id: string } }>(split).data.id], "", undefined);

  /*
   * Код нь АРИЛГАГДАЖ ч болох ёстой: буруу бичигдсэн код тогтоогдвол
   * тэр төрөл рүү дахиж импорт орохгүй болно.
   */
  t(
    "Хоосон илгээвэл код арилна",
    body<{ data: { code: string | null } }>(patchType(newTypeId, { code: "  " })).data.code === null,
  );
}

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
  email: "admin@cpms.test",
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
  unassignedItems: number;
  plannedQty: number;
  reportedQty: number;
  acceptedQty: number;
  blocks: (Counts & {
    id: string;
    percentage: number;
    unmeasuredItems: number;
    unassignedItems: number;
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
// Хариуцагчгүй ажил
// ---------------------------------------------------------------------------
/*
 * Загвар буулгахад ажил ҮРГЭЛЖ хариуцагчгүй үүснэ — аль компани юу хийхийг
 * зураг төсөл мэддэггүй.
 *
 * Гэвч хариуцагчгүй ажлыг туслан гүйцэтгэгч ХАРАХГҮЙ. Оноохоо мартвал тэр
 * компани нэвтрээд хоосон дэлгэц харна. Тиймээс энэ тоо самбар дээр ил
 * гарах ёстой — урьд нь зөвхөн оноох хуудсан дээр байсан.
 */
{
  const dash = body<{ data: Dash }>(get("projects/prj-inel-01/dashboard")).data;
  const db2 = getDb();
  const expected = db2.workItems.filter((w) => !w.contractor).length;

  t(
    "Хариуцагчгүй ажлын тоо самбарт ирнэ",
    dash.unassignedItems === expected,
    `${dash.unassignedItems} vs ${expected}`,
  );
  t(
    "Блок бүрийн нийлбэр төслийнхтэй таарна",
    dash.blocks.reduce((a, b) => a + b.unassignedItems, 0) === dash.unassignedItems,
  );

  // Блокийн нэгтгэл мөн ижил тоог өгнө — хоёр дэлгэц зөрөх ёсгүй.
  const page = body<{ data: { totals: { unassignedItems: number } } }>(
    get("blocks/blk-a-01/summary"),
  ).data.totals;
  const blockA = dash.blocks.find((b) => b.id === "blk-a-01")!;
  t(
    "Самбар ба блокийн хуудасны хариуцагчгүй тоо таарна",
    page.unassignedItems === blockA.unassignedItems,
    `${page.unassignedItems} vs ${blockA.unassignedItems}`,
  );
}

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
    email: "admin@cpms.test",
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
  stage: "site_check",
  result: "accepted",
  acceptedQty: 5,
});
t("Хуудасгүйгээр батлахгүй", noChecklist.status === 422, String(noChecklist.status));

// 2. Дутуу бөглөвөл мөн хориглоно.
const partialFill = inspect({
  stage: "site_check",
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
  stage: "site_check",
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
  stage: "site_check",
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
  stage: "site_check",
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
  stage: "site_check",
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
  stage: "site_check",
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
approveFully(zeroItem.id, ids ? ids.map((id) => ({ itemId: id, result: "pass" })) : undefined);
t(
  "Мэдээлсэн бүх хэмжээ батлагдлаа",
  zeroItem.acceptedQty === zeroItem.reportedQty && zeroItem.acceptedQty > 0,
  `${zeroItem.acceptedQty} / ${zeroItem.reportedQty}`,
);
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
  email: "admin@cpms.test",
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
  email: "admin@cpms.test",
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
/*
 * Хоосон блокийн хүлээлт — зарлагдсан 5 давхар, 4 айл дээр нэмэлт давхрууд
 * ба техникийн давхрын зайнууд.
 */
const EMPTY_FLOORS = 5 + EXTRA_FLOORS;
const EMPTY_UNITS = 5 * 4 + TECH_SPACES;
t(
  `Байршил үүссэн: 1 блок + ${EMPTY_FLOORS} давхар + ${EMPTY_UNITS} айл`,
  emptyLocs.length === 1 + EMPTY_FLOORS + EMPTY_UNITS,
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
// Давхрын түвшний ажил — давхрын байршил тутамд нэг мөр.
t(
  `Түвшний бүх байршилд мөр үүссэн (${EMPTY_FLOORS})`,
  body<{ data: { created: number } }>(added).data.created === EMPTY_FLOORS,
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

// Айлын түвшний ажил — 5 давхар × 4 айл + техникийн давхрын зайнууд.
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
  `3 төрөл × ${EMPTY_FLOORS} давхар = ${floorTypes.length * EMPTY_FLOORS} мөр`,
  body<{ data: { created: number } }>(bulkAdd).data.created === floorTypes.length * EMPTY_FLOORS,
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
  `Айлын түвшинд ${EMPTY_UNITS} мөр`,
  body<{ data: { created: number } }>(addedUnits).data.created === EMPTY_UNITS,
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
  email: "admin@cpms.test",
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
  t("Мэдээлсний дараа шалгалт хүлээнэ", target.reviewState === "pending_check", target.reviewState);

  const rej = handleMock("POST", ["work-items", target.id, "inspections"], "", {
    stage: "site_check",
    result: "rejected",
    acceptedQty: 0,
    reason: "Гадаргуу тэгш бус",
  });
  t("Татгалзал 201", rej.status === 201, String(rej.status));
  t("Татгалзсаны дараа буцаагдсан", target.reviewState === "returned_by_site", target.reviewState);
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
    target.reviewState === "pending_check",
    target.reviewState,
  );

  // Хоёр шатыг ч дамжуулж байж 100% болно — 1-р шат дангаараа хүрэлцэхгүй.
  approveFully(target.id);
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
    email: "admin@cpms.test",
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
      reason: "Урагшлуулах гэсэн оролдлого.",
    }).status === 422,
  );
  // Тайлбар хэт тодорхойгүй бол хүлээж авахгүй — «х» гэж бичээд өнгөрөхгүй.
  t(
    "Тайлбар хэт тодорхойгүй бол 422",
    handleMock("POST", path, "", {
      plannedEndDate: future,
      category: "weather",
      reason: "хүйтэн",
    }).status === 422,
  );

  const issuesBefore = body<{ data: unknown[] }>(get(`work-items/${late.id}/issues`)).data.length;
  const res = handleMock("POST", path, "", {
    plannedEndDate: future,
    category: "material_shortage",
    reason: "Цонхны хүргэлт хоцорсон.",
  });

  t("Сунгалт 200", res.status === 200, String(res.status));
  t("Батлагдсан гэж мэдэгдэнэ", body<{ meta: { applied: boolean } }>(res).meta.applied === true);
  t("Огноо шинэчлэгдэв", late.plannedEndDate === future, String(late.plannedEndDate));
  t("Хоцролт тэглэгдэв", late.overdueDays === 0, String(late.overdueDays));

  /*
   * ХАМГИЙН ЧУХАЛ ШАЛГУУР: гулсалтыг НУУХ арга байхгүй.
   *
   * `overdueDays` нь сунгалтаар тэглэгдэнэ — тэр нь зөв, амлалт хөдөлсөн.
   * Гэвч `baselineEndDate` хэвээр үлдэх ёстой, эс бөгөөс «хэн ч хэзээ ч
   * хоцроогүй» гэсэн зураг гарч, хоцролтын тайлан хэнийг ч хянахгүй.
   */
  t("Үндсэн огноо ХӨДӨЛСӨНГҮЙ", late.baselineEndDate === before, String(late.baselineEndDate));
  t(
    "Үндсэн төлөвлөгөөний гулсалт үлдэв",
    (late.baselineOverdueDays ?? 0) > 0,
    String(late.baselineOverdueDays),
  );
  t("Сунгасан хоногийг тоолов", (late.extendedDays ?? 0) > 0, String(late.extendedDays));

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

  /*
   * --- Хүсэлтийн урсгал ---
   *
   * Батлах эрхгүй хүн сунгавал ХҮЛЭЭГДЭНЭ, огноо хөдлөхгүй. Урьд нь
   * `canEditPlan` эрхгүй хүн 403 авдаг байсан тул хуваарь хэтэрч байгааг
   * хамгийн эрт мэддэг хүмүүс (талбайн инженер, гүйцэтгэгч) дуугарах зам
   * ч байхгүй байв.
   */
  {
    const other = getDb().workItems.find(
      (w) => w.id !== late.id && w.blockId === "blk-a-01" && w.plannedEndDate,
    )!;
    const otherBefore = other.plannedEndDate;
    const wanted = "2031-06-30";

    handleMock("POST", ["auth", "login"], "", {
      email: "site_engineer@cpms.test",
      password: "x",
    });

    const asked = handleMock("POST", ["work-items", other.id, "extend"], "", {
      plannedEndDate: wanted,
      category: "weather",
      reason: "Хасах 28 хэмд шавардлага хийх боломжгүй байв.",
    });

    t("Эрхгүй хүний сунгалт 202 (хүлээгдэнэ)", asked.status === 202, String(asked.status));
    t("Хүлээгдэж байхад огноо ХӨДЛӨХГҮЙ", other.plannedEndDate === otherBefore);

    const reqId = body<{ data: { id: string; status: string } }>(asked).data.id;
    t("Төлөв нь pending", body<{ data: { status: string } }>(asked).data.status === "pending");

    // Нэг ажилд хоёр хүлээгдэж буй хүсэлт байж болохгүй.
    t(
      "Хоёр дахь хүсэлт 422",
      handleMock("POST", ["work-items", other.id, "extend"], "", {
        plannedEndDate: "2031-07-31",
        category: "weather",
        reason: "Хоёр дахь хүсэлт гаргах оролдлого.",
      }).status === 422,
    );

    // Талбайн инженер өөрийн хүсэлтээ батлах гэвэл 403.
    t(
      "Хүсэгч өөрөө батлахгүй",
      handleMock("POST", ["extension-requests", reqId, "approve"], "", {}).status === 403,
    );

    handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });

    // Дараалалд харагдана — эс бөгөөс хүсэлт хэнд ч хүрэхгүй.
    const queue = body<{ data: { id: string; requestedDays: number }[] }>(
      get("projects/prj-inel-01/extension-requests"),
    ).data;
    t("Хүсэлт дараалалд харагдана", queue.some((x) => x.id === reqId), `${queue.length} хүсэлт`);

    t(
      "Татгалзахад шалтгаан заавал",
      handleMock("POST", ["extension-requests", reqId, "reject"], "", {}).status === 422,
    );

    t(
      "Батлахад огноо хөдөлнө",
      handleMock("POST", ["extension-requests", reqId, "approve"], "", {}).status === 200,
    );
    t("Хүссэн огноо тавигдав", other.plannedEndDate === wanted, String(other.plannedEndDate));
    t("Үндсэн огноо хэвээр", other.baselineEndDate === otherBefore, String(other.baselineEndDate));

    t(
      "Шийдэгдсэн хүсэлтийг дахин шийдэхгүй",
      handleMock("POST", ["extension-requests", reqId, "approve"], "", {}).status === 422,
    );
  }

  // Гүйцэтгэгч ӨӨРИЙН БИШ ажилд хүсэлт гаргахгүй.
  login("GOO-2026");
  t(
    "Гүйцэтгэгч бусдын ажилд хүсэлт гаргахгүй",
    handleMock("POST", path, "", {
      plannedEndDate: "2031-01-01",
      category: "weather",
      reason: "Бусдын ажилд хүсэлт гаргах оролдлого.",
    }).status === 403,
  );
  handleMock("POST", ["auth", "login"], "", {
    email: "admin@cpms.test",
    password: "x",
  });
}

// ---------------------------------------------------------------------------
// Төсвийн импорт
//
// ГОЛ БАТАЛГАА: байршуулах нь ЮУ Ч ӨӨРЧЛӨХГҮЙ, батлах нь нэг л удаа
// ажиллана. Mock нь xlsx задалдаггүй ч ЭНЭ ТӨЛӨВИЙН УРСГАЛ backend-тэй
// ижил байх ёстой — дэлгэц түүн дээр баригддаг.
// ---------------------------------------------------------------------------
{
  const login = (email: string) =>
    handleMock("POST", ["auth", "login"], "", { email, password: "x" });

  const upload = (name: string, types?: string[]) =>
    handleMock("POST", ["blocks", "blk-a-01", "imports"], "", {
      file: { name, size: 1_284_000 },
      ...(types ? { types } : {}),
    });

  login("admin@cpms.test");

  t(".xlsx биш файл 422", upload("tosov.csv").status === 422);

  const created = upload("tosov-material.xlsx");
  t("Байршуулахад 201", created.status === 201, String(created.status));

  const env = body<{
    data: { id: string; status: string; uploadedBy: string; types: string[] };
    reports: {
      type: string;
      canApply: boolean;
      summary: { planned: number; rejected: number };
      errors: unknown[];
    }[];
  }>(created);

  t("Төлөв нь pending", env.data.status === "pending", env.data.status);
  t("Байршуулсан хүн тэмдэглэгдэв", Boolean(env.data.uploadedBy), env.data.uploadedBy);
  t("Нэр нь материал гэвэл зөвхөн материал", env.data.types.join() === "materials", env.data.types.join());
  t(
    "Тайлан оруулах мөртэй",
    env.reports[0].summary.planned > 0,
    String(env.reports[0].summary.planned),
  );
  t(
    "Татгалзсан мөрийг НУУХГҮЙ",
    env.reports[0].summary.rejected > 0 && env.reports[0].errors.length > 0,
    `${env.reports[0].summary.rejected} мөр`,
  );

  const importId = env.data.id;

  t(
    "Түүхэнд харагдана",
    body<{ data: { id: string }[] }>(get("blocks/blk-a-01/imports")).data.some(
      (x) => x.id === importId,
    ),
  );

  const applied = handleMock("POST", ["imports", importId, "apply"], "", {});
  t("Батлахад 200", applied.status === 200, String(applied.status));
  t(
    "Төлөв applied болов",
    body<{ data: { status: string } }>(applied).data.status === "applied",
  );
  t(
    "Бичилтийн үр дүн тайланд гарна",
    body<{ reports: { result?: { items: number } }[] }>(applied).reports[0].result != null,
  );

  /*
   * ГОРИМ нь үр дүнг өөрчилнө.
   *
   * `update` — гүйцэтгэл үлдэнэ, зөрчил гарч болно
   * `replace` — бүгд шинээр үүснэ, зөрчил байхгүй
   */
  {
    const draft = body<{ data: { id: string } }>(upload("ajliin-tosov.xlsx")).data;

    const res = handleMock("POST", ["imports", draft.id, "apply"], "", { mode: "update" });
    const result = body<{ reports: { result?: { updated?: number; conflicts?: unknown[] } }[] }>(res)
      .reports[0].result;

    t("Шинэчлэх горим ажиллана", res.status === 200, String(res.status));
    t("Шинэчлэгдсэн тоо гарна", (result?.updated ?? 0) > 0, String(result?.updated));
    t("Зөрчлийг жагсаана", (result?.conflicts?.length ?? 0) > 0);
  }

  t(
    "Хоёр дахь батлалт 422",
    handleMock("POST", ["imports", importId, "apply"], "", {}).status === 422,
  );
  t(
    "Орсон импортыг цуцлахгүй",
    handleMock("DELETE", ["imports", importId], "", undefined).status === 422,
  );

  /*
   * НЭГ ФАЙЛ, ХОЁР ТӨСӨВ.
   *
   * Захиалагчийн жинхэнэ файл 29 хуудастай бөгөөд хоёр нь төсөв. Нэг л
   * байршуулалтаар хоёулаа урьдчилан харагдана.
   */
  const both = body<{
    data: { id: string; types: string[]; typeLabel: string; summary: { planned: number } };
    reports: { type: string }[];
  }>(upload("AJLIIN_TOO_HEMJEE_26_06_A1.xlsx"));

  t("Хоёр төсөв танигдав", both.data.types.join() === "quantities,materials", both.data.types.join());
  t("Тайлан хоёр хэсэгтэй", both.reports.length === 2, String(both.reports.length));
  t(
    "Ажлын төсөв ЭХЭЛНЭ",
    both.reports[0].type === "quantities" && both.reports[1].type === "materials",
  );
  t(
    "Нэр нь нэгтгэгдэв",
    both.data.typeLabel === "Ажлын хөлсний төсөв + Материалын төсөв",
    both.data.typeLabel,
  );
  t("Түүхийн дүн нийлбэр", both.data.summary.planned === 1991 + 155, String(both.data.summary.planned));

  // Хоёрын НЭГИЙГ нь л оруулж болно.
  const partial = handleMock("POST", ["imports", both.data.id, "apply"], "", {
    types: ["quantities"],
  });
  t("Нэг хэсгийг оруулав", partial.status === 200, String(partial.status));
  t(
    "Бүртгэл ҮНЭХЭЭР орсныг л тэмдэглэнэ",
    body<{ data: { types: string[] } }>(partial).data.types.join() === "quantities",
  );
  t(
    "Тайлан ч нэг хэсэгтэй",
    body<{ reports: unknown[] }>(partial).reports.length === 1,
  );

  // Цуцлах урсгал — зөвхөн хүлээгдэж буй файл.
  const second = body<{ data: { id: string } }>(upload("tosov-2-material.xlsx")).data.id;
  t(
    "Хүлээгдэж буйг цуцална",
    handleMock("DELETE", ["imports", second], "", undefined).status === 200,
  );

  /*
   * Талбайн инженер төсөв оруулж ЧАДАХГҮЙ — импорт нь блокийн бүх мөрийг
   * сольж гүйцэтгэлийг устгадаг.
   */
  login("site_engineer@cpms.test");
  t("Талбайн инженер байршуулахгүй", upload("tosov.xlsx").status === 403);
  t("Талбайн инженер түүх харахгүй", get("blocks/blk-a-01/imports").status === 403);

  login("admin@cpms.test");
}


// ---------------------------------------------------------------------------
// НЭГ ТҮЛХҮҮР — НЭГ ХЭЛБЭР
//
// TanStack Query нь түлхүүрээр кэшилдэг. Хоёр дэлгэц ижил түлхүүр
// хэрэглээд НЭГ нь дугтуйг (`{ data, meta }`), НӨГӨӨ нь массивыг
// хадгалбал аль нь түрүүлж ачаалснаас хамаарч нөгөөдөх нь унана.
//
// Энэ нь «заримдаа л гардаг» алдаа учраас хамгийн муу төрөл: хуудсыг
// дахин ачаалахад кэш цэвэрлэгдэж, алдаа алга болдог. Яг ийм алдаа
// `/imports` дэлгэц дээр гарсан.
// ---------------------------------------------------------------------------
{
  const { readdirSync, readFileSync, statSync } = nodeFs;
  const { join } = nodePath;

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) files.push(full);
    }
  };
  walk("app");
  walk("components");
  walk("lib");

  /** түлхүүр → { дугтуй хадгалсан файлууд, задалсан файлууд } */
  const shapes = new Map<string, { enveloped: string[]; unwrapped: string[] }>();

  for (const file of files) {
    const source = readFileSync(file, "utf8");

    // `queryKey: ["нэр", …]` ба дараагийн `queryFn:` мөрийг хослуулна.
    const re = /queryKey:\s*\[\s*"([^"]+)"[^\]]*\][\s\S]{0,200}?queryFn:\s*([^\n]*(?:\n[^\n]*){0,2})/g;

    for (const m of source.matchAll(re)) {
      const key = m[1];
      const fn = m[2];

      // Зөвхөн жагсаалтын дугтуй буцаадаг дуудлагуудыг шалгана.
      if (!/listForProject|\.list\(/.test(fn)) continue;

      const entry = shapes.get(key) ?? { enveloped: [], unwrapped: [] };
      (/\.then\(\s*\(?r\)?\s*=>\s*r\.data/.test(fn) ? entry.unwrapped : entry.enveloped).push(
        file,
      );
      shapes.set(key, entry);
    }
  }

  let clashes = 0;

  for (const [key, { enveloped, unwrapped }] of shapes) {
    if (enveloped.length > 0 && unwrapped.length > 0) {
      clashes++;
      console.log(
        `   «${key}» → дугтуй: ${enveloped.join(", ")} | задалсан: ${unwrapped.join(", ")}`,
      );
    }
  }

  t(
    "Нэг queryKey дор нэг л хэлбэр",
    clashes === 0,
    clashes === 0 ? `${shapes.size} түлхүүр шалгав` : `${clashes} зөрчил`,
  );
}


// ---------------------------------------------------------------------------
// Бетон захиалга
//
// ГОЛ НЬ МАЯГТ БИШ, ҮЛДЭГДЭЛ. Цаасан бланк аль хэдийн байгаа — систем
// нэмж байгаа цорын гагц зүйл нь «энэ давхарт төсвөөр хэд байсан, хэд
// захиалсан, хэд үлдсэн» гэдэг.
// ---------------------------------------------------------------------------
{
  const login = (email: string) =>
    handleMock("POST", ["auth", "login"], "", { email, password: "x" });

  const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

  const balanceRows = () =>
    body<{ data: { locationId: string; locationName: string; remaining: number }[] }>(
      get("blocks/blk-a-01/concrete-balance"),
    ).data;

  const first = balanceRows()[0];
  t("Үлдэгдлийн хүснэгт давхраар гарна", first != null, first?.locationName);

  const create = (locationId: string, quantity: number, pourDate = soon) =>
    handleMock("POST", ["blocks", "blk-a-01", "concrete-orders"], "", {
      locationId,
      materialId: "mat-m250",
      pourDate,
      pourHalf: "am",
      pourTime: "08:30",
      structure: "Хучилт",
      concreteClass: "B25",
      slumpCm: 12,
      quantity,
      needsPump: true,
    });

  login("site_engineer@cpms.test");

  const draft = create(first.locationId, 180);
  t("Захиалга үүсэв", draft.status === 201, String(draft.status));

  const order = body<{ data: { id: string; status: string; number: string } }>(draft).data;
  t("Драфтаар үүснэ", order.status === "draft", order.status);
  t("Дугаар автоматаар", /^БЗ-\d{4}-\d{3}$/.test(order.number), order.number);

  // ДРАФТ нь төсөв ИДДЭГГҮЙ.
  t(
    "Драфт төсөв иддэггүй",
    balanceRows().find((r) => r.locationId === first.locationId)!.remaining === first.remaining,
  );

  t(
    "Илгээхэд 200",
    handleMock("POST", ["concrete-orders", order.id, "submit"], "", {}).status === 200,
  );

  const afterSubmit = balanceRows().find((r) => r.locationId === first.locationId)!;
  t(
    "Илгээсний дараа төсөв иднэ",
    afterSubmit.remaining === first.remaining - 180,
    String(afterSubmit.remaining),
  );

  // Захиалсан хүн ӨӨРӨӨ баталгаажуулахгүй.
  login("admin@cpms.test");
  const ownDraft = body<{ data: { id: string } }>(create(first.locationId, 10)).data;
  handleMock("POST", ["concrete-orders", ownDraft.id, "submit"], "", {});
  t(
    "Захиалсан хүн өөрөө баталгаажуулахгүй",
    handleMock("POST", ["concrete-orders", ownDraft.id, "confirm"], "", {}).status === 422,
  );

  t(
    "Өөр инженер баталгаажуулна",
    handleMock("POST", ["concrete-orders", order.id, "confirm"], "", {}).status === 200,
  );

  // Талбайн инженер баталгаажуулж чадахгүй.
  login("site_engineer@cpms.test");
  t(
    "Талбайн инженер баталгаажуулахгүй",
    handleMock("POST", ["concrete-orders", ownDraft.id, "confirm"], "", {}).status === 403,
  );

  /*
   * Нийлүүлэлт нь БОДИТ хэмжээгээр иднэ — машин 7 м³-аар ирдэг тул
   * 18 захиалбал 21 ирнэ.
   */
  const beforeDeliver = balanceRows().find((r) => r.locationId === first.locationId)!.remaining;
  t(
    "Нийлүүлэлт бүртгэнэ",
    handleMock("POST", ["concrete-orders", order.id, "deliver"], "", { deliveredQty: 200 })
      .status === 200,
  );
  t(
    "Бодит хэмжээгээр иднэ",
    balanceRows().find((r) => r.locationId === first.locationId)!.remaining ===
      beforeDeliver - 20,
    "180 → 200",
  );

  t(
    "Нийлүүлэгдсэнийг цуцлахгүй",
    handleMock("POST", ["concrete-orders", order.id, "cancel"], "", {
      reason: "Шаардлагагүй болсон.",
    }).status === 422,
  );

  // Цуцлах нь төсвийг СУЛЛАНА.
  const beforeCancel = balanceRows().find((r) => r.locationId === first.locationId)!.remaining;
  t(
    "Цуцлахад шалтгаан заавал",
    handleMock("POST", ["concrete-orders", ownDraft.id, "cancel"], "", {}).status === 422,
  );
  handleMock("POST", ["concrete-orders", ownDraft.id, "cancel"], "", {
    reason: "Цутгалт хойшлогдлоо.",
  });
  t(
    "Цуцлахад төсөв суллагдана",
    balanceRows().find((r) => r.locationId === first.locationId)!.remaining ===
      beforeCancel + 10,
  );

  // Хэтрэлтийг ТООГООР хэлнэ.
  const over = body<{ data: { overBy: number; remainingQty: number } }>(
    create(first.locationId, 1000),
  ).data;
  t("Хэтрэлтийг тоогоор хэлнэ", over.overBy > 0, String(over.overBy));

  // Яаралтай захиалгыг ТЭМДЭГЛЭНЭ, хориглохгүй.
  const rushDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const rush = create(first.locationId, 5, rushDate);
  t("Яаралтай захиалга зөвшөөрөгдөнө", rush.status === 201, String(rush.status));
  t("Яаралтайг тэмдэглэнэ", body<{ data: { isRush: boolean } }>(rush).data.isRush);

  // Өнгөрсөн огноо.
  const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  t("Өнгөрсөн огноонд захиалахгүй", create(first.locationId, 5, past).status === 422);

  // Гүйцэтгэгчид хаалттай. (Гүйцэтгэгч нь имэйлээр биш КОДООР нэвтэрнэ.)
  handleMock("POST", ["auth", "contractor-login"], "", { code: "GOO-2026" });
  t(
    "Гүйцэтгэгч бетон захиалга харахгүй",
    get("projects/prj-inel-01/concrete-orders").status === 403,
  );
  t("Гүйцэтгэгч захиалга бичихгүй", create(first.locationId, 5).status === 403);

  handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });
}


// ---------------------------------------------------------------------------
// canCheck ба canInspect нь ӨӨР эрх
//
// 1-р шат (талбайн шалгалт) нь эцсийн батлахаас ӨРГӨН. Хоёрыг нэг
// эрхээр хэмжвэл талбайн инженерт шалгах форм огт харагдахгүй болж,
// хоёр шаттай урсгал гацна — яг тэр алдаа бодит системд гарсан.
// ---------------------------------------------------------------------------
{
  const me = () => body<{ data: { role: string; canCheck: boolean; canInspect: boolean } }>(get("me")).data;

  handleMock("POST", ["auth", "login"], "", { email: "site_engineer@cpms.test", password: "x" });
  const site = me();
  t("Талбайн инженер 1-р шат хийнэ", site.canCheck === true, String(site.canCheck));
  t("Талбайн инженер эцсийн батлахгүй", site.canInspect === false, String(site.canInspect));

  handleMock("POST", ["auth", "login"], "", { email: "inspector@cpms.test", password: "x" });
  const insp = me();
  t("Хяналтын инженер хоёуланг нь хийнэ", insp.canCheck && insp.canInspect);

  handleMock("POST", ["auth", "contractor-login"], "", { code: "GOO-2026" });
  const ctr = me();
  t("Гүйцэтгэгч аль нь ч хийхгүй", !ctr.canCheck && !ctr.canInspect);

  handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });
}


// ---------------------------------------------------------------------------
// Дарааллыг блокоор шүүх
//
// 75 барилгын цогцолборт бүх блокийн ажил нэг жагсаалтад холилдоно.
// Шүүлтүүр нь ЖАГСААЛТ ба ТООНД хоёуланд нь үйлчлэх ёстой — зөвхөн
// нэгэнд нь хэрэглэвэл таб дээр «12» гэж бичигдээд жагсаалтад 3 мөр
// гарч, хэрэглэгч алдаа гэж бодно.
// ---------------------------------------------------------------------------
{
  handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });

  const all = body<{ data: { blockName?: string | null }[]; meta: { total: number } }>(
    get("projects/prj-inel-01/queue", "?type=inspection&pageSize=200"),
  );

  t("Дараалал блокийн НЭРийг буцаана", all.data.every((w) => Boolean(w.blockName)));

  const filtered = body<{ data: { blockName?: string | null }[]; meta: { total: number } }>(
    get("projects/prj-inel-01/queue", "?type=inspection&blockId=blk-a-01&pageSize=200"),
  );

  t(
    "Шүүсэн жагсаалт нэг блоктой",
    filtered.data.every((w) => w.blockName === all.data.find((x) => x.blockName)?.blockName) ||
      new Set(filtered.data.map((w) => w.blockName)).size <= 1,
  );
  t("Шүүлт жагсаалтыг багасгана", filtered.meta.total <= all.meta.total);

  const counts = body<{ data: { inspection: number } }>(
    get("projects/prj-inel-01/queue/counts", "?blockId=blk-a-01"),
  ).data;

  t(
    "Таб дээрх тоо жагсаалттай ТААРНА",
    counts.inspection === filtered.meta.total,
    `${counts.inspection} ↔ ${filtered.meta.total}`,
  );
}


// ---------------------------------------------------------------------------
// Select бүр `items` өгсөн байх
//
// Base UI-ийн `Select.Value` нь сонгогдсон УТГЫГ харуулдаг, шошгыг БИШ.
// `items` мартвал товчин дээр UUID эсвэл «am» гэсэн түлхүүр шууд гарна —
// хэрэглэгч систем эвдэрсэн гэж бодно. Яг тэр алдаа дарааллын дэлгэц
// дээр гарсан.
// ---------------------------------------------------------------------------
{
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of nodeFs.readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
      const full = nodePath.join(dir, entry);
      if (nodeFs.statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".tsx")) files.push(full);
    }
  };
  walk("app");
  walk("components");

  const missing: string[] = [];

  for (const file of files) {
    if (file.endsWith("components/ui/select.tsx")) continue;

    const source = nodeFs.readFileSync(file, "utf8");

    // `<Select ...>` нээлтийн шошго бүрийг тусад нь шалгана.
    for (const m of source.matchAll(/<Select(\s[^>]*?)>/g)) {
      if (!/\bitems=/.test(m[1])) {
        missing.push(`${file}: ${m[1].replace(/\s+/g, " ").trim().slice(0, 60)}`);
      }
    }
  }

  t(
    "Select бүр `items`-тэй",
    missing.length === 0,
    missing.length === 0 ? "бүгд зөв" : missing.join(" | "),
  );
}


// ---------------------------------------------------------------------------
// Материалын захиалга
//
// Бетоноос ХОЁР зүйлээр ялгарна, хоёуланг нь шалгана:
//   1. Үлдэгдэл БЛОКООР бодогдоно (давхраар биш)
//   2. ЗӨВШӨӨРСӨН тоо нь захиалсанаас зөрж болно, төсвөөс тэр нь хасагдана
// ---------------------------------------------------------------------------
{
  const login = (email: string) =>
    handleMock("POST", ["auth", "login"], "", { email, password: "x" });

  const balanceOf = (materialId: string) =>
    body<{ data: { materialId: string; budget: number; ordered: number; remaining: number }[] }>(
      get("blocks/blk-a-01/material-balance"),
    ).data.find((r) => r.materialId === materialId)!;

  const create = (lines: unknown[], kind = "main") =>
    handleMock("POST", ["blocks", "blk-a-01", "material-orders"], "", { kind, lines });

  login("site_engineer@cpms.test");

  const start = balanceOf("mat-pum20");
  t("Үлдэгдлийн хүснэгт төсөвтэй", start.budget > 0, String(start.budget));

  const created = create([{ materialId: "mat-pum20", quantity: 300, stockQty: 20 }]);
  t("Захиалга үүсэв", created.status === 201, String(created.status));

  const order = body<{
    data: { id: string; number: string; status: string; lines: { id: string }[] };
  }>(created).data;

  t("Дугаар автоматаар", /^МЗ-\d{4}-\d{3}$/.test(order.number), order.number);
  t("Драфт төсөв иддэггүй", balanceOf("mat-pum20").ordered === start.ordered);

  t(
    "Илгээхэд 200",
    handleMock("POST", ["material-orders", order.id, "submit"], "", {}).status === 200,
  );
  t(
    "Илгээсний дараа төсөв иднэ",
    balanceOf("mat-pum20").remaining === start.remaining - 300,
    String(balanceOf("mat-pum20").remaining),
  );

  // ЗӨВШӨӨРСӨН тоо нь төсвөөс хасагдана, захиалсан нь БИШ.
  login("inspector@cpms.test");
  const confirmed = handleMock("POST", ["material-orders", order.id, "confirm"], "", {
    approved: { [order.lines[0].id]: 180 },
  });
  t("Баталгаажуулахад 200", confirmed.status === 200, String(confirmed.status));
  t(
    "Зөвшөөрсөн тоо төсвөөс хасагдана",
    balanceOf("mat-pum20").remaining === start.remaining - 180,
    `${balanceOf("mat-pum20").remaining} (300 биш 180)`,
  );

  // Нийлүүлэлт нь зөвшөөрснийг ч дарна.
  login("site_engineer@cpms.test");
  handleMock("POST", ["material-orders", order.id, "deliver"], "", {
    delivered: { [order.lines[0].id]: 200 },
  });
  t(
    "Ирсэн тоо зөвшөөрснийг дарна",
    balanceOf("mat-pum20").remaining === start.remaining - 200,
    String(balanceOf("mat-pum20").remaining),
  );

  /*
   * Захиалсан хүн ӨӨРӨӨ баталгаажуулахгүй.
   *
   * Бодит бүртгэлтэй и-мэйл: mock нь олдоогүй и-мэйлийг анхдагч
   * (админ) сесс рүү унагадаг тул байхгүй хүнээр шалгавал огт өөр
   * хүний эрхийг хэмжинэ.
   */
  login("admin@cpms.test");
  const own = body<{ data: { id: string } }>(create([{ materialId: "mat-utas", quantity: 5 }])).data;
  handleMock("POST", ["material-orders", own.id, "submit"], "", {});
  t(
    "Захиалсан хүн өөрөө баталгаажуулахгүй",
    handleMock("POST", ["material-orders", own.id, "confirm"], "", {}).status === 422,
  );

  // Хэтрэлтийг мөрөөр хэлнэ, хориглохгүй.
  login("site_engineer@cpms.test");
  const over = body<{ data: { overLineCount: number; lines: { overBy: number }[] } }>(
    create([{ materialId: "mat-utas", quantity: 99999 }]),
  ).data;
  t("Хэтрэлтийг мөрөөр хэлнэ", over.overLineCount === 1 && over.lines[0].overBy > 0);

  // Төсөвт байхгүй зүйлийг гараар захиалж болно.
  const free = body<{ data: { lines: { budgetQty: number | null; name: string }[] } }>(
    create([{ name: "Шатны тор", unit: "ш", quantity: 12 }]),
  ).data;
  t("Гараар бичсэн мөр зөвшөөрөгдөнө", free.lines[0].name === "Шатны тор");
  t("Төсөвгүй мөрөнд үлдэгдэл алга", free.lines[0].budgetQty === null);

  // Арматурын нийт жин.
  const rebar = body<{ data: { isRebar: boolean; lines: { totalWeightKg: number | null }[] } }>(
    create([{ materialId: "mat-f12", quantity: 2000, unitWeightKg: 10.656 }], "rebar"),
  ).data;
  t("Арматурын нийт жин бодогдов", rebar.isRebar && rebar.lines[0].totalWeightKg === 21312);

  // Эрх.
  login("inspector@cpms.test");
  t("Хяналтын инженер захиалга бичихгүй", create([{ materialId: "mat-utas", quantity: 1 }]).status === 403);

  handleMock("POST", ["auth", "contractor-login"], "", { code: "GOO-2026" });
  t(
    "Гүйцэтгэгч материалын захиалга харахгүй",
    get("projects/prj-inel-01/material-orders").status === 403,
  );

  handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });
}


// ---------------------------------------------------------------------------
// Блокийн ерөнхий тайлан
//
// Таван хэсэг зэрэг гарах ёстой: гүйцэтгэл, мөнгө, хугацаа, чанар,
// материал. «Барилга хэр явж байна» гэдэгт нэг тоо хариулдаггүй.
// ---------------------------------------------------------------------------
{
  handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });

  const report = body<{
    data: Record<string, unknown> & {
      progress: { workItems: number; percentage: number };
      byGroup: unknown[];
    };
  }>(get("blocks/blk-a-01/report")).data;

  for (const key of ["block", "progress", "byGroup", "money", "schedule", "quality", "materials"]) {
    t(`Тайланд «${key}» хэсэг бий`, key in report);
  }

  t("Ажлын мөр тоологдов", report.progress.workItems > 0, String(report.progress.workItems));

  // --- Орсон төсвийг харах ---
  const budget = body<{
    data: {
      work: { name: string; works: number; plannedQty: number }[];
      materials: { locations: unknown[] }[];
    };
  }>(get("blocks/blk-a-01/budget")).data;

  t("Төсөв ажлын ТӨРЛӨӨР нэгтгэгдэв", budget.work.length > 0, `${budget.work.length} төрөл`);
  t(
    "Нэг төрөлд олон ажил багтав",
    budget.work.some((r) => r.works > 1),
    "нэгтгэл ажиллаж байна",
  );
  t(
    "Материалд байршлын задаргаа бий",
    budget.materials.every((m) => m.locations.length > 0),
  );

  // --- Үнийг ГАРААР тавих ---
  {
    /*
     * ОЛОН ажилтай төрөл сонгоно.
     *
     * Эхний төрөл нь блокийн түвшний (ганц ажилтай) байж болно —
     * тэр үед «бүх ажилд тавигдсан» гэдгийг шалгах утгагүй.
     */
    const row = body<{
      data: { work: { workTypeId: string; works: number; unitPrice: number | null }[] };
    }>(get("blocks/blk-a-01/budget")).data.work.find((r) => r.works > 1)!;

    const setPrice = (unitPrice: number | null) =>
      handleMock("PATCH", ["blocks", "blk-a-01", "budget", "work-price"], "", {
        workTypeId: row.workTypeId,
        unitPrice,
      });

    t("0 үнэ татгалзагдана", setPrice(0).status === 422);

    const saved = setPrice(15000);
    t("Үнэ хадгалагдана", saved.status === 200, String(saved.status));
    // Жинхэнэ дүрэм: тэр төрлийн ажил БҮРД тавигдсан байх ёстой.
    t(
      "Тэр төрлийн БҮХ ажилд тавигдана",
      body<{ data: { updated: number } }>(saved).data.updated === row.works,
      `${body<{ data: { updated: number } }>(saved).data.updated} / ${row.works}`,
    );

    const after = body<{ data: { work: { workTypeId: string; unitPrice: number | null }[] } }>(
      get("blocks/blk-a-01/budget"),
    ).data.work.find((r) => r.workTypeId === row.workTypeId)!;

    t("Төсөвт шинэ үнэ харагдана", after.unitPrice === 15000, String(after.unitPrice));

    t("Хоосон үнэ арилгана", setPrice(null).status === 200);

    // Засах эрх нь ХАРАХААС нарийн.
    handleMock("POST", ["auth", "login"], "", { email: "inspector@cpms.test", password: "x" });
    t("Хяналтын инженер үнэ засахгүй", setPrice(1000).status === 403);
    handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });
  }
  /*
   * --- Материалын мөрийг ГАРААР нэмэх, хасах ---
   *
   * Импорт эвдэрсэн нүдтэй мөрийг унагаадаг (А1-д 109). Тэднийг
   * нөхөх зам байхгүй бол төсөв дутуу хэвээр үлдэнэ.
   */
  {
    const locs = body<{ data: { id: string; name: string }[] }>(
      get("blocks/blk-a-01/locations", "level=floor"),
    ).data;

    const add = (patch: Record<string, unknown> = {}) =>
      handleMock("POST", ["blocks", "blk-a-01", "material-budget-items"], "", {
        code: "9.9.1",
        name: "Гараар нэмсэн тор",
        unit: "м2",
        actualUnitPrice: 12000,
        marketUnitPrice: 13000,
        quantities: [
          { locationId: locs[0].id, quantity: 40 },
          { locationId: locs[1].id, quantity: 60 },
        ],
        ...patch,
      });

    t("Зөвшөөрөгдөөгүй нэгж татгалзагдана", add({ unit: "тонн" }).status === 422);
    t("Задаргаагүй бол татгалзана", add({ quantities: [] }).status === 422);
    t(
      "Өөр блокийн байршил татгалзагдана",
      add({ quantities: [{ locationId: "огт-байхгүй", quantity: 5 }] }).status === 422,
    );

    const addedId = body<{ data: { id: string } }>(add()).data.id;

    const row = body<{
      data: { materials: { id: string; totalQty: number; locations: unknown[] }[] };
    }>(get("blocks/blk-a-01/budget")).data.materials.find((m) => m.id === addedId)!;

    // Нийт нь задаргааны НИЙЛБЭР — тусад нь авдаггүй.
    t("Нийт нь задаргаанаас бодогдов", row.totalQty === 100, String(row.totalQty));
    t("Задаргаа хадгалагдав", row.locations.length === 2, String(row.locations.length));

    // Нэг блокт нэг код хоёр удаа орвол үлдэгдэл хоёр хуваагдана.
    t("Давхардсан код татгалзагдана", add().status === 422);

    t(
      "Хяналтын инженер мөр нэмэхгүй",
      (() => {
        handleMock("POST", ["auth", "login"], "", { email: "inspector@cpms.test", password: "x" });
        const res = add({ code: "9.9.2" }).status === 403;
        handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });

        return res;
      })(),
    );

    const removed = handleMock("DELETE", ["material-budget-items", addedId], "", {});
    t("Мөр хасагдана", removed.status === 200, String(removed.status));
    t(
      "Хассан мөр төсөвт үлдсэнгүй",
      !body<{ data: { materials: { id: string }[] } }>(
        get("blocks/blk-a-01/budget"),
      ).data.materials.some((m) => m.id === addedId),
    );

    /*
     * ЗАХИАЛГАТАЙ материалыг хасуулахгүй: үлдэгдэл нь төсөвтэй
     * харьцуулж бодогддог тул төсөв алга болвол захиалга утгагүй
     * болно.
     */
    const busy = body<{ data: { materialId: string; ordered: number }[] }>(
      get("blocks/blk-a-01/material-balance"),
    ).data.find((r) => r.ordered > 0);

    t("Захиалгатай материал олдов", Boolean(busy), busy?.materialId ?? "алга");

    t(
      "Захиалгатай мөр хасагдахгүй",
      handleMock("DELETE", ["material-budget-items", `mbi-${busy!.materialId}`], "", {}).status ===
        422,
    );
  }

  t("Бүлгээр задарсан", report.byGroup.length > 0, String(report.byGroup.length));

  // Гүйцэтгэгч мөнгө агуулсан тайлан ХАРАХГҮЙ.
  handleMock("POST", ["auth", "contractor-login"], "", { code: "GOO-2026" });
  t("Гүйцэтгэгч тайлан харахгүй", get("blocks/blk-a-01/report").status === 403);
  t("Гүйцэтгэгч төсөв харахгүй", get("blocks/blk-a-01/budget").status === 403);

  handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });
}

// ---------------------------------------------------------------------------
// Блок устгах
//
// ХАМГИЙН АЮУЛТАЙ үйлдэл: байршил, ажлын мөр, явц, шалгалт, зураг,
// төсөв, захиалга бүгд каскадаар дагаж устана. Хоёр түгжээ: зөвхөн
// админ, бөгөөд блокийн нэрийг бичиж баталгаажуулна.
//
// ЭНЭ БҮЛЭГ ХАМГИЙН СҮҮЛД явна — блок устгадаг тул дараагийн шалгуурууд
// түүнийг олохгүй болно.
// ---------------------------------------------------------------------------
{
  const login = (email: string) =>
    handleMock("POST", ["auth", "login"], "", { email, password: "x" });

  const target = "blk-a-01";
  const name = db.blocks.find((x) => x.id === target)!.name;

  const del = (confirmName?: string) =>
    handleMock("DELETE", ["blocks", target], "", confirmName ? { confirmName } : {});

  /*
   * Админ БИШ хүн устгахгүй.
   *
   * ЗӨВХӨН БОДИТ бүртгэлтэй и-мэйл хэрэглэнэ: mock нь олдоогүй
   * и-мэйлийг анхдагч (АДМИН) сесс рүү унагадаг тул байхгүй хүнээр
   * шалгавал «устгахгүй» гэсэн шалгуур админаар ажиллаж, блокийг
   * үнэхээр устгачихна.
   */
  for (const email of ["inspector@cpms.test", "site_engineer@cpms.test"]) {
    login(email);
    t(`${email.split("@")[0]} устгахгүй`, del(name).status === 403);
    t(`${email.split("@")[0]} тооллого харахгүй`, get(`blocks/${target}/deletion-impact`).status === 403);
  }

  login("admin@cpms.test");

  const impact = body<{ data: { blockName: string; workItems: number } }>(
    get(`blocks/${target}/deletion-impact`),
  ).data;

  t("Тооллого блокийн нэртэй", impact.blockName === name, impact.blockName);
  t("Тооллого ажлын мөр тоолов", impact.workItems > 0, String(impact.workItems));

  t("Нэргүй бол 422", del().status === 422);
  t("Буруу нэр бол 422", del("Огт өөр нэр").status === 422);
  t("Блок хэвээр байна", db.blocks.some((x) => x.id === target));

  const removed = del(name);
  t("Нэр таарвал устана", removed.status === 200, String(removed.status));
  t("Блок жагсаалтаас алга", !db.blocks.some((x) => x.id === target));
  t("Байршил нь ч устав", !db.locations.some((l) => l.blockId === target));
  t("Ажлын мөр нь ч устав", !db.workItems.some((w) => w.blockId === target));
}

console.log("\nАмжилтгүй: " + fail);
process.exit(fail ? 1 : 0);
