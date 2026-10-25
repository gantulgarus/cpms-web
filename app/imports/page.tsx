"use client";

/**
 * Төсөв оруулах дэлгэц.
 *
 * ХОЁР АЛХАМ. Файл сонгоход ЮУ Ч БИЧИГДЭХГҮЙ — эхлээд тайлан гарна.
 * «Оруулах» дарсны дараа л орно. Энэ нь чимэг биш: импорт нь блокийн бүх
 * мөрийг сольж, гүйцэтгэлийг устгадаг. Буцаах товч байхгүй.
 *
 * ТӨРЛИЙГ АСУУХГҮЙ. Захиалагчийн нэг файлд «Ажлын хөлсний төсөв» ба
 * «Материалын төсөв» хоёулаа байдаг. Хуудасны нэр эргэлзээгүй учраас
 * сервер өөрөө таньж, байгаа бүхнийг нь урьдчилан харуулна.
 *
 * АЛДААТАЙ МӨРИЙГ НУУХГҮЙ. Хамгийн аюултай нь «импорт амжилттай» гэж
 * харуулаад 109 мөр ороогүй байх. Тайлан мөр бүрийг шалтгаантай нь
 * жагсаана — тэр жагсаалтыг инженерт шууд дамжуулж болно.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  FileUp,
  Info,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { blocks as blocksApi, budgetImports } from "@/lib/api/endpoints";
import type {
  BudgetImport,
  BudgetImportType,
  ImportMode,
  ImportReport,
  ImportStatRow,
  ImportWarning,
} from "@/lib/api/types";
import { useMe } from "@/lib/api/use-me";
import { useProject } from "@/lib/api/use-project";
import { formatDate, formatMoney } from "@/lib/domain";
import { cn } from "@/lib/utils";

interface Pending {
  id: string;
  reports: ImportReport[];
  /** Хэрэглэгч оруулахаар СОНГОСОН төсвүүд. */
  chosen: BudgetImportType[];
  applied: boolean;
}

export default function ImportsPage() {
  const { me } = useMe();
  const { project } = useProject();
  const qc = useQueryClient();

  const [blockId, setBlockId] = useState<string>("");
  const [prune, setPrune] = useState(false);
  /*
   * ГОРИМ — ажлын төсвийн хамгийн чухал сонголт.
   *
   * Анхдагч нь `update`: төсөв нэг удаа эцэслэгддэггүй тул засвар
   * оруулах нь ердийн тохиолдол. Шинээр эхэлж байгаа блокт хоёр
   * горим ижил үр дүн өгнө (устгах гүйцэтгэл байхгүй), тиймээс
   * аюулгүй талыг нь анхдагч болгов.
   */
  const [mode, setMode] = useState<ImportMode>("update");
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /*
   * `["blocks", projectId]` түлхүүрийг ТАВАН дэлгэц хуваалцдаг бөгөөд
   * бүгд ДУГТУЙГ (`{ data, meta }`) хадгалдаг. Энд `.then(r => r.data)`
   * хийвэл нэг түлхүүр дор хоёр өөр хэлбэр хадгалагдана: хэрэглэгч
   * эхлээд /blocks руу ороод дараа нь энд ирэхэд кэшнээс дугтуй ирж
   * `.map is not a function` гэж унана. Хуудсыг дахин ачаалахад кэш
   * цэвэрлэгдэж байгаа тул алдаа «санамсаргүй» мэт харагддаг.
   *
   * Нэг түлхүүр — нэг хэлбэр.
   */
  const blockList = useQuery({
    queryKey: ["blocks", project?.id],
    queryFn: () => blocksApi.listForProject(project!.id),
    enabled: Boolean(project),
  });

  const blockOptions = blockList.data?.data ?? [];

  // `Select.Value` нь УТГЫГ харуулдаг — UUID → нэр хүснэгт заавал.
  const blockLabels = Object.fromEntries(
    blockOptions.map((b) => [b.id, b.name]),
  );

  const history = useQuery({
    queryKey: ["imports", blockId],
    queryFn: () => budgetImports.list(blockId).then((r) => r.data),
    enabled: Boolean(blockId),
  });

  /*
   * Загвар нь БЛОКООС үүснэ — давхрын баганын толгойг тухайн блокийн
   * байршлын нэрээр бичиж өгнө. Тиймээс урьдчилан бэлдсэн тогтмол
   * файл биш, сервер бодит цагт үүсгэнэ.
   */
  const template = useMutation({
    mutationFn: () =>
      budgetImports.template(blockId, blockLabels[blockId] ?? "blok"),
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => budgetImports.upload(blockId, file),
    onSuccess: (res) => {
      setPending({
        id: res.data.id,
        reports: res.reports,
        chosen: res.reports.map((r) => r.type),
        applied: false,
      });
      qc.invalidateQueries({ queryKey: ["imports", blockId] });

      const rejected = res.reports.reduce((n, r) => n + r.summary.rejected, 0);

      if (rejected > 0) {
        toast.warning(`${rejected} мөр импортлогдохгүй — тайланг уншина уу.`);
      } else if (res.reports.length > 1) {
        toast.success(
          `${res.reports.length} төсөв уншигдлаа — юу ч бичигдээгүй.`,
        );
      } else {
        toast.success("Файл уншигдлаа — юу ч бичигдээгүй.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      budgetImports.apply(pending!.id, pending!.chosen, prune, mode),
    onSuccess: (res) => {
      setPending({
        id: res.data.id,
        reports: res.reports,
        chosen: res.reports.map((r) => r.type),
        applied: true,
      });
      qc.invalidateQueries();
      toast.success("Төсөв системд орлоо.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Хүлээгдэж буй импортыг ДАХИН нээнэ.
   *
   * Сервер файлаа хадгалсан хэвээр тул тайланг дахин задалж гаргана —
   * хэрэглэгч файлаа дахин сонгох шаардлагагүй.
   */
  const openMutation = useMutation({
    mutationFn: (id: string) => budgetImports.get(id),
    onSuccess: (res) => {
      setPending({
        id: res.data.id,
        reports: res.reports,
        chosen: res.reports.map((r) => r.type),
        applied: res.data.status === "applied",
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discardMutation = useMutation({
    mutationFn: () => budgetImports.discard(pending!.id),
    onSuccess: () => {
      setPending(null);
      qc.invalidateQueries({ queryKey: ["imports", blockId] });
      toast.success("Цуцлагдлаа.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (me && !me.canManageReferenceData) {
    return (
      <EmptyState
        title="Эрх хүрэхгүй"
        description="Төсөв оруулах эрх зөвхөн ерөнхий инженер, захирал, админд байна."
      />
    );
  }

  function pick(file: File | undefined) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Зөвхөн .xlsx файл. Excel дээр «Save As → .xlsx» хийнэ үү.");
      return;
    }

    setPending(null);
    uploadMutation.mutate(file);
  }

  function toggle(type: BudgetImportType, on: boolean) {
    setPending((p) =>
      p
        ? {
            ...p,
            chosen: on
              ? [...p.chosen, type]
              : p.chosen.filter((t) => t !== type),
          }
        : p,
    );
  }

  const shown = pending?.applied
    ? (pending?.reports ?? [])
    : (pending?.reports.filter((r) => pending.chosen.includes(r.type)) ?? []);

  const plannedTotal = shown.reduce((n, r) => n + r.summary.planned, 0);
  const hasQuantities = shown.some((r) => r.type === "quantities");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Төсөв оруулах"
        description="Excel-ээс ажлын тоо хэмжээ, материалын төсвийг блокт буулгана."
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-xs min-w-56 flex-1 space-y-1.5">
              <label className="text-muted-foreground text-xs">Блок</label>
              <Select
                value={blockId}
                items={blockLabels}
                onValueChange={(v) => {
                  setBlockId(v ?? "");
                  setPending(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Блок сонгоно уу" />
                </SelectTrigger>
                <SelectContent>
                  {blockOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/*
             * ЗАГВАР ТАТАХ нь блок сонгосны ДАРАА л утгатай: файлын
             * давхрын баганууд тухайн блокийн байршлын нэрээр үүсдэг.
             * Тогтмол загвар тараавал 12 давхрын блокт 16 давхрын
             * багана ирж, зөрүү нь алдаа болон хувирна.
             */}
            <Button
              variant="ghost"
              disabled={!blockId || template.isPending}
              onClick={() => template.mutate()}
              title={blockId ? undefined : "Эхлээд блокоо сонгоно уу"}
            >
              <Download className="size-4" />
              {template.isPending ? "Бэлдэж байна…" : "Жишээ файл татах"}
            </Button>
          </div>

          {/* Файл сонгох талбар. Блок сонгоогүй бол идэвхгүй — аль блокт
              орохыг мэдэхгүйгээр файл уншуулах нь утгагүй. */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (blockId) pick(e.dataTransfer.files[0]);
            }}
            className={cn(
              "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              dragging && "border-primary bg-primary/5",
              !blockId && "opacity-50",
            )}
          >
            <FileUp className="text-muted-foreground mx-auto mb-2 size-7" />
            <p className="text-sm">
              {blockId
                ? ".xlsx файлаа энд чирэх, эсвэл"
                : "Эхлээд блокоо сонгоно уу"}
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              className="mt-2"
              disabled={!blockId || uploadMutation.isPending}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-4" />
              {uploadMutation.isPending ? "Уншиж байна…" : "Файл сонгох"}
            </Button>
            <p className="text-muted-foreground mt-3 text-xs">
              «Ажлын хөлсний төсөв» ба «Материалын төсөв» хуудсыг өөрөө таньна —
              нэг файлд хоёулаа байж болно. Сонгоход юу ч бичигдэхгүй.
            </p>
          </div>
        </CardContent>
      </Card>

      {pending && (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-sm">
                {pending.reports.map((r) => r.typeLabel).join(" + ")} ·{" "}
                {pending.reports[0]?.blockName}
              </CardTitle>
              {pending.applied ? (
                <ToneBadge tone="green">Орсон</ToneBadge>
              ) : (
                <ToneBadge tone="amber">
                  Батлагдаагүй — юу ч бичигдээгүй
                </ToneBadge>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Файлд хоёр төсөв байвал нэгийг нь хасах боломжтой:
                  материалын хэсэг эвдэрсэн байхад ажлын төсвийг
                  хүлээлгэх шаардлагагүй. */}
              {!pending.applied && pending.reports.length > 1 && (
                <div className="flex flex-wrap gap-4 text-sm">
                  {pending.reports.map((r) => (
                    <label key={r.type} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={pending.chosen.includes(r.type)}
                        onChange={(e) => toggle(r.type, e.target.checked)}
                      />
                      {r.typeLabel}
                      <span className="text-muted-foreground tabular-nums">
                        ({r.summary.planned.toLocaleString("mn-MN")}{" "}
                        {r.type === "quantities" ? "ажил" : "материал"})
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/*
                ГОРИМ СОНГОХ — зөвхөн ажлын төсөвт.

                Материалын төсөвт гүйцэтгэл гэж байхгүй тул устгах
                зүйл ч алга: тэр нь үргэлж бүхэлдээ солигдоно.
              */}
              {!pending.applied && hasQuantities && (
                <div className="space-y-2 border-t pt-4">
                  {(
                    [
                      [
                        "update",
                        "Шинэчлэх",
                        "Тоо хэмжээ, үнэ, инженер солигдоно. Явц, шалгалт, зураг ҮЛДЭНЭ.",
                      ],
                      [
                        "replace",
                        "Шинээр оруулах",
                        "Блокийн ажлыг бүхэлд нь солино. Бүх гүйцэтгэл УСТАНА.",
                      ],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer gap-2.5 rounded-md border p-2.5 text-sm",
                        mode === value &&
                          value === "replace" &&
                          "border-red-500/50 bg-red-500/5",
                        mode === value &&
                          value === "update" &&
                          "border-primary/50 bg-primary/5",
                      )}
                    >
                      <input
                        type="radio"
                        className="mt-1"
                        checked={mode === value}
                        onChange={() => setMode(value)}
                      />
                      <span>
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-foreground block text-xs">
                          {hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {!pending.applied && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  {/* Үйлдлийн нэр нь системийн бусад газартай ИЖИЛ байх
                      ёстой: тохиролцоо, сунгалт бүгд «Батлах». Өөр үг
                      хэрэглэвэл хэрэглэгч «батлах товч хаана байна» гэж
                      хайна — яг тэр болсон. */}
                  <Button
                    onClick={() => applyMutation.mutate()}
                    disabled={plannedTotal === 0 || applyMutation.isPending}
                  >
                    <Check className="size-4" />
                    {applyMutation.isPending ? "Бичиж байна…" : "Батлах"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => discardMutation.mutate()}
                    disabled={discardMutation.isPending}
                  >
                    <X className="size-4" /> Цуцлах
                  </Button>

                  {/* `prune` нь зөвхөн ШИНЭЭР ОРУУЛАХ горимд утгатай:
                      шинэчлэх үед гүйцэтгэлтэй ажил устах эрсдэлтэй
                      тул сервер үүнийг үл тоомсорлодог. */}
                  {hasQuantities && mode === "replace" && (
                    <label className="text-muted-foreground ml-2 flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={prune}
                        onChange={(e) => setPrune(e.target.checked)}
                      />
                      Төсөвт таараагүй ажлыг устгах
                    </label>
                  )}
                </div>
              )}

              {/* Товч идэвхгүй бол ЯАГААД гэдгийг хэлнэ. Саарал товч
                  дангаараа «эвдэрсэн юм болов уу» гэсэн эргэлзээ төрүүлнэ. */}
              {!pending.applied && plannedTotal === 0 && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Оруулах зүйл алга — файлын бүх мөр татгалзсан байна. Доорх
                  шалтгааны жагсаалтыг уншаад Excel дээр засаад дахин оруулна
                  уу.
                </p>
              )}

              {pending.reports.length > 1 && !pending.applied && (
                <p className="text-muted-foreground text-xs">
                  Ажлын төсөв эхэлж орно — материал нь ажлын төрөлд холбогддог.
                  Хоёулаа нэг гүйлгээнд бичигдэнэ: нэг нь унавал аль нь ч
                  орохгүй.
                </p>
              )}
            </CardContent>
          </Card>

          {shown.map((report) => (
            <Part
              key={report.type}
              report={report}
              solo={pending.reports.length === 1}
              mode={mode}
            />
          ))}
        </>
      )}

      {blockId && (
        <History
          rows={history.data ?? []}
          isLoading={history.isLoading}
          error={history.error as Error | null}
          onRetry={() => history.refetch()}
          onOpen={(id) => openMutation.mutate(id)}
          opening={openMutation.isPending}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Нэг төсвийн тайлан. */
function Part({
  report,
  solo,
  mode,
}: {
  report: ImportReport;
  solo: boolean;
  mode: ImportMode;
}) {
  const s = report.summary;

  /*
   * Импортын төрлөөс хамаарч ҮҮСЭХ зүйл өөр: ажлын төсвөөс АЖИЛ,
   * материалын төсвөөс МАТЕРИАЛ. «Мөр» гэж нэрлэвэл файлын мөртэй
   * андуурагдана — 64 мөрөөс 1,991 ажил үүсдэг.
   */
  const isWork = report.type === "quantities";
  const unit = isWork ? "ажил" : "материал";
  const created = isWork ? "Үүсэх ажил" : "Орох материал";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {solo
              ? report.typeLabel
              : `${report.typeLabel} · «${report.sheet}» хуудас`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {/*
              «МӨР» нь ЗӨВХӨН файлын мөрийг хэлнэ. Үүсэх зүйлийг түүний
              нэрээр нь нэрлэнэ: ажлын төсвөөс АЖИЛ, материалын төсвөөс
              МАТЕРИАЛ. Хоёуланг «мөр» гэвэл хэрэглэгч Excel дээрх 64
              мөр ба үүсэх 1,991 ажил хоёрыг ялгахаа болино.
            */}
            <Stat label="Файлын мөр" value={s.sourceRows} />
            <Stat label={created} value={s.planned} tone="green" />
            <Stat
              label="Татгалзсан мөр"
              value={s.rejected}
              tone={s.rejected > 0 ? "red" : undefined}
            />
            <Stat label="Алгассан дэд дүн" value={s.skipped} />
            <Stat label={`Блокт байсан ${unit}`} value={s.existing} />
          </div>

          {report.result && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
              {report.result.materialsCreated != null && (
                <Stat
                  label="Шинэ материал"
                  value={report.result.materialsCreated}
                />
              )}
              {report.result.quantities != null && (
                <Stat
                  label="Байршлын задаргаа"
                  value={report.result.quantities}
                />
              )}
              <Stat label={`Нийт ${unit}`} value={report.result.items} />
              {report.result.pruned != null && report.result.pruned > 0 && (
                <Stat
                  label="Устсан ажил"
                  value={report.result.pruned}
                  tone="red"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {report.warnings.map((w, i) => (
        <WarningCard key={i} warning={w} mode={mode} />
      ))}

      {/* Тоо хэмжээ нь ШИНЭЧЛЭГДЭЭГҮЙ ажлууд — хүн гараар шийднэ. */}
      {(report.result?.conflicts?.length ?? 0) > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-sm">
              {report.result!.conflicts!.length} ажлын тоо хэмжээ
              шинэчлэгдсэнгүй
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-xs">
              Төсвийн шинэ тоо нь аль хэдийн мэдээлсэн хэмжээнээс бага байна.
              Бичвэл гүйцэтгэл 100%-иас давж, цаашид мэдээлэх ч боломжгүй болно
              — тиймээс хуучин тоо үлдлээ.
            </p>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ажил</TableHead>
                  <TableHead>Байршил</TableHead>
                  <TableHead className="text-right">Мэдээлсэн</TableHead>
                  <TableHead className="text-right">Төсвийн шинэ тоо</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.result!.conflicts!.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.location ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.reportedQty} {c.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.newPlannedQty} {c.unit}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {report.sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="text-sm">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {section.rows.map((row) => (
                <StatRow key={row.label} row={row} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {report.errors.length > 0 && <Errors report={report} />}
    </div>
  );
}

function Errors({ report }: { report: ImportReport }) {
  const [all, setAll] = useState(false);
  const shown = all ? report.errors : report.errors.slice(0, 25);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-red-600 dark:text-red-400">
          {report.errors.length} мөр импортлогдохгүй · {report.typeLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Шалтгаанаар нэгтгэсэн дүн нь жагсаалтаас ӨМНӨ: «109 мөр
            эвдэрсэн нүдтэй» гэдэг нэг асуудал, нэг шийдэл. */}
        <div className="flex flex-wrap gap-2">
          {report.errorsByReason.map((g) => (
            <span
              key={g.reason}
              className="bg-muted rounded-md px-2 py-1 text-xs"
            >
              <span className="font-medium tabular-nums">{g.count}</span> ×{" "}
              {g.reason}
            </span>
          ))}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Мөр</TableHead>
              <TableHead className="w-24">Код</TableHead>
              <TableHead>Нэр</TableHead>
              <TableHead>Шалтгаан</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((e, i) => (
              <TableRow key={`${e.row}-${i}`}>
                <TableCell className="tabular-nums">{e.row}</TableCell>
                <TableCell className="tabular-nums">{e.code || "—"}</TableCell>
                <TableCell>{e.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {e.reason}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {report.errors.length > shown.length && (
          <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
            Бүгдийг харах ({report.errors.length})
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function WarningCard({
  warning,
  mode,
}: {
  warning: ImportWarning;
  mode: ImportMode;
}) {
  /*
   * «ГҮЙЦЭТГЭЛ УСТАНА» нь ЗӨВХӨН шинээр оруулах горимд үнэн.
   *
   * Шинэчлэх горимд түүнийг улаанаар үлдээвэл хэрэглэгч аюулгүй
   * сонголт хийчихээд айсаар байх бөгөөд эцэст нь анхааруулгыг
   * бүхэлд нь үл тоомсорлож сурна.
   */
  const defused = mode === "update" && warning.level === "danger";

  if (defused) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex gap-3 pt-6 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium line-through">{warning.title}</p>
            <p>
              Шинэчлэх горимд гүйцэтгэл устахгүй — явц, шалгалт, зураг бүгд
              үлдэнэ.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const Icon = warning.level === "info" ? Info : AlertTriangle;

  return (
    <Card
      className={cn(
        warning.level === "danger" && "border-red-500/50 bg-red-500/5",
        warning.level === "warn" && "border-amber-500/50 bg-amber-500/5",
      )}
    >
      <CardContent className="flex gap-3 pt-6">
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            warning.level === "danger" && "text-red-600 dark:text-red-400",
            warning.level === "warn" && "text-amber-600 dark:text-amber-400",
            warning.level === "info" && "text-muted-foreground",
          )}
        />
        <div className="space-y-1 text-sm">
          <p className="font-medium">{warning.title}</p>
          <ul className="text-muted-foreground space-y-0.5">
            {warning.items.map((item, i) => (
              <li key={i}>· {item}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function StatRow({ row }: { row: ImportStatRow }) {
  const value =
    row.value === null
      ? "—"
      : row.format === "money"
        ? formatMoney(row.value)
        : row.format === "percent"
          ? `${row.value > 0 ? "+" : ""}${row.value}%`
          : row.value.toLocaleString("mn-MN");

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">{row.label}</span>
        {row.tone ? (
          <ToneBadge tone={row.tone}>{value}</ToneBadge>
        ) : (
          <span className="tabular-nums">{value}</span>
        )}
      </div>
      {row.note && (
        <p className="text-muted-foreground mt-0.5 text-xs">{row.note}</p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "red";
}) {
  return (
    <div>
      <div
        className={cn(
          "text-xl font-medium tabular-nums",
          tone === "green" && "text-green-600 dark:text-green-400",
          tone === "red" && "text-red-600 dark:text-red-400",
        )}
      >
        {value.toLocaleString("mn-MN")}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

/**
 * Импортын түүх.
 *
 * ХҮЛЭЭГДЭЖ БУЙ МӨРИЙГ ҮРГЭЛЖЛҮҮЛЖ БОЛНО. Урьд нь тайлан зөвхөн
 * байршуулсан яг тэр мөчид харагддаг байв — хуудсыг орхивол файл
 * «хүлээгдэж буй» хэвээр гацаж, батлах арга байхгүй болдог байсан.
 */
function History({
  rows,
  isLoading,
  error,
  onRetry,
  onOpen,
  opening,
}: {
  rows: BudgetImport[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onOpen: (id: string) => void;
  opening: boolean;
}) {
  if (isLoading) return <LoadingRows rows={3} />;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Импортын түүх алга"
        description="Энэ блокт төсөв оруулсан бүртгэл байхгүй байна."
      />
    );
  }

  return (
    <Card className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Файл</TableHead>
            <TableHead>Төсөв</TableHead>
            <TableHead className="text-right">Мөр</TableHead>
            <TableHead>Төлөв</TableHead>
            <TableHead>Хэн</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">
                {r.originalName}
                <div className="text-muted-foreground text-xs">
                  {formatDate(r.createdAt?.slice(0, 10))} ·{" "}
                  {(r.sizeBytes / 1024).toLocaleString("mn-MN", {
                    maximumFractionDigits: 0,
                  })}{" "}
                  КБ
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {r.typeLabel}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.summary?.planned ?? "—"}
                {(r.summary?.rejected ?? 0) > 0 && (
                  <div className="text-xs text-red-600 dark:text-red-400">
                    {r.summary?.rejected} татгалзсан
                  </div>
                )}
              </TableCell>
              <TableCell>
                <ToneBadge
                  tone={
                    r.status === "applied"
                      ? "green"
                      : r.status === "pending"
                        ? "amber"
                        : "gray"
                  }
                >
                  {r.statusLabel}
                </ToneBadge>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {r.appliedBy ?? r.uploadedBy ?? "—"}
                {r.appliedAt && (
                  <div>{formatDate(r.appliedAt.slice(0, 10))}</div>
                )}
              </TableCell>
              <TableCell>
                {r.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpen(r.id)}
                    disabled={opening}
                  >
                    Үргэлжлүүлэх
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
