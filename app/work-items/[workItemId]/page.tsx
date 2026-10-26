"use client";

/**
 * Ажлын нэгжийн дэлгэрэнгүй — гүйцэтгэл бүртгэх ба баталгаажуулах.
 *
 * Системийн гол гогцоо энд хаагдана: гүйцэтгэгч/инженер тоо хэмжээ мэдээлнэ →
 * хяналтын инженер батална эсвэл буцаана. Урьд нь 484 ажил "батлахыг хүлээж
 * байна" гэж харагддаг ч батлах дэлгэц байхгүй байсан.
 *
 * Аль товч харагдахыг СЕРВЕР шийднэ (`/me` доторх эрхийн тугууд). Дэлгэц
 * үүргийн жагсаалтыг давхардуулж мэдэхгүй.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Pencil,
  RotateCcw,
  ImageOff,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { WorkQuantitySummary } from "@/components/work-quantity-summary";
import { FormField } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import {
  ChecklistForm,
  checklistBlocker,
  toChecklistPayload,
  type ChecklistAnswers,
} from "@/components/checklist-form";
import { AssignContractorDialog } from "@/components/assign-contractor-dialog";
import { AssignInspectorDialog } from "@/components/assign-inspector-dialog";
import { DeadlineExtensionAction } from "@/components/deadline-extension-action";
import { IssuePanel } from "@/components/issue-panel";
import { PhotoGallery } from "@/components/photo-gallery";
import { downscale, PhotoPicker, type PickedPhoto } from "@/components/photo-picker";
import { PlanQuantityDialog } from "@/components/plan-quantity-dialog";
import { ErrorState, LoadingRows } from "@/components/states";
import { ReviewStateBadge, ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { checklists, photoUrl, plan, queue, schedule, workItems } from "@/lib/api/endpoints";
import type {
  Inspection,
  InspectionStage,
  PhotoType,
  ProgressEntry,
  QueueType,
  WorkItem,
} from "@/lib/api/types";
import { type Me, useMe } from "@/lib/api/use-me";
import { useProject } from "@/lib/api/use-project";
import {
  formatDate,
  formatDateTime,
  formatQty,
  INSPECTION_ACTION,
  INSPECTION_STAGE,
} from "@/lib/domain";

/** Буцаагдсан төлвүүд — backend-ийн `WorkItem::RETURNED_STATES`. */
const RETURNED_STATES: string[] = ["returned_by_site", "returned_by_final"];

export default function WorkItemDetailPage() {
  const { workItemId } = useParams<{ workItemId: string }>();
  const router = useRouter();
  const search = useSearchParams();

  /*
   * ДАРААЛСАН ГОРИМ.
   *
   * Дарааллаас орж ирсэн бол ажлыг шийдсэний дараа дэлгэц ДАРААГИЙНХ
   * руу өөрөө үсэрнэ. Эс бөгөөс 550 мөртэй дараалал дээр мөр бүрийн
   * дараа буцаж, гүйлгэж, дахин хайх болно — тэр нь дарааллыг
   * хэрэглэх боломжгүй болгоно.
   */
  const fromQueue = search.get("from") === "queue";
  const fromMyWork = search.get("from") === "my-work";
  const myWorkBlockId = search.get("blockId");
  const queueType = (search.get("type") ?? "approval") as QueueType;
  const queueBlockId = search.get("blockId") ?? "";
  const { project } = useProject();

  /**
   * Дарааллын ДАРААГИЙН ажил руу шилжинэ.
   *
   * Серверээс шинэчлэгдсэн дарааллыг нэг мөрөөр татна — дөнгөж шийдсэн
   * ажил түүнээс аль хэдийн хасагдсан байна. Хоосон бол дараалал руу
   * буцаж, дууссаныг хэлнэ.
   */
  const goToNext = async () => {
    if (!fromQueue || !project) return;

    const href = `/queue?type=${queueType}`;

    try {
      const next = await queue.list(project.id, queueType, {
        page: 1,
        pageSize: 1,
        ...(queueBlockId ? { blockId: queueBlockId } : {}),
      });

      const first = next.data[0];

      if (!first) {
        toast.success("Дараалал хоосон боллоо.");
        router.push(href);

        return;
      }

      const params = new URLSearchParams({ from: "queue", type: queueType });
      if (queueBlockId) params.set("blockId", queueBlockId);

      router.push(`/work-items/${first.id}?${params.toString()}`);
    } catch {
      // Дараагийнхыг олж чадсангүй — жагсаалт руу буцаах нь гацахаас дээр.
      router.push(href);
    }
  };
  const qc = useQueryClient();
  const { me } = useMe();
  const [editingQty, setEditingQty] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assigningInspector, setAssigningInspector] = useState(false);

  const itemQuery = useQuery({
    queryKey: ["work-item", workItemId],
    queryFn: () => workItems.get(workItemId),
  });
  const extensionQuery = useQuery({
    queryKey: ["extensions", "work-item", workItemId],
    queryFn: () => schedule.extensionsFor(workItemId),
    enabled: Boolean((me?.canReportProgress || me?.canEditPlan) && itemQuery.data && itemQuery.data.overdueDays > 0 && itemQuery.data.status !== "completed"),
    refetchInterval: 60_000,
  });
  const progressQuery = useQuery({
    queryKey: ["progress", workItemId],
    queryFn: () => workItems.progress(workItemId),
  });
  const inspectionsQuery = useQuery({
    queryKey: ["inspections", workItemId],
    queryFn: () => workItems.inspections(workItemId),
  });

  /** Явц/шалгалт нэмэгдэхэд дүн, жагсаалт, нэгтгэл бүгд хуучирна. */
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["work-items", "my-work"] });
    qc.invalidateQueries({ queryKey: ["work-item", workItemId] });
    qc.invalidateQueries({ queryKey: ["progress", workItemId] });
    qc.invalidateQueries({ queryKey: ["inspections", workItemId] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    qc.invalidateQueries({ queryKey: ["work-items"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const item = itemQuery.data;

  const remove = useMutation({
    mutationFn: () => plan.deleteWorkItem(workItemId),
    onSuccess: () => {
      toast.success("Ажил устгагдлаа");
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["work-items"] });
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

  /**
   * Дараагийн шатаар дамжуулж болох хэмжээ — СЕРВЕРЭЭС ирнэ.
   *
   * Дэлгэц энийг ӨӨРӨӨ бодож болохгүй. Хоёр шаттай ажилд батлах сан нь
   * `шалгасан − баталсан` болохоос `мэдээлсэн − баталсан` БИШ. Хуучин
   * томьёогоор бодвол дэлгэц 40 санал болгоод сервер 10-аас илүүг
   * татгалзаж, хэрэглэгч шалтгааныг нь ойлгохгүй.
   */
  const pendingQty = Math.max(item.stagePool ?? 0, 0);

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
        /*
          Дарааллаас орж ирсэн бол ТЭР ЗАМААР буцна. «Блокууд → Блок»
          гэж буцаах нь хэрэглэгчийг огт өөр газар аваачина.
        */
        crumbs={
          fromMyWork ? [
            { label: "Миний ажлууд", href: myWorkBlockId ? `/blocks/${encodeURIComponent(myWorkBlockId)}` : "/my-work" },
            { label: item.workType.name },
          ] : fromQueue
            ? [
                {
                  label: "Ажлын дараалал",
                  href: `/queue?type=${queueType}`,
                },
                { label: item.workType.name },
              ]
            : [
                { label: "Блокууд", href: "/blocks" },
                { label: "Блок", href: `/blocks/${item.blockId}` },
                { label: item.workType.name },
              ]
        }
        description={item.location.path}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Хугацаа хэтэрсэн бол шалтгааныг нь бүртгүүлж, огноог сунгах
              зам тэр дор нь өгнө — эс бөгөөс хоцролтын тоо хуримтлагдсаар
              байгаад утгагүй болно. */}
          {item.overdueDays > 0 && item.status !== "completed" && (me?.canEditPlan || me?.canReportProgress) && (
            <Card className="border-amber-500/40">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div className="text-sm">
                  <div className="font-medium">Хугацаа {item.overdueDays} хоногоор хэтэрсэн</div>
                  <div className="text-muted-foreground text-xs">
                    Төлөвлөсөн дуусах огноо: {formatDate(item.plannedEndDate)}
                  </div>
                </div>
                <DeadlineExtensionAction
                  item={item}
                  canRequest={Boolean(me?.canReportProgress || me?.canEditPlan)}
                  canApprove={Boolean(me?.canApproveExtensions)}
                  pending={extensionQuery.data?.find((request) => request.status === "pending")}
                  loading={extensionQuery.isPending || extensionQuery.isFetching}
                  error={extensionQuery.isError}
                  onRetry={() => { void extensionQuery.refetch(); }}
                  onDone={refreshAll}
                />
              </CardContent>
            </Card>
          )}

          {/* Буцаагдсан ажил дээр «одоо яах вэ» гэдэг нь хамгийн эхний
              асуулт — тиймээс бүх зүйлийн дээр. */}
          {RETURNED_STATES.includes(item.reviewState) && (
            <ReturnedNotice item={item} inspections={inspectionsQuery.data?.data} />
          )}

          <QuantityCard
            item={item}
            canEditPlan={Boolean(me?.canEditPlan)}
            onEditQty={() => setEditingQty(true)}
            canAssign={Boolean(me?.canManageContractors)}
            onAssign={() => setAssigning(true)}
            canAssignInspector={Boolean(me?.canAssignInspectors)}
            onAssignInspector={() => setAssigningInspector(true)}
          />

        </div>

        <aside className="min-w-0 space-y-4 lg:col-start-3 lg:row-start-1" aria-label="Ажилд хийх үйлдэл">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{me?.canReportProgress || canActOnStage(me, item.nextStage) ? "Ажилд хийх үйлдэл" : "Ажлын нотолгоо"}</h2>
            <a href="#work-evidence" className="text-primary text-xs underline underline-offset-4">Зураг, түүх харах ↓</a>
          </div>

          {me?.canReportProgress && <div id="report-progress" className="scroll-mt-20"><ReportProgressCard item={item} onDone={refreshAll} /></div>}

          {/*
            Шалгах форм харуулах эсэхийг АЖЛЫН ДАРААГИЙН ШАТ шийднэ.

            `canInspect` дангаараа буруу: тэр нь ЭЦСИЙН батлах эрх бөгөөд
            талбайн инженер түүнд ордоггүй. Тиймээс 1-р шатанд хүлээж
            байгаа ажил дээр талбайн инженерт форм огт харагдахгүй байв —
            backend зөвшөөрдөг атлаа дэлгэц нуудаг байсан.
          */}
          {canActOnStage(me, item.nextStage) && (
            <InspectionCard
              item={item}
              pendingQty={pendingQty}
              onDone={refreshAll}
              /*
               * 2-р шатыг ӨӨР хүн хийх ёстой. Энэ хэрэглэгч 1-р шатыг
               * хийсэн бол сервер татгалзана — формыг бөглүүлээд дараа
               * нь 403 өгөх нь хэрэглэгчийн цагийг дэмий үрнэ.
               */
              onNext={fromQueue ? goToNext : undefined}
              checkedByMe={(inspectionsQuery.data?.data ?? []).some(
                (i) =>
                  i.stage === "site_check" &&
                  i.acceptedQty > 0 &&
                  String(i.inspector.id) === String(me?.id),
              )}
            />
          )}

        </aside>

        <section id="work-evidence" className="min-w-0 scroll-mt-20 space-y-6 lg:col-span-2 lg:col-start-1 lg:row-start-2" aria-label="Ажлын зураг ба түүх">
          {/* Нотолгоо руу үйлдлийн самбараас шууд шилжинэ. Зураг нь түүхийн өмнө. */}
          <PhotoGallery
            workItemId={item.id}
            canUpload={Boolean(me?.canReportProgress)}
            onChange={refreshAll}
          />

          <Timeline progress={progressQuery.data?.data} inspections={inspectionsQuery.data?.data} />
        </section>

        <aside className="min-w-0 space-y-4 lg:col-start-3 lg:row-start-2" aria-label="Саатал ба бусад үйлдэл">
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

          {me && !me.canReportProgress && !canActOnStage(me, item.nextStage) && (
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

      {me?.canManageContractors && (
        <AssignContractorDialog
          item={item}
          open={assigning}
          onOpenChange={setAssigning}
          onDone={refreshAll}
        />
      )}

      {me?.canAssignInspectors && (
        <AssignInspectorDialog
          item={item}
          open={assigningInspector}
          onOpenChange={setAssigningInspector}
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
  canAssign,
  onAssign,
  canAssignInspector,
  onAssignInspector,
}: {
  item: WorkItem;
  canEditPlan: boolean;
  onEditQty: () => void;
  canAssign: boolean;
  onAssign: () => void;
  canAssignInspector: boolean;
  onAssignInspector: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Гүйцэтгэлийн тойм</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <WorkQuantitySummary item={item} />

        {/* Дахин хийлтийн хэмжээ — тусдаа ажлын мөр үүсгэдэггүй тул зардлыг
            ингэж хэмжинэ. 0 бол огт харуулахгүй: шуугиан болно. */}
        {(item.rejectedTotal ?? 0) > 0 && (
          <p className="text-muted-foreground text-xs">
            Татгалзсаны улмаас{" "}
            <strong className="text-foreground tabular-nums">
              {formatQty(item.rejectedTotal, item.unit)}
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

        <dl className="text-muted-foreground grid grid-cols-1 gap-x-8 gap-y-3 border-t pt-4 text-sm sm:grid-cols-2">
          <Detail label="Байршил" value={item.location.path} />
          <Detail label="Ажлын бүлэг" value={item.workType.groupName ?? "—"} />
          {/* Хариуцагчийг солих зам ЭНД байх ёстой: блокийн бүлгээр оноох нь
              1,889 мөрийг хөдөлгөдөг тул нэг айлын хаалгыг өөр компанид
              өгөхөд тохиромжгүй. */}
          <div>
            <dt className="text-xs">Гүйцэтгэгч</dt>
            <dd className="text-foreground flex items-center gap-2">
              <span className={item.contractor ? undefined : "text-amber-700 dark:text-amber-500"}>
                {item.contractor?.name ?? "Хариуцагчгүй"}
              </span>
              {canAssign && (
                <button
                  type="button"
                  onClick={onAssign}
                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                >
                  солих
                </button>
              )}
            </dd>
          </div>
          {/* Хяналтын инженер — төсвөөс оногддог.

              ЯАГААД ХАРУУЛАХ ЁСТОЙ ВЭ: гүйцэтгэл батлахыг хүлээхэд ХЭН рүү
              явахыг зөвхөн энэ мэдээлэл хэлнэ. Харуулахгүй бол батлах эрхтэй
              дөрвөн хүн бүгд бүх ажлыг хардаг — хэн ч өөрийнх гэж үзэхгүй.

              Төсвийн 64 мөрийн 36-д заагаагүй тул «хариуцагчгүй» нь ердийн
              төлөв: анхааруулга өнгөөр тэмдэглээд, засах замыг нь өгнө. */}
          <div>
            <dt className="text-xs">Хяналтын инженер</dt>
            <dd className="text-foreground flex items-center gap-2">
              <span className={item.inspector ? undefined : "text-amber-700 dark:text-amber-500"}>
                {item.inspector?.name ?? "Хариуцагчгүй"}
              </span>
              {item.inspector?.position && (
                <span className="text-muted-foreground text-xs">{item.inspector.position}</span>
              )}
              {canAssignInspector && (
                <button
                  type="button"
                  onClick={onAssignInspector}
                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                >
                  солих
                </button>
              )}
            </dd>
          </div>
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

  const remaining = reportableQty(item);

  /*
   * ШАЛГАЛТЫН ЦЭГ — хоригийг товч дарахаас ӨМНӨ харуулна.
   *
   * Серверийн валидаци нь тоог бичээд «Илгээх» дарсны дараа л ажиллана.
   * Тэр үед гүйцэтгэгч аль хэдийн ажлаа хийчихсэн байдаг — «болохгүй»
   * гэж хэлэх мөч нь оройтсон. Шалтгааныг нь эхнээс нь харуулж, маягтыг
   * бүхэлд нь хаана.
   */
  const held = item.holdPointReason ?? null;

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

  /*
   * Хоригтой бол МАЯГТЫГ ОГТ харуулахгүй.
   *
   * Талбар нь идэвхгүй болоод үлдвэл хэрэглэгч тоогоо бичээд товч нь
   * яагаад ажиллахгүйг хайна. Шалтгаан ба засах зам нь л харагдах ёстой.
   */
  if (held) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardCheck className="size-4" /> Гүйцэтгэл бүртгэх
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 flex items-start gap-2 rounded-lg p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{held}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

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
            RETURNED_STATES.includes(item.reviewState)
              ? `Татгалзсан хэмжээ буцаж нэмэгдсэн — мэдээлэх боломжтой ${formatQty(remaining, item.unit)}`
              : `Мэдээлэх боломжтой ${formatQty(remaining, item.unit)}`
          }
        >
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={remaining}
            step="0.001"
            value={qty}
            /*
             * Хязгаараас давсан утгыг ХҮЛЭЭЖ АВАХГҮЙ.
             *
             * `max` атрибут нь зөвхөн сумтай товч ба маягтын валидацид үйлчилдэг
             * тул гараар бичихэд ямар ч тоо ордог байв: хэрэглэгч 500 бичээд
             * «Илгээх» дараад л сервер 422 буцаадаг.
             *
             * Бутархайд саад болохгүй: тоо нь оронгоор өсдөг тул «459.» → 459,
             * «459.1» → 459.1 гэж үе шаттай шалгагдана. Давсан алхмыг л
             * буцаана — бичсэн зүйлийг ЧИМЭЭГҮЙ ӨӨРЧЛӨХГҮЙ, зүгээр л оруулахгүй.
             */
            onChange={(e) => {
              const raw = e.target.value;
              const next = Number(raw);
              if (raw !== "" && Number.isFinite(next) && next > remaining + 0.001) return;
              setQty(raw);
            }}
            aria-invalid={invalid || undefined}
          />
        </FormField>

        {invalid && (
          <p className="text-destructive text-xs" role="alert">
            0-ээс их, хамгийн ихдээ {formatQty(remaining, item.unit)} байх ёстой.
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
              ...files.map((file) => ({
                file,
                previewUrl: URL.createObjectURL(file),
              })),
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
            {RETURNED_STATES.includes(item.reviewState) ? (
              // Буцаагдсан атлаа үлдэгдэл 0 гэдэг нь тооцоо хуучирсны шинж —
              // хэрэглэгчийг «яагаад ч юм болохгүй байна» гэж орхиж болохгүй.
              <>
                Энэ ажил буцаагдсан ч мэдээлэх зай 0 харагдаж байна. Тооцоо хуучирсан байж болзошгүй
                — админд хандаж <code>php artisan cpms:recalculate</code> ажиллуулахыг хүсэх, эсвэл
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
 * Дахин мэдээлэх боломжит хэмжээ — МЭДЭЭЛСЭНЭЭС хасна, батлагдсанаас БИШ.
 *
 * Энэ нь «Тоо хэмжээ» хэсгийн `item.remainingQty`-гаас ЗОРИУДААР өөр:
 *   remainingQty    = төлөвлөсөн − БАТЛАГДСАН   («хийж дуусгах ажил»)
 *   reportableQty   = төлөвлөсөн − МЭДЭЭЛСЭН    («мэдээлэх зай»)
 *
 * Хоёулаа «үлдэгдэл» гэж нэрлэгдэж болохгүй: мэдээлчихсэн атлаа хараахан
 * батлагдаагүй хэсгийг дахин мэдээлбэл тоо давхардана. Томьёо нь backend-ийн
 * `StoreProgressRequest::after()`-тэй ЯГ ИЖИЛ — өөрчилвөл дэлгэц зөвшөөрсөн
 * утгыг сервер 422-оор татгалзаж, хэрэглэгч гацна.
 *
 * НЭГ ГАЗАР байх учир нь: урьд нь энэ томьёо формд, `remainingQty` нь
 * зааварт тавигдаж, нэг ажил дээр хоёр өөр «үлдэгдэл» харагддаг байв.
 */
function reportableQty(item: WorkItem): number {
  return Math.max(item.plannedQty - item.reportedQty, 0);
}

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
            {formatQty(rejection.rejectedQty, item.unit)}
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
          Татгалзсан хэмжээ буцаж нэмэгдсэн — одоо дахин мэдээлэх боломжтой{" "}
          <strong className="text-foreground tabular-nums">
            {formatQty(reportableQty(item), item.unit)}
          </strong>
          . Засвараа хийсний дараа гүйцэтгэлээ <strong>энэ хуудсан дээр дахин</strong> бүртгэнэ үү —
          тэр дор нь хяналтын инженерийн дараалалд орно.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * Энэ хэрэглэгч тухайн ажлын ДАРААГИЙН шатыг хийж чадах уу.
 *
 * Шат бүр өөрийн үүргийн жагсаалттай (`Inspection::STAGE_ROLES`):
 *   1-р шат — талбайн инженер, хяналтын инженер, дээш
 *   2-р шат — ЗӨВХӨН хяналтын инженер, дээш
 *
 * Дараагийн шат мэдэгдэхгүй (хүлээгдэж буй ажил алга) бол батлах
 * эрхтэй хүнд форм харуулна — тэнд хоосон төлөв нь өөрөө тайлбарладаг.
 */
function canActOnStage(me: Me | null, nextStage?: InspectionStage | null): boolean {
  if (!me) return false;

  if (nextStage === "site_check") return me.canCheck || me.canInspect;

  return me.canInspect;
}

function InspectionCard({
  item,
  pendingQty,
  onDone,
  checkedByMe,
  onNext,
}: {
  item: WorkItem;
  pendingQty: number;
  onDone: () => void;
  checkedByMe: boolean;
  /** Дарааллаас орж ирсэн бол — шийдсэний дараа дараагийнх руу. */
  onNext?: () => void;
}) {
  /*
   * Хяналт НЭГ шаттай.
   *
   * Шатыг ДЭЛГЭЦ сонгохгүй — СЕРВЕР хэлнэ (`item.nextStage`).
   *
   * Урьд нь хэрэглэгч шатаа өөрөө сонгодог байв. Хоёр шат нэг сангаас
   * иддэг байсан тул буруу шат сонгоход ажил мөнхөд гацдаг, шалтгаан нь
   * хаана ч харагддаггүй байв. Одоо шат бүр өөрийн сангаас иддэг бөгөөд
   * дараалал нь хатуу: шалгаагүй ажлыг батлах боломжгүй.
   */
  const stage: InspectionStage = item.nextStage ?? "final_approval";
  // Шатаас хамаарсан үйлдлийн үгс — «шалгах» ба «батлах» хоёр ӨӨР үйлдэл.
  const words = INSPECTION_ACTION[stage] ?? INSPECTION_ACTION.final_approval;
  const [acceptedQty, setAcceptedQty] = useState("");
  const [reason, setReason] = useState("");
  const [answers, setAnswers] = useState<ChecklistAnswers>({});

  // Энэ ажлын төрөлд чанарын хуудас тохируулсан эсэхийг СЕРВЕР шийднэ —
  // дэлгэц дүрмийг таамаглахгүй.
  const checklistQuery = useQuery({
    queryKey: ["checklist", item.workTypeId],
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
      toast.success(result === "rejected" ? "Буцаагдлаа — дахин хийх ажил үүслээ" : words.done);
      setAcceptedQty("");
      setReason("");
      setAnswers({});
      onDone();

      /*
       * ДАРААГИЙНХ РУУ. Хэрэглэгч буцаж, гүйлгэж, дахин хайх ёсгүй —
       * 550 мөртэй дараалал дээр тэр нь ажлыг боломжгүй болгоно.
       */
      onNext?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /*
   * НЭГ хүн ХОЁР шатыг ч хийж болохгүй.
   *
   * Сервер үүнийг татгалздаг (`StoreInspectionRequest`). Дэлгэц дээр
   * урьдчилж хэлэхгүй бол хэрэглэгч чанарын хуудсыг бүтнээр бөглөөд
   * сүүлд нь л татгалзал харна.
   */
  if (stage === "final_approval" && checkedByMe) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">2-р шат · Батлах</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>Та энэ ажлыг 1-р шатад шалгасан тул 2-р шатад батлах боломжгүй.</p>
          <p className="text-xs">
            Шалгасан ба баталсан хүн нэг байвал баталгаажуулалт утга учраа алдана. Өөр хяналтын
            инженер батлах шаардлагатай.
          </p>
        </CardContent>
      </Card>
    );
  }

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
        <CardTitle className="text-sm">{words.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Хоёр шаттай ажилд ХЭН ямар шатыг хийж байгааг хэлнэ — эс бөгөөс
            талбайн инженер «би батлав» гэж ойлгоно. */}
        {stage === "site_check" ? (
          <p className="text-muted-foreground text-xs">
            Энэ бол <strong>1-р шат</strong> — та ЗӨВХӨН шалгаж байна, батлахгүй. Таны шалгасан
            хэмжээг дараа нь ӨӨР хяналтын инженер батална. Актад зөвхөн 2-р шат орно.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Энэ бол <strong>2-р шат</strong> — эцсийн батлалт. Батлагдсан хэмжээ актад орж,
            төлбөр тооцоонд ордог.
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          {words.pool}:{" "}
          <span className="text-foreground font-medium tabular-nums">
            {formatQty(pendingQty, item.unit)}
          </span>
        </p>

        <FormField
          label={`${words.qty} (${item.unit})`}
          hint={`Хоосон бол бүгдийг ${stage === "site_check" ? "шалгана" : "батална"}.`}
        >
          <Input
            type="number"
            min={0}
            max={pendingQty}
            step="0.001"
            placeholder={formatQty(pendingQty)}
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
            <Check className="size-4" /> {partial ? words.partial : words.verb}
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
      ...(progress ?? []).map((e) => ({
        kind: "progress" as const,
        at: e.recordedAt,
        entry: e,
      })),
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
                        {formatQty(e.entry.completedQty)} мэдээлсэн
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
                          : `${formatQty(e.entry.acceptedQty)} батлагдсан`}
                        {e.entry.rejectedQty > 0 && e.entry.result !== "rejected"
                          ? ` · ${formatQty(e.entry.rejectedQty)} татгалзсан`
                          : ""}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {e.entry.stageLabel ?? INSPECTION_STAGE[e.entry.stage]}
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
