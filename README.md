# CPMS · Planning (web)

Next.js 16 (App Router) **planning & oversight** console for the Construction
Project Management System. It owns the office-side, structure-heavy workflows —
the mobile app (Expo, separate repo) is for field progress entry & monitoring.

This web app covers:

- **Projects & blocks** — create a project, then blocks from standard designs
  (thousands of work items per block)
- **Progress & inspection** — two-stage review queue, issues, deadline extensions
- **Contractors & agreements** — access codes, assignments, acceptance reports
- **Orders & budgets** — concrete / material orders against block budgets
- **Users & reference data** — roles, work types, checklists

Sign-in is real (Sanctum token); permissions come from the server's `/me`.

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

## Mock горим

API-ийн гэрээ `docs/api-endpoints.md`-д тодорхойлогдсон. Backend-гүйгээр UI-г
**бодит хэмжээний** өгөгдөл дээр хөгжүүлэхэд зориулж proxy дотор mock суулгасан.

```bash
CPMS_MOCK=1 npm run dev
```

Энэ үед `/api/cpms/*` нь backend руу дамжуулахгүй, `lib/mock`-оос хариулна.
Апп-ын код ялгааг мэдэхгүй — тохируулга солиход л жинхэнэ backend руу шилжинэ.

**Юу үүсдэг вэ.** Хавсралт-2-оос гаргасан 47 ажлын төрлөөс нэг бүтэн блокийг
үүсгэнэ: 17 давхар, 144 айл, **3,290 WorkItem**. Ажлын төрөл бүр өөрт тохирох
түвшинд суудаг — дээвэр блокт нэг, угсралт давхар бүрт, паркет айл бүрт.
Явц нь барилгын давалгааг дуурайна: угсралт 94%, өрлөг 92%, цонх 79%,
дотор засал 6%, шал/хаалга 0%.

Жижиг mock дээр бүх UI сайхан харагддаг. Хуучин системийг унагасан асуудлууд — хуудаслалт
таслах, N+1 дуудлага, client тал дээрх нэгтгэл — яг энэ хэмжээнд илэрдэг тул
mock нь санаатайгаар жинхэнэ шиг ажиллана: шүүлтүүр, `meta.total`, `pageSize`
дээд хязгаар, сервер талын нэгтгэл бүгд хэрэгжсэн.

```bash
# 47 ажлын төрлийг Excel-ээс дахин гаргах (түвшин LEVELS хүснэгтэд)
python3 scripts/extract-work-types.py "Хавсралт-2.xlsx"

# mock-ийн зан төлөвийг шалгах (46 тест)
npx tsc -p tsconfig.verify-mock.json && node .verify-mock/scripts/verify-mock.js
```

### Жишээ дэлгэцүүд

| Зам | Юу хийдэг |
|---|---|
| `/blocks/blk-a-01` | Блокийн явц — давхар/ажлын бүлэг/гүйцэтгэгчээр нэгтгэж, дэлгэрэнгүйг хуудаслана |
| `/blocks/new` | Загвараас шинэ блок хувилах — 3 талбар бөглөхөд мянга мянган ажлын нэгж үүснэ |

Явцын үе шатыг өөрчлөх бол `lib/mock/store.ts`-ийн `PROGRESS_FRONT` — жижиг
утга барилга дөнгөж эхэлсэн, том утга дуусах шатандаа.

> The proxy keeps the (HTTP) backend server-side, so deploying this app over
> HTTPS works without mixed-content issues.
