# CPMS API v2 — endpoint жагсаалт

Инэл ХХК-ийн шаардлагад тохирсон шинэ өгөгдлийн загварын REST гадаргуу.
Одоогийн v1-ийн конвенцийг хадгална: `{ data }` / `{ data, meta }` / `{ error }` дугтуй,
жагсаалтад `page` + `pageSize`, шинэчлэлтэд `PATCH`.

Base: `/api/v1` (хувилбар ахиулах бол `/api/v2`)

**Тэмдэглэгээ:** 🆕 шинэ · ♻️ өөрчлөгдсөн · ✅ хэвээр · ❌ хасагдана

---

## 0. Нэвтрэлт ба хэрэглэгч 🆕

Одоогийн API-д auth огт байхгүй. Туслан гүйцэтгэгч кодоор нэвтрэх шаардлага
захиалагчаас гарсан тул хоёр төрлийн нэвтрэлт хэрэгтэй.

| Method | Path | Тайлбар |
|---|---|---|
| POST | `/auth/login` | Ажилтны нэвтрэлт → access + refresh token |
| POST | `/auth/contractor-login` | `{ code }` — туслан гүйцэтгэгчийн төлөөлөгчийн код |
| POST | `/auth/refresh` | Token сэргээх |
| POST | `/auth/logout` | Гарах |
| GET | `/me` | Хэрэглэгч, role, хариуцах хүрээ (assigned blocks/work types) |
| GET | `/me/queue` | Тухайн хэрэглэгчийг хүлээж буй ажил (шалгах, батлах, хоцорсон) |
| GET | `/users` · POST | Хэрэглэгчийн удирдлага |
| PATCH | `/users/:id` | Role, хамрах хүрээ өөрчлөх |
| POST | `/users/:id/delegate` | Орлон ажиллах эрх шилжүүлэх (хугацаатай) |
| GET | `/roles` | Role + permission matrix |

> Хамрах хүрээ (scope) нь зөвхөн UI-д биш **backend-д** мөрдөгдөх ёстой:
> талбайн инженер өөрийн 1–2 блокоос гадуурх WorkItem-ийг API-аар ч авч чадахгүй байх.

---

## 1. Мастер өгөгдөл

### Компани, төсөл ✅ хэвээр

| Method | Path |
|---|---|
| GET · POST | `/companies` |
| GET · PATCH · DELETE | `/companies/:id` |
| GET · POST | `/companies/:id/projects` |
| GET · PATCH · DELETE | `/projects/:id` |

### Блок (барилга) 🆕

| Method | Path | Тайлбар |
|---|---|---|
| GET · POST | `/projects/:id/blocks` | Хавсралт-1-ийн 75 барилга |
| GET · PATCH · DELETE | `/blocks/:id` | барилга №, зориулалт, давхар, айлын тоо, designId |

### Байршил 🆕

| Method | Path | Тайлбар |
|---|---|---|
| GET | `/blocks/:id/locations` | `?type=floor&parentId=&flat=true` — мод эсвэл хавтгай |
| POST | `/blocks/:id/locations` | Ганц зангилаа |
| POST | `/blocks/:id/locations/generate` | **Бөөнөөр үүсгэх** — `{ floors: 16, unitsPerFloor: 9, basements: 1 }` |
| GET · PATCH · DELETE | `/locations/:id` | |

> `generate` заавал хэрэгтэй. 16 давхар × 9 айл = 144 зангилаа, гараар үүсгэхгүй.

### Ажлын төрлийн сан 🆕

| Method | Path | Тайлбар |
|---|---|---|
| GET · POST | `/work-type-groups` | Угсралт, Өрлөг, Засал, Гадна ажил |
| GET | `/work-types` | `?groupId=&search=&page=` |
| POST | `/work-types` | нэр, нэгж (м²/м³/ш), бүлэг, өгөгдмөл хяналтын role |
| GET · PATCH · DELETE | `/work-types/:id` | |

### Гүйцэтгэгч ✅ хэвээр

| Method | Path |
|---|---|
| GET · POST | `/contractors` |
| GET · PATCH · DELETE | `/contractors/:id` |
| GET | `/contractors/:id/projects` |

---

## 2. Загвар ба бөөнөөр үүсгэх 🆕

Энэ бүлэг бол системийг ажиллах боломжтой болгож байгаа хэсэг.
Үүнгүйгээр нэг блокийн ~2,500 WorkItem-ийг гараар оруулах шаардлагатай болно.

| Method | Path | Тайлбар |
|---|---|---|
| GET · POST | `/block-designs` | 9 стандарт зураг төсөл |
| GET · PATCH · DELETE | `/block-designs/:id` | |
| GET · POST | `/block-designs/:id/items` | Загварын мөр: workType × байршлын хэв × тоо хэмжээ |
| POST | `/block-designs/import` | **Excel (Хавсралт-2) upload** → задлаад preview буцаана |
| POST | `/block-designs/:id/apply` | `{ blockId }` → WorkItem бөөнөөр үүснэ |

**`/import` хариу — шууд хадгалахгүй, эхлээд урьдчилан харуулна:**

```json
{
  "data": {
    "parsed": 47,
    "withQuantity": 17,
    "missingQuantity": 30,
    "rows": [
      { "group": "Угсралт", "workType": "зоориос техникийн давхар угсралт",
        "unit": "м2", "perFloor": 648, "floors": 17, "total": 11132.1 }
    ],
    "warnings": ["30 ажлын төрөлд тоо хэмжээ бөглөгдөөгүй"]
  }
}
```

**`/apply` нь удаан ажиллана** (2,500 мөр) — синхрон биш байх нь зүйтэй:

```json
{ "data": { "jobId": "...", "status": "queued", "estimatedItems": 2480 } }
```

| Method | Path | Тайлбар |
|---|---|---|
| GET | `/jobs/:id` | `status`, `progress`, `result` |

---

## 3. WorkItem — гол нөөц ♻️

Хуучин `/activities/:id/tasks` бүхэлдээ үүгээр солигдоно.

| Method | Path | Тайлбар |
|---|---|---|
| GET | `/blocks/:id/work-items` | Доорх шүүлтүүрүүдтэй |
| POST | `/blocks/:id/work-items` | Ганцаар нэмэх |
| POST | `/blocks/:id/work-items/bulk` | Массиваар нэмэх |
| GET · PATCH · DELETE | `/work-items/:id` | |
| PATCH | `/work-items/bulk` | Олноор төлөв/гүйцэтгэгч солих |

**Шүүлтүүр (бүгд заавал дэмжигдэнэ):**

```
?locationId=      тухайн давхар/айл (дэд зангилаа хамт: &includeDescendants=true)
&workTypeId=      ажлын төрөл
&workTypeGroupId= бүлэг
&contractorId=    гүйцэтгэгч
&status=          not_started|in_progress|completed|on_hold|cancelled
&reviewState=     none|pending|approved|returned
&overdueDays=3    хугацаа хэтэрсэн
&page=&pageSize=&sort=
```

**WorkItem объект — тооцоолсон талбарууд backend-ээс ирнэ:**

```json
{
  "id": "…", "blockId": "…", "locationId": "…", "workTypeId": "…",
  "name": "Тоосгон өрлөг — 5-р давхар",
  "unit": "м2",
  "plannedQty": 648,
  "reportedQty": 420,
  "acceptedQty": 380,
  "remainingQty": 268,
  "percentage": 59,
  "plannedStartDate": "2026-09-01", "plannedEndDate": "2026-09-14",
  "status": "in_progress", "reviewState": "pending",
  "overdueDays": 0,
  "contractor": { "id": "…", "name": "…" },
  "location": { "path": "А блок › 1 орц › 5 давхар" }
}
```

> `remainingQty` ба `percentage`-ийг **client бодохгүй**. `acceptedQty`-аас
> бодогдоно (мэдээлсэн биш, батлагдсанаар).

---

## 4. Гүйцэтгэл ♻️

| Method | Path | Тайлбар |
|---|---|---|
| GET | `/work-items/:id/progress` | **Заавал шинэ→хуучин дараалалтай**, эсвэл `?sort=-recordedAt` |
| POST | `/work-items/:id/progress` | `{ completedQty, recordedAt, workersCount, remarks, photoIds[] }` |
| DELETE | `/progress/:id` | Зөвхөн батлагдаагүй бичлэг, эрхтэй хэрэглэгч |
| GET | `/blocks/:id/daily-report?date=` | Өдөр тутмын тайлан |
| POST | `/blocks/:id/daily-report` | Ирц, ажиллагсдын тоо, буулгасан материал |

**Хүчинтэй эсэхийг backend шалгана:** `completedQty > remainingQty` бол `422`.
Одоогийн апп-д 0–100-аас гадуур хувь илгээгддэг алдаа энэ түвшинд таслагдана.

---

## 5. Зураг 🆕

| Method | Path | Тайлбар |
|---|---|---|
| POST | `/uploads` | Presigned URL авах эсвэл шууд upload → `fileId` |
| POST | `/work-items/:id/photos` | `{ fileId, type: before\|progress\|after, takenAt, geo }` |
| GET | `/work-items/:id/photos` | |
| DELETE | `/photos/:id` | **Батлагдсаны дараа 409** — RULE-10 |

---

## 6. Шалгалт ба баталгаажуулалт ♻️

Одоогийн `remarks`-д `[БАТЛАВ]` бичдэг арга бүрэн хасагдана. ❌

| Method | Path | Тайлбар |
|---|---|---|
| GET | `/work-items/:id/inspections` | Түүх |
| POST | `/work-items/:id/inspections` | Доорх body |
| GET | `/projects/:id/inspections` | `?status=pending&inspectorId=` — хяналтын дараалал |

```json
{
  "stage": "general_contractor",     // эсвэл "client"
  "result": "accepted",              // accepted | rejected | partial
  "acceptedQty": 380,
  "rejectedQty": 40,
  "reason": "Босоо байдал зөрсөн",   // rejected/partial үед заавал
  "photoIds": ["…"]
}
```

**Татгалзсан үед сервер өөрөө rework үүсгэнэ:**

```json
{ "data": { "id": "…", "reworkWorkItemId": "…" } }
```

| Method | Path | Тайлбар |
|---|---|---|
| GET | `/work-items/:id/rework` | Эх ажлын дахин хийлтүүд |
| PATCH | `/rework/:id` | Материал/хөлсний зардал, хариуцагч |

---

## 7. Асуудал / зогсолт 🆕

| Method | Path | Тайлбар |
|---|---|---|
| GET · POST | `/work-items/:id/issues` | 7 ангилал: гүйцэтгэгч олдоогүй, хугацаандаа ирээгүй, тоног төхөөрөмж, материал тасалдсан, цаг агаар, гомдол/маргаан, осол |
| GET | `/projects/:id/issues` | `?status=open&severity=` |
| PATCH | `/issues/:id` | Шийдвэрлэх, хариуцагч оноох |

---

## 8. Гэрээ / тохироо 🆕

Захиалагчийн "Тохирооны хуудас" — нэгж үнэ, тоо хэмжээ, хугацаа.

| Method | Path | Тайлбар |
|---|---|---|
| GET · POST | `/contract-sheets` | Толгой: гүйцэтгэгч, блок, огноо, баталсан хүн |
| GET · PATCH | `/contract-sheets/:id` | |
| POST | `/contract-sheets/:id/items` | `{ workItemIds[], unitPrice, agreedQty, startDate, endDate }` |
| POST | `/work-items/:id/transfer` | Өөр гүйцэтгэгчид шилжүүлэх — тайлбар + ерөнхий инженерийн зөвшөөрөл заавал |

---

## 9. Материал (Phase 2, API-г одооноос төлөвлө)

| Method | Path | Тайлбар |
|---|---|---|
| GET · POST | `/materials` | Хавсралт-3 |
| GET · POST | `/work-types/:id/norms` | Орц норм: 1 нэгж ажилд хэдэн материал |
| POST | `/materials/import` | Excel-ээс норм оруулах |
| GET · POST | `/work-items/:id/material-requests` | |
| GET | `/projects/:id/material-requests` | `?status=&overdue=true` |
| PATCH | `/material-requests/:id` | Хяналтын инженер review → approve/reject |
| GET · POST | `/warehouses/:id/transactions` | Хүлээн авалт / олголт |
| GET | `/warehouses/:id/balance` | Үлдэгдэл |
| GET | `/blocks/:id/material-variance` | **Норм vs олгосон — хэтрэлт** |

`material-requests` дээр lead-time дүрэм тохируулгатай байх: бетон 48 цаг.
`requiredDate - now < leadTime` бол `422` эсвэл анхааруулга.

---

## 10. Нэгтгэсэн үзүүлэлт 🆕 — ХАМГИЙН ЧУХАЛ

Одоогийн апп даалгавар бүрийн явцыг тусад нь татаад client талдаа нэгтгэдэг.
2,500 WorkItem дээр энэ ажиллахгүй. Нэгтгэлт **backend дээр** хийгдэнэ.

| Method | Path | Буцаах |
|---|---|---|
| GET | `/blocks/:id/summary` | `?groupBy=floor\|workType\|contractor` — planned/reported/accepted qty, %, хоцролт |
| GET | `/projects/:id/summary` | Блок тус бүрээр |
| GET | `/projects/:id/dashboard` | Нийт явц, 3+ хоногийн хоцролт, хүлээгдэж буй батлах, материалын тасалдал |
| GET | `/projects/:id/delays` | `?minDays=3` |
| GET | `/contractors/:id/performance` | `?projectId=` — гүйцэтгэл, татгалзалт, дахин хийлт, хоцролт |
| GET | `/projects/:id/critical-path` | Phase 2 |

Жишээ хариу (`/blocks/:id/summary?groupBy=floor`):

```json
{
  "data": {
    "block": { "id": "…", "name": "А блок" },
    "totals": { "plannedQty": 48200, "acceptedQty": 21100, "percentage": 44 },
    "groups": [
      { "key": "loc-f-5", "label": "5-р давхар", "workItems": 204,
        "filter": { "locationId": "loc-f-5", "includeDescendants": true },
        "plannedQty": 3010, "reportedQty": 1980, "acceptedQty": 1740,
        "percentage": 58, "pendingInspections": 4, "overdue": 1 }
    ]
  }
}
```

---

## 11. Мэдэгдэл ба лог 🆕

| Method | Path | Тайлбар |
|---|---|---|
| GET | `/notifications` | `?unread=true` |
| PATCH | `/notifications/:id/read` | |
| POST | `/devices` | Push token бүртгэх (mobile) |
| GET | `/audit-logs` | `?entity=&entityId=&userId=&from=&to=` |

---

## 12. Mobile-д зориулсан шаардлага

Талбайн инженер, туслан гүйцэтгэгч зоорь, бетоны давхарт ажиллана — сүлжээ тасарна.

| Зүйл | Шаардлага |
|---|---|
| Idempotency | Бүх `POST`-д `Idempotency-Key` header дэмжих. Сүлжээ тасраад дахин илгээхэд давхар бичлэг үүсэхгүй |
| Багц илгээлт | `POST /sync/batch` — офлайнд хуримтлагдсан progress/photo-г нэг дор илгээх |
| Өөрчлөлт татах | `GET /blocks/:id/work-items?updatedSince=` — зөвхөн өөрчлөгдсөнийг татах |
| Мөргөлдөөн | `If-Match` / `updatedAt` шалгах, 409 буцаах |
| Зургийн хэмжээ | Client талд шахах, upload-ыг тусад нь (`/uploads`) |

---

## 13. Хуучин endpoint-уудын хувь заяа

| v1 | Шинэ байдал |
|---|---|
| `/companies*`, `/projects*` (CRUD) | ✅ хэвээр |
| `/contractors*` | ✅ хэвээр |
| `/projects/:id/work-packages` | ♻️ → `/work-type-groups` (ажлын бүлэг болно) |
| `/work-packages/:id/activities` | ♻️ → `/work-types` |
| `/activities/:id/tasks` | ♻️ → `/blocks/:id/work-items` |
| `/activities/:id/contractors` | ♻️ → `/contract-sheets` |
| `/tasks/:id/progress` | ♻️ → `/work-items/:id/progress` (+ `completedQty`) |
| `/activities/:id/tasks/reorder` | ♻️ → `PATCH /work-items/bulk` (`sequenceNumber`) |
| `/activities/:id/move` | ♻️ → `PATCH /work-items/:id { locationId }` |
| `/tasks/:id/dependencies` | ♻️ Phase 2 руу хойшилно |
| `/projects/:id/schedule`, `/critical-path` | ♻️ Phase 2 руу хойшилно |
| `[БАТЛАВ]` remarks арга | ❌ хасагдана → `/work-items/:id/inspections` |

---

## 14. Бүх endpoint-д мөрдөх дүрэм

1. **Жагсаалт бүр `meta.total`-той**, `pageSize`-ийн дээд хязгаар 200 боловч
   `total` ирснээр client дараагийн хуудсыг татна. Одоогийн апп-ын "чимээгүй
   таслах" алдаа давтагдахгүй.
2. **Дараалал баталгаатай.** Түүхэн жагсаалт (`progress`, `inspections`) үргэлж
   шинэ→хуучин, эсвэл `sort` параметр заавал дэмжинэ.
3. **Тооцоолсон утга серверээс.** `remainingQty`, `percentage`, `overdueDays`,
   `reviewState` — client дахин бодохгүй.
4. **Бүлэглэлтийн утгыг сервер эзэмшинэ.** `summary`-ийн бүлэг бүр өөрийгөө
   сэргээх `filter`-ыг хамт буцаана; client тал `key`-ээс шүүлтүүр таамаглахгүй.
   (Эс бөгөөс "11 ажил" гэж харуулаад дарахад 3,290 гарч ирэх зөрүү үүсдэг —
   блокийн үндэс зангилаа бүх зүйлийн эцэг байдаг.)
4. **Алдааны дугтуй тогтмол**: `{ error: { name, message, details } }`,
   валидацийн алдаа `422` + талбар бүрээр `details`.
5. **Идэвхгүй болгох, устгахгүй.** Батлагдсан гүйцэтгэл, зураг, шалгалтыг
   устгахгүй; өөрчлөлт бүр audit log үүсгэнэ.
