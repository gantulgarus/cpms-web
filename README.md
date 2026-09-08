# CPMS · Planning (web)

Next.js 16 (App Router) **planning & oversight** console for the Construction
Project Management System. It owns the office-side, structure-heavy workflows —
the mobile app (Expo, separate repo) is for field progress entry & monitoring.

This web app covers:

- **Setup / WBS** — create companies, projects (with seeded work packages),
  work packages, activities, tasks
- **Dependencies** — link tasks (FS / SS / FF / SF + lag), pick a predecessor
  from the project's whole task tree
- **CPM schedule** — wide Gantt + ES/EF/LS/LF/slack table, critical path,
  recalculate
- **Contractors** — master data + assign to activities
- **Director performance dashboard** — every subcontractor's reported progress
  and approval state, grouped by contractor
- **Approval** — director approves/returns reported progress (append-only,
  tagged `[БАТЛАВ]` / `[БУЦААВ]`)

A **role switch** in the header toggles Director vs Contractor mode (the API has
no auth; this is a client-side simulation).

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

## Architecture

- **`app/api/cpms/[...path]`** — same-origin proxy route handler. The browser
  only calls `/api/cpms/*`; the Next server forwards to the CPMS REST backend.
  Avoids CORS and HTTPS→HTTP mixed-content.
- **`lib/api`** — typed client + endpoint functions (mirrors the OpenAPI spec).
- **TanStack Query** for fetching/mutations + cache invalidation.
- **shadcn/ui** (Base UI + Tailwind v4) components.
- Pages are client components using `useParams` / `useRouter`.

### Configuration

The backend origin defaults to the hosted instance. Override server-side:

```bash
CPMS_API_URL=http://localhost:4000/api/v1 npm run dev
```

## API v2 — mock горим

Шинэ өгөгдлийн загварын гэрээ `docs/api-v2-endpoints.md`-д тодорхойлогдсон.
Backend бэлэн болтол UI-г **бодит хэмжээний** өгөгдөл дээр барихад зориулж
proxy дотор mock суулгасан.

```bash
CPMS_MOCK=1 NEXT_PUBLIC_CPMS_V2=1 npm run dev
```

`CPMS_MOCK=1` — proxy mock-оос хариулна. `NEXT_PUBLIC_CPMS_V2=1` — v2 дээр
баригдсан дэлгэц цэсэнд гарна (**Блок (v2)** → `/blocks/blk-a-01`).

Энэ үед `/api/cpms/*` нь backend руу дамжуулахгүй, `lib/mock`-оос хариулна.
Апп-ын код ялгааг мэдэхгүй — тохируулга солиход л жинхэнэ backend руу шилжинэ.

**Юу үүсдэг вэ.** Хавсралт-2-оос гаргасан 47 ажлын төрлөөс нэг бүтэн блокийг
үүсгэнэ: 17 давхар, 144 айл, **3,290 WorkItem**. Ажлын төрөл бүр өөрт тохирох
түвшинд суудаг — дээвэр блокт нэг, угсралт давхар бүрт, паркет айл бүрт.
Явц нь барилгын давалгааг дуурайна: угсралт 94%, өрлөг 92%, цонх 79%,
дотор засал 6%, шал/хаалга 0%.

Жижиг mock дээр бүх UI сайхан харагддаг. v1-ийг унагасан асуудлууд — хуудаслалт
таслах, N+1 дуудлага, client тал дээрх нэгтгэл — яг энэ хэмжээнд илэрдэг тул
mock нь санаатайгаар жинхэнэ шиг ажиллана: шүүлтүүр, `meta.total`, `pageSize`
дээд хязгаар, сервер талын нэгтгэл бүгд хэрэгжсэн.

```bash
# 47 ажлын төрлийг Excel-ээс дахин гаргах (түвшин LEVELS хүснэгтэд)
python3 scripts/extract-work-types.py "Хавсралт-2.xlsx"

# mock-ийн зан төлөвийг шалгах (46 тест)
npx tsc -p tsconfig.verify-mock.json && node .verify-mock/scripts/verify-mock.js
```

### v2 дэлгэцүүд

| Зам | Юу хийдэг |
|---|---|
| `/blocks/blk-a-01` | Блокийн явц — давхар/ажлын бүлэг/гүйцэтгэгчээр нэгтгэж, дэлгэрэнгүйг хуудаслана |
| `/blocks/new` | Загвараас шинэ блок хувилах — 3 талбар бөглөхөд мянга мянган ажлын нэгж үүснэ |

Явцын үе шатыг өөрчлөх бол `lib/mock/store.ts`-ийн `PROGRESS_FRONT` — жижиг
утга барилга дөнгөж эхэлсэн, том утга дуусах шатандаа.

> The proxy keeps the (HTTP) backend server-side, so deploying this app over
> HTTPS works without mixed-content issues.
