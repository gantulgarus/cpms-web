"use client";

/**
 * Ажлын нэгжийн дэлгэрэнгүй — гүйцэтгэл бүртгэх ба баталгаажуулах (API v2).
 *
 * Системийн гол гогцоо энд хаагдана: гүйцэтгэгч/инженер тоо хэмжээ мэдээлнэ →
 * хяналтын инженер батална эсвэл буцаана. Урьд нь 484 ажил "батлахыг хүлээж
 * байна" гэж харагддаг ч батлах дэлгэц байхгүй байсан.
 *
 * Аль товч харагдахыг СЕРВЕР шийднэ (`/me` доторх эрхийн тугууд). Дэлгэц
 * үүргийн жагсаалтыг давхардуулж мэдэхгүй.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Pencil,
  RotateCcw,
  CalendarPlus,
  ImageOff,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { FormField } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import {
  ChecklistForm,
  checklistBlocker,
  toChecklistPayload,
  type ChecklistAnswers,
} from "@/components/checklist-form";
import { ExtendDeadlineDialog } from "@/components/extend-deadline-dialog";
import { IssuePanel } from "@/components/issue-panel";
import { PhotoGallery } from "@/components/photo-gallery";
import { downscale, PhotoPicker, type PickedPhoto } from "@/components/photo-picker";
import { PlanQuantityDialog } from "@/components/plan-quantity-dialog";
import { ProgressBar } from "@/components/progress-bar";
import { ErrorState, LoadingRows } from "@/components/states";
import { ReviewStateBadge, ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { checklists, photoUrl, plan, workItems } from "@/lib/api/v2/endpoints";
import type {
  Inspection,
  InspectionStage,
  PhotoType,
  ProgressEntry,
  WorkItem,
} from "@/lib/api/v2/types";
import { useMe } from "@/lib/api/v2/use-me";
import { formatDate, formatDateTime } from "@/lib/domain";
import { cn } from "@/lib/utils";

export default function WorkItemDetailPage() {
  const { workItemId } = useParams<{ workItemId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { me } = useMe();
  const [editingQty, setEditingQty] = useState(false);
  const [extending, setExtending] = useState(false);

  const itemQuery = useQuery({
    queryKey: ["v2-work-item", workItemId],
    queryFn: () => workItems.get(workItemId),
  });
  const progressQuery = useQuery({
    queryKey: ["v2-progress", workItemId],
    queryFn: () => workItems.progress(workItemId),
  });
  const inspectionsQuery = useQuery({
    queryKey: ["v2-inspections", workItemId],
    queryFn: () => workItems.inspections(workItemId),
  });

  /** Явц/шалгалт нэмэгдэхэд дүн, жагсаалт, нэгтгэл бүгд хуучирна. */
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["v2-work-item", workItemId] });
    qc.invalidateQueries({ queryKey: ["v2-progress", workItemId] });
    qc.invalidateQueries({ queryKey: ["v2-inspections", workItemId] });
    qc.invalidateQueries({ queryKey: ["v2-summary"] });
    qc.invalidateQueries({ queryKey: ["v2-work-items"] });
    qc.invalidateQueries({ queryKey: ["v2-dashboard"] });
  };

  const item = itemQuery.data;

  const remove = useMutation({
    mutationFn: () => plan.deleteWorkItem(workItemId),
    onSuccess: () => {
      toast.success("Ажил устгагдлаа");
      qc.invalidateQueries({ queryKey: ["v2-summary"] });
      qc.invalidateQueries({ queryKey: ["v2-work-items"] });
      router.push(item ? `/blocks/${item.blockId}` : "/blocks");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (itemQuery.isLoading) return <LoadingRows rows={4} />;
  if (itemQuery.error)
    return (
      <ErrorState
        message={(itemQuery.error as Error).message}
        onRetry={() => itemQuery.refetch()}
      />
    );
  if (!item) return null;

  /** Хянагдаагүй тоо хэмжээ — хянагчийн батлах дээд хязгаар. */
  const pendingQty = Math.max(item.reportedQty - item.acceptedQty, 0);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {item.workType.name}
            <ReviewStateBadge state={item.reviewState} />
            {item.overdueDays > 0 && (
              <ToneBadge tone="red">{item.overdueDays} хоног хоцорсон</ToneBadge>
            )}
          </span>
        }
        crumbs={[
          { label: "Блокууд", href: "/blocks" },
          { label: "Блок", href: `/blocks/${item.blockId}` },
          { label: item.workType.name },
        ]}
        description={item.location.path}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Хугацаа хэтэрсэн бол шалтгааныг нь бүртгүүлж, огноог сунгах
              зам тэр дор нь өгнө — эс бөгөөс хоцролтын тоо хуримтлагдсаар
              байгаад утгагүй болно. */}
          {item.overdueDays > 0 && item.status !== "completed" && me?.canEditPlan && (
            <Card className="border-amber-500/40">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div className="text-sm">
                  <div className="font-medium">Хугацаа {item.overdueDays} хоногоор хэтэрсэн</div>
                  <div className="text-muted-foreground text-xs">
                    Төлөвлөсөн дуусах огноо: {formatDate(item.plannedEndDate)}
                  </div>
                </div>
                <Button variant="outline" onClick={() => setExtending(true)}>
                  <CalendarPlus className="size-4" /> Хугацаа сунгах
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Буцаагдсан ажил дээр «одоо яах вэ» гэдэг нь хамгийн эхний
              асуулт — тиймээс бүх зүйлийн дээр. */}
          {item.reviewState === "returned" && (
            <ReturnedNotice item={item} inspections={inspectionsQuery.data?.data} />
          )}

          <QuantityCard
            item={item}
            canEditPlan={Boolean(me?.canEditPlan)}
            onEditQty={() => setEditingQty(true)}
          />

          {/* Хяналтын инженер батлахаасаа өмнө нотолгоог харах ёстой тул
              зураг нь түүх, баталгаажуулалтын самбарын дээр байрлана. */}
          <PhotoGallery
            workItemId={item.id}
            canUpload={Boolean(me?.canReportProgress)}
            onChange={refreshAll}
          />

          <Timeline progress={progressQuery.data?.data} inspections={inspectionsQuery.data?.data} />
        </div>

        <aside className="space-y-4">
          {me?.canReportProgress && <ReportProgressCard item={item} onDone={refreshAll} />}

          {me?.canInspect && (
            <InspectionCard item={item} pendingQty={pendingQty} onDone={refreshAll} />
          )}

          {/* Саатлын шалтгаан — хэн ч бүртгэж болно. Хязгаарлавал хүмүүс
              огт бүртгэхээ болино, тэгвэл тоо баримт бүрдэхгүй. */}
          <IssuePanel workItemId={item.id} />

          {/* Буруу нэмсэн, хамааралгүй ажлыг устгах. Гүйцэтгэл орсон бол
              товч огт харагдахгүй — түүх алдагдах ёсгүй. */}
          {me?.canEditPlan && item.reportedQty === 0 && (
            <Card>
              <CardContent className="space-y-2 pt-6">
                <p className="text-muted-foreground text-sm">
                  Энэ ажил буруу нэмэгдсэн эсвэл энэ барилгад хамаарахгүй бол устгаж болно.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`«${item.name}» ажлыг устгах уу?`)) remove.mutate();
                  }}
                >
                  <Trash2 className="size-3.5" /> Ажлыг устгах
                </Button>
              </CardContent>
            </Card>
          )}

          {me && !me.canReportProgress && !me.canInspect && (
            <Card>
              <CardContent className="text-muted-foreground pt-6 text-sm">
                Танд энэ ажилд үйлдэл хийх эрх байхгүй — зөвхөн харах боломжтой.
              </CardContent>
            </Card>
          )}
        </aside>
      </div>

      {me?.canEditPlan && (
        <PlanQuantityDialog
          item={item}
          open={editingQty}
          onOpenChange={setEditingQty}
          onDone={refreshAll}
        />
      )}

      {me?.canEditPlan && (
        <ExtendDeadlineDialog
          workItemId={item.id}
          workItemName={item.name}
          currentEndDate={item.plannedEndDate}
          overdueDays={item.overdueDays}
          open={extending}
          onOpenChange={setExtending}
          onDone={refreshAll}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function QuantityCard({
  item,
  canEditPlan,
  onEditQty,
}: {
  item: WorkItem;
  canEditPlan: boolean;
  onEditQty: () => void;
}) {
  const rows = [
    { label: "Төлөвлөсөн", value: item.plannedQty },
    { label: "Мэдээлсэн", value: item.reportedQty, muted: true },
    { label: "Батлагдсан", value: item.acceptedQty, strong: true },
    { label: "Үлдэгдэл", value: item.remainingQty },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Тоо хэмжээ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {rows.map((r) => (
            <div key={r.label}>
              <div
                className={cn("text-xl font-semibold tabular-nums", r.strong && "text-emerald-600")}
              >
                {r.value}{" "}
                <span className="text-muted-foreground text-sm font-normal">{item.unit}</span>
              </div>
              <div className="text-muted-foreground text-sm">{r.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <ProgressBar value={item.percentage} />
          <span className="w-10 text-right text-sm font-medium tabular-nums">
            {item.percentage}%
          </span>
        </div>

        {/* Дахин хийлтийн хэмжээ — тусдаа ажлын мөр үүсгэдэггүй тул зардлыг
            ингэж хэмжинэ. 0 бол огт харуулахгүй: шуугиан болно. */}
        {(item.rejectedTotal ?? 0) > 0 && (
          <p className="text-muted-foreground text-xs">
            Татгалзсаны улмаас{" "}
            <strong className="text-foreground tabular-nums">
              {item.rejectedTotal} {item.unit}
            </strong>{" "}
            дахин хийгдсэн.
          </p>
        )}

        {/* Тоо хэмжээгүй бол гүйцэтгэл ОРУУЛАХ БОЛОМЖГҮЙ — тиймээс зүгээр
            анхааруулаад орхиж болохгүй, засах замыг нь тэр дор нь өгнө. */}
        {item.plannedQty === 0 && (
          <div className="bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 flex flex-wrap items-start gap-2 rounded-lg p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              Энэ ажилд төлөвлөгөөт тоо хэмжээ оруулаагүй байна. Тоо хэмжээгүй бол үлдэгдэл 0 тул{" "}
              <strong>гүйцэтгэл бүртгэх боломжгүй</strong>.
            </span>
            {canEditPlan ? (
              <Button size="sm" variant="outline" onClick={onEditQty}>
                <Pencil className="size-3.5" /> Тоо хэмжээ оруулах
              </Button>
            ) : (
              <span className="w-full">Ерөнхий инженер эсвэл төслийн менежерт хандана уу.</span>
            )}
          </div>
        )}

        <dl className="text-muted-foreground grid grid-cols-2 gap-x-8 gap-y-2 border-t pt-4 text-sm">
          <Detail label="Байршил" value={item.location.path} />
          <Detail label="Ажлын бүлэг" value={item.workType.groupName ?? "—"} />
          <Detail label="Гүйцэтгэгч" value={item.contractor?.name ?? "Хариуцагчгүй"} />
          <Detail
            label="Хугацаа"
            value={`${item.plannedStartDate ?? "—"} — ${item.plannedEndDate ?? "—"}`}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReportProgressCard({ item, onDone }: { item: WorkItem; onDone: () => void }) {
  const [qty, setQty] = useState("");
  const [workers, setWorkers] = useState("");
  const [remarks, setRemarks] = useState("");
  const [photoType, setPhotoType] = useState<PhotoType>("progress");
  const [picked, setPicked] = useState<PickedPhoto[]>([]);
  const [confirmedNoPhoto, setConfirmedNoPhoto] = useState(false);

  // Урьдчилан харах хаягууд нь хөтчийн санах ойд үлддэг — салахдаа чөлөөлнө.
  useEffect(() => () => picked.forEach((p) => URL.revokeObjectURL(p.previewUrl)), [picked]);

  const remaining = Math.max(item.plannedQty - item.reportedQty, 0);

  const reset = () => {
    setQty("");
    setWorkers("");
    setRemarks("");
    picked.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPicked([]);
    setConfirmedNoPhoto(false);
  };

  const submit = useMutation({
    /**
     * Эхлээд гүйцэтгэлийн мөрийг үүсгэж, ДАРАА нь зургийг түүнд холбоно.
     *
     * Дараалал нь чухал: холбох `progressEntryId` нь мөр үүссэний дараа л
     * бий болно. Урьд нь зураг тусад нь орж, аль мэдээллийнх болох нь
     * мэдэгдэхгүй байсан асуудал яг эндээс үүсдэг байв.
     *
     * Зураг илгээхэд алдвал ГҮЙЦЭТГЭЛ НЬ ҮҮССЭН хэвээр — тоо хэмжээ нь
     * гол бөгөөд түүнийг зургийн улмаас алдах нь буруу. Хэдэн зураг
     * амжилтгүй болсныг хэлж, галерейгаас дахин нэмэх боломжтой.
     */
    mutationFn: async () => {
      const entry = await workItems.addProgress(item.id, {
        completedQty: Number(qty),
        workersCount: workers ? Number(workers) : undefined,
        remarks: remarks.trim() || undefined,
      });

      let failed = 0;
      for (const p of picked) {
        try {
          await workItems.addPhoto(item.id, await downscale(p.file), photoType, entry.id);
        } catch {
          failed++;
        }
      }

      return { count: picked.length - failed, failed };
    },
    onSuccess: ({ count, failed }) => {
      toast.success("Гүйцэтгэл бүртгэгдлээ" + (count > 0 ? ` · ${count} зураг хавсаргав` : ""));
      if (failed > 0) toast.error(`${failed} зураг илгээгдсэнгүй. Галерейгаас дахин нэмнэ үү.`);
      reset();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const value = Number(qty);
  const invalid =
    qty !== "" && (!Number.isFinite(value) || value <= 0 || value > remaining + 0.001);
  // Тоо хэмжээ бичсэн атлаа зураг сонгоогүй үед л анхааруулна — хоосон
  // маягт дээр анхааруулга гаргах нь зүгээр л шуугиан.
  const needsPhotoWarning = Boolean(qty) && !invalid && picked.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ClipboardCheck className="size-4" /> Гүйцэтгэл бүртгэх
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <FormField
          label={`Хийсэн тоо хэмжээ (${item.unit})`}
          required
          hint={
            item.reviewState === "returned"
              ? `Татгалзсан хэмжээ буцаж нэмэгдсэн — оруулах боломжтой ${remaining} ${item.unit}`
              : `Үлдэгдэл ${remaining} ${item.unit}`
          }
        >
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={remaining}
            step="0.001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            aria-invalid={invalid || undefined}
          />
        </FormField>

        {invalid && (
          <p className="text-destructive text-xs" role="alert">
            0-ээс их, үлдэгдлээс бага байх ёстой.
          </p>
        )}

        <FormField label="Ажилчдын тоо">
          <Input
            type="number"
            min={0}
            value={workers}
            onChange={(e) => setWorkers(e.target.value)}
          />
        </FormField>

        <FormField label="Тайлбар">
          <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </FormField>

        <PhotoPicker
          picked={picked}
          type={photoType}
          onTypeChange={setPhotoType}
          disabled={submit.isPending}
          onPick={(files) =>
            setPicked((prev) => [
              ...prev,
              ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
            ])
          }
          onRemove={(i) =>
            setPicked((prev) => {
              URL.revokeObjectURL(prev[i].previewUrl);

              return prev.filter((_, k) => k !== i);
            })
          }
        />

        {/* Зураг ЗААВАЛ биш — талбайд сүлжээ муу үед ажил зогсох ёсгүй.
            Гэхдээ юу болохыг нь хэлж, санамсаргүй алдахаас сэргийлнэ. */}
        {needsPhotoWarning && (
          <div className="border-amber-500/40 bg-amber-500/10 space-y-2 rounded-md border p-2.5">
            <p className="flex gap-1.5 text-xs">
              <ImageOff className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              <span>
                Зураггүй гүйцэтгэлийг хяналтын инженер батлахад хүндрэлтэй — нотолгоо байхгүй тул
                талбай дээр очиж шалгах шаардлагатай болно.
              </span>
            </p>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={confirmedNoPhoto}
                onChange={(e) => setConfirmedNoPhoto(e.target.checked)}
              />
              Зураггүй илгээхийг зөвшөөрч байна
            </label>
          </div>
        )}

        <Button
          className="w-full"
          disabled={
            !qty ||
            invalid ||
            remaining <= 0 ||
            submit.isPending ||
            (needsPhotoWarning && !confirmedNoPhoto)
          }
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? "Илгээж байна…" : "Илгээх"}
        </Button>

        {remaining <= 0 && (
          <p className="text-muted-foreground text-xs">
            {item.reviewState === "returned" ? (
              // Буцаагдсан атлаа үлдэгдэл 0 гэдэг нь тооцоо хуучирсны шинж —
              // хэрэглэгчийг «яагаад ч юм болохгүй байна» гэж орхиж болохгүй.
              <>
                Энэ ажил буцаагдсан ч үлдэгдэл 0 харагдаж байна. Тооцоо хуучирсан байж болзошгүй —
                админд хандаж <code>php artisan cpms:recalculate</code> ажиллуулахыг хүсэх, эсвэл
                хуудсыг дахин ачаална уу.
              </>
            ) : (
              <>Энэ ажлын нийт тоо хэмжээ мэдээлэгдсэн байна.</>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * Буцаагдсан ажил дээрх заавар.
 *
 * ГОЛ САНАА: татгалзсан хэмжээ нь мэдээлсэн дүнгээс ХАСАГДДАГ тул ажлын
 * үлдэгдэл эргэж бүтэн болно. Гүйцэтгэгч засвараа ЯГ ЭНЭ МӨРӨН дээр дахин
 * мэдээлнэ — тусдаа «дахин хийх» ажил хайх шаардлагагүй.
 */
function ReturnedNotice({ item, inspections }: { item: WorkItem; inspections?: Inspection[] }) {
  const rejection = (inspections ?? []).find((i) => i.rejectedQty > 0);

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <RotateCcw className="text-destructive size-4" /> Энэ ажил буцаагдсан
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rejection && (
          <p className="tabular-nums">
            <span className="text-muted-foreground">Татгалзсан: </span>
            {rejection.rejectedQty} {item.unit}
            {rejection.inspector ? ` · ${rejection.inspector.name}` : ""}
          </p>
        )}
        {rejection?.reason && (
          <p>
            <span className="text-muted-foreground">Шалтгаан: </span>
            {rejection.reason}
          </p>
        )}

        <p className="text-muted-foreground border-t pt-2">
          Татгалзсан хэмжээ үлдэгдэлд эргэж нэмэгдсэн — одоо энэ ажлын үлдэгдэл{" "}
          <strong className="text-foreground tabular-nums">
            {item.remainingQty} {item.unit}
          </strong>
          . Засвараа хийсний дараа гүйцэтгэлээ <strong>энэ хуудсан дээр дахин</strong> бүртгэнэ үү —
          тэр дор нь хяналтын инженерийн дараалалд орно.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function InspectionCard({
  item,
  pendingQty,
  onDone,
}: {
  item: WorkItem;
  pendingQty: number;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<InspectionStage>("general_contractor");
  const [acceptedQty, setAcceptedQty] = useState("");
  const [reason, setReason] = useState("");
  const [answers, setAnswers] = useState<ChecklistAnswers>({});

  // Энэ ажлын төрөлд чанарын хуудас тохируулсан эсэхийг СЕРВЕР шийднэ —
  // дэлгэц дүрмийг таамаглахгүй.
  const checklistQuery = useQuery({
    queryKey: ["v2-checklist", item.workTypeId],
    queryFn: () => checklists.forWorkItem(item.id),
  });
  const template = checklistQuery.data;
  const blocker = checklistBlocker(template, answers);

  const act = useMutation({
    mutationFn: (result: "accepted" | "rejected" | "partial") =>
      workItems.addInspection(item.id, {
        stage,
        result,
        acceptedQty: result === "rejected" ? 0 : Number(acceptedQty || pendingQty),
        reason: reason.trim() || undefined,
        checklist: template ? toChecklistPayload(answers) : undefined,
      }),
    onSuccess: (_data, result) => {
      toast.success(result === "rejected" ? "Буцаагдлаа — дахин хийх ажил үүслээ" : "Батлагдлаа");
      setAcceptedQty("");
      setReason("");
      setAnswers({});
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (pendingQty <= 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Баталгаажуулалт</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Шалгах шинэ гүйцэтгэл алга.
        </CardContent>
      </Card>
    );
  }

  const accepted = Number(acceptedQty || pendingQty);
  const partial = accepted < pendingQty - 0.001;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Баталгаажуулалт</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Шалгах ажил:{" "}
          <span className="text-foreground font-medium tabular-nums">
            {pendingQty} {item.unit}
          </span>
        </p>

        <FormField label="Шалгалтын шат">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["general_contractor", "Ерөнхий гүйцэтгэгч"],
                ["client", "Захиалагч"],
              ] as [InspectionStage, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStage(value)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  stage === value
                    ? "border-primary bg-accent"
                    : "text-muted-foreground hover:bg-accent/40",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label={`Батлах тоо хэмжээ (${item.unit})`} hint="Хоосон бол бүгдийг батална.">
          <Input
            type="number"
            min={0}
            max={pendingQty}
            step="0.001"
            placeholder={String(pendingQty)}
            value={acceptedQty}
            onChange={(e) => setAcceptedQty(e.target.value)}
          />
        </FormField>

        {/* Чанарын хуудас — зөвхөн зурагт үндэслэн батлахыг хориглоно. */}
        {template && <ChecklistForm template={template} answers={answers} onChange={setAnswers} />}

        <FormField label="Тайлбар" hint="Буцаах эсвэл хэсэгчлэн батлахад заавал.">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>

        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={act.isPending || (partial && !reason.trim()) || Boolean(blocker)}
            onClick={() => act.mutate(partial ? "partial" : "accepted")}
          >
            <Check className="size-4" /> {partial ? "Хэсэгчлэн батлах" : "Батлах"}
          </Button>
          {/* Буцаахад checklist хаалт хамаарахгүй — тэнцээгүй зүйл байгаа
              нь яг буцаах шалтгаан. */}
          <Button
            variant="destructive"
            className="flex-1"
            disabled={act.isPending || !reason.trim()}
            onClick={() => act.mutate("rejected")}
          >
            <Undo2 className="size-4" /> Буцаах
          </Button>
        </div>

        {/* Товч яагаад идэвхгүй байгааг ХЭЛНЭ — эс бөгөөс хэрэглэгч эвдэрсэн
            гэж бодно. */}
        {blocker ? (
          <p className="text-destructive text-xs">{blocker}</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Буцаахад дахин хийх ажил автоматаар үүсэж, зардал нь тусад нь бүртгэгдэнэ.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

type TimelineEvent =
  | { kind: "progress"; at: string; entry: ProgressEntry }
  | { kind: "inspection"; at: string; entry: Inspection };

function Timeline({
  progress,
  inspections,
}: {
  progress?: ProgressEntry[];
  inspections?: Inspection[];
}) {
  const events = useMemo<TimelineEvent[]>(() => {
    const merged: TimelineEvent[] = [
      ...(progress ?? []).map((e) => ({ kind: "progress" as const, at: e.recordedAt, entry: e })),
      ...(inspections ?? []).map((e) => ({
        kind: "inspection" as const,
        at: e.inspectedAt,
        entry: e,
      })),
    ];

    return merged.sort((a, b) => b.at.localeCompare(a.at));
  }, [progress, inspections]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Түүх</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">Бүртгэл алга.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((e) => (
              <li
                key={`${e.kind}-${e.entry.id}`}
                className="flex gap-3 border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="mt-0.5 shrink-0">
                  {e.kind === "progress" ? (
                    <ClipboardCheck className="text-muted-foreground size-4" />
                  ) : e.entry.result === "rejected" ? (
                    <RotateCcw className="text-destructive size-4" />
                  ) : (
                    <Check className="size-4 text-emerald-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {e.kind === "progress" ? (
                    <>
                      <div className="text-sm font-medium tabular-nums">
                        {e.entry.completedQty} мэдээлсэн
                        {e.entry.workersCount ? ` · ${e.entry.workersCount} ажилтан` : ""}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {e.entry.reportedBy?.name ?? "—"} · {formatDateTime(e.at)}
                      </div>
                      {e.entry.remarks && <p className="mt-1 text-sm">{e.entry.remarks}</p>}

                      {/* ЯГ ЭНЭ мэдээллийн нотолгоо. Урьд нь бүх зураг нэг
                          овоо болж, аль нь алиныхыг ялгах арга байгаагүй. */}
                      {e.entry.photos && e.entry.photos.length > 0 ? (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {e.entry.photos.map((photo) => (
                            <li key={photo.id}>
                              <a href={photoUrl(photo)} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={photoUrl(photo)}
                                  alt={photo.type}
                                  loading="lazy"
                                  className="bg-muted size-16 rounded-md object-cover"
                                />
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                          <ImageOff className="size-3" /> Зураггүй
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium tabular-nums">
                        {e.entry.result === "rejected"
                          ? "Буцаагдсан"
                          : `${e.entry.acceptedQty} батлагдсан`}
                        {e.entry.rejectedQty > 0 && e.entry.result !== "rejected"
                          ? ` · ${e.entry.rejectedQty} татгалзсан`
                          : ""}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {e.entry.stage === "client"
                          ? "Захиалагчийн хяналт"
                          : "Ерөнхий гүйцэтгэгчийн хяналт"}
                        {e.entry.inspector ? ` · ${e.entry.inspector.name}` : ""} ·{" "}
                        {formatDateTime(e.at)}
                      </div>
                      {e.entry.reason && (
                        <p className="text-destructive mt-1 text-sm">{e.entry.reason}</p>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
