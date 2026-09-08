"use client";

/**
 * Блокийн явцын дэлгэц (API v2).
 *
 * Нэг блокт ~3,290 ажлын нэгж байдаг тул жагсаалтаар харуулах боломжгүй.
 * Эхлээд нэгтгэсэн бүлгүүд (давхар / ажлын бүлэг / гүйцэтгэгч), бүлэг дарахад
 * тухайн мөрийн ЯГ ДООР ажлууд задарч гарна. Урьд нь дэлгэрэнгүй нь хүснэгтийн
 * доод талд гардаг байсан — 18 давхрын жагсаалтын ард нуугдаж, дарахад юу ч
 * болоогүй мэт харагддаг байв.
 *
 * Бүх нэгтгэл, шүүлт, хуудаслалт серверт хийгдэнэ.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarClock, ChevronRight, Plus, Users } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { AddWorkTypeDialog } from "@/components/add-work-type-dialog";
import { FloorDurationDialog } from "@/components/floor-duration-dialog";
import { EmptyBlockSetup } from "@/components/empty-block-setup";
import { DualProgressBar, ProgressBar } from "@/components/progress-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ReviewStateBadge, ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { blocks, workItems } from "@/lib/api/v2/endpoints";
import type {
  BlockSummary,
  ReviewState,
  SummaryGroupBy,
  WorkItemFilters,
} from "@/lib/api/v2/types";
import { useMe } from "@/lib/api/v2/use-me";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
/** Бүлгийн хүснэгтийн баганын тоо — задардаг мөр бүхэлд нь дэлгэгдэнэ. */
const GROUP_COLUMNS = 6;

const GROUP_TABS: { value: SummaryGroupBy; label: string }[] = [
  { value: "floor", label: "Давхраар" },
  { value: "workTypeGroup", label: "Ажлын бүлгээр" },
  { value: "contractor", label: "Гүйцэтгэгчээр" },
];

const REVIEW_FILTERS: { value: ReviewState | ""; label: string }[] = [
  { value: "", label: "Бүгд" },
  { value: "pending", label: "Батлахыг хүлээж буй" },
  { value: "returned", label: "Буцаагдсан" },
  { value: "approved", label: "Батлагдсан" },
  { value: "none", label: "Эхлээгүй" },
];

interface Selection {
  key: string;
  label: string;
  /** Серверийн буцаасан шүүлтүүр — client тал бүлэглэлтийн дүрмийг таамаглахгүй. */
  filter: WorkItemFilters;
}

export default function BlockProgressPage() {
  const { blockId } = useParams<{ blockId: string }>();

  const { me } = useMe();

  const [groupBy, setGroupBy] = useState<SummaryGroupBy>("floor");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState | "">("");
  const [page, setPage] = useState(1);

  /**
   * Дээд талын тоон дээр дарж шууд тэр ажлуудыг харах горим.
   *
   * Урьд нь "Хугацаа хэтэрсэн: 47" гэж бичээд тэр 47-г харах арга байхгүй
   * байсан — хэрэглэгч бүлэг бүрийг гараар нээж хайх ёстой байв.
   */
  const [focus, setFocus] = useState<Selection | null>(null);
  const [addingWork, setAddingWork] = useState(false);
  const [editingDuration, setEditingDuration] = useState(false);

  const blockQuery = useQuery({
    queryKey: ["v2-block", blockId],
    queryFn: () => blocks.get(blockId),
  });
  const summaryQuery = useQuery({
    queryKey: ["v2-summary", blockId, groupBy],
    queryFn: () => blocks.summary(blockId, groupBy),
  });

  // Тоон дээр дарсан бол түүний шүүлтүүр давамгайлна — бүлгийн сонголт биш.
  const active = focus ?? selected;

  const filters = useMemo<WorkItemFilters>(
    () => ({
      ...(active?.filter ?? {}),
      reviewState: reviewState || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [active, reviewState, page],
  );

  const itemsQuery = useQuery({
    queryKey: ["v2-work-items", blockId, filters],
    queryFn: () => workItems.listForBlock(blockId, filters),
    enabled: Boolean(active),
    placeholderData: keepPreviousData,
  });

  /** Бүлэг эсвэл шүүлтүүр солигдоход хуудсыг эхнээс нь эхлүүлнэ. */
  const pick = (
    next: Partial<{
      groupBy: SummaryGroupBy;
      selected: Selection | null;
      reviewState: ReviewState | "";
    }>,
  ) => {
    if (next.groupBy !== undefined) {
      setGroupBy(next.groupBy);
      setSelected(null);
    }
    if (next.selected !== undefined) {
      setSelected(next.selected);
      // Бүлэг сонговол тоон фокусаас гарна — хоёр шүүлтүүр зэрэг идэвхтэй
      // байвал хэрэглэгч юу хараад байгаагаа мэдэхгүй болно.
      setFocus(null);
    }
    if (next.reviewState !== undefined) setReviewState(next.reviewState);
    setPage(1);
  };

  /** Дээд талын тоон дээр дарахад — тэр ажлуудыг шууд нээнэ. */
  const focusOn = (label: string, filter: WorkItemFilters, review: ReviewState | "" = "") => {
    const same = focus?.label === label;
    setFocus(same ? null : { key: label, label, filter });
    setSelected(null);
    setReviewState(same ? "" : review);
    setPage(1);
  };

  const summary = summaryQuery.data;
  const totals = summary?.totals;
  const meta = itemsQuery.data?.meta;

  if (blockQuery.error)
    return (
      <ErrorState
        message={(blockQuery.error as Error).message}
        onRetry={() => blockQuery.refetch()}
      />
    );

  return (
    <div>
      <PageHeader
        title={blockQuery.data?.name ?? "Блок"}
        crumbs={[{ label: "Блокууд", href: "/blocks" }, { label: blockQuery.data?.name ?? "Блок" }]}
        description={
          blockQuery.data
            ? `${blockQuery.data.floors} давхар · ${blockQuery.data.unitCount} айл · барилга №${blockQuery.data.buildingNo} · давхар тутам ${blockQuery.data.taktDays ?? 5} хоног`
            : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Загварт байхгүй ажил (нэмэлт хийц, гэрээний өөрчлөлт) бодит
                амьдрал дээр байнга гардаг — хоосон блокийн функц биш. */}
            {me?.canEditPlan && (
              <Button variant="outline" onClick={() => setAddingWork(true)}>
                <Plus className="size-4" /> Ажил нэмэх
              </Button>
            )}
            {/* Давхрын хугацаа. Огноо буруу бол хоцролтын тоо бүхэлдээ
                утгагүй болох тул засах зам байх ёстой. */}
            {me?.canEditPlan && (
              <Button variant="outline" onClick={() => setEditingDuration(true)}>
                <CalendarClock className="size-4" /> Хуваарь
              </Button>
            )}
            {/* Хариуцагч оноохгүй бол гүйцэтгэгч нэвтрээд юу ч харахгүй. */}
            {me?.canManageContractors && (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/blocks/${blockId}/assignments`} />}
              >
                <Users className="size-4" /> Хариуцагч оноох
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ProgressSummary totals={totals} loading={summaryQuery.isLoading} />

        {/* Үйлдэл шаардсан хоёр тоо — дарж шууд харна. */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-1">
          <ActionStat
            label="Батлахыг хүлээж буй"
            value={totals?.pendingInspections}
            loading={summaryQuery.isLoading}
            tone={totals?.pendingInspections ? "amber" : "muted"}
            active={focus?.label === "Батлахыг хүлээж буй"}
            onClick={() => focusOn("Батлахыг хүлээж буй", {}, "pending")}
          />
          <ActionStat
            label="Хугацаа хэтэрсэн"
            value={totals?.overdue}
            loading={summaryQuery.isLoading}
            tone={totals?.overdue ? "red" : "muted"}
            active={focus?.label === "Хугацаа хэтэрсэн"}
            onClick={() => focusOn("Хугацаа хэтэрсэн", { overdueDays: 1 })}
          />
        </div>
      </div>

      {/* Ажилгүй блок бол мухардмал төлөв болох ёсгүй — гарцыг нь тэр
          дор нь харуулна. */}
      {!summaryQuery.isLoading && (summary?.groups.length ?? 0) === 0 ? (
        <EmptyBlockSetup
          blockId={blockId}
          startDate={blockQuery.data?.startDate}
          canEdit={Boolean(me?.canEditPlan)}
        />
      ) : (
        <>
          {/* Тоон дээр дарсан үед — бүлгийн хүснэгтийн оронд шүүсэн жагсаалт. */}
          {focus ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">
                  {focus.label}
                  {meta && (
                    <span className="text-muted-foreground ml-2 font-normal tabular-nums">
                      {meta.total.toLocaleString("mn-MN")} ажил
                    </span>
                  )}
                </h2>
                <Button variant="outline" size="sm" onClick={() => focusOn(focus.label, {})}>
                  <ArrowLeft className="size-3.5" /> Бүлгүүд рүү буцах
                </Button>
              </div>

              <GroupDetail
                reviewState={reviewState}
                onReviewState={(v) => {
                  setReviewState(v);
                  setPage(1);
                }}
                query={itemsQuery}
                meta={meta}
                onPage={setPage}
              />
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-1">
                {GROUP_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => pick({ groupBy: tab.value })}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      groupBy === tab.value
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {summaryQuery.isLoading ? (
                <LoadingRows rows={5} />
              ) : summaryQuery.error ? (
                <ErrorState
                  message={(summaryQuery.error as Error).message}
                  onRetry={() => summaryQuery.refetch()}
                />
              ) : (
                <Card className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Бүлэг</TableHead>
                        <TableHead className="w-44">Явц</TableHead>
                        <TableHead className="text-right">Ажил</TableHead>
                        <TableHead className="text-right">Хүлээгдэж буй</TableHead>
                        <TableHead className="text-right">Товлосон</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(summary?.groups ?? []).map((g) => {
                        const active = selected?.key === g.key;

                        return (
                          <Fragment key={g.key}>
                            <TableRow
                              onClick={() =>
                                pick({
                                  selected: active
                                    ? null
                                    : { key: g.key, label: g.label, filter: g.filter },
                                })
                              }
                              className={cn("cursor-pointer", active && "bg-accent/50")}
                            >
                              <TableCell className="font-medium">{g.label}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {/* Батлагдсан (тод) + батлагдаагүй (шар) — ганц хувь
                              харуулах нь "би хийсэн / чи батлаагүй" маргааныг
                              нуудаг. */}
                                  <DualProgressBar
                                    accepted={g.acceptedQty}
                                    reported={g.reportedQty}
                                    planned={g.plannedQty}
                                    className="w-20"
                                  />
                                  <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
                                    {g.percentage}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {g.workItems}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {g.pendingInspections ? (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    {g.pendingInspections}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {g.overdue ? (
                                  <span className="text-destructive">{g.overdue} хоцорсон</span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    {g.plannedEndDate ?? "—"}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <ChevronRight
                                  className={cn(
                                    "text-muted-foreground size-4 transition-transform",
                                    active && "rotate-90",
                                  )}
                                />
                              </TableCell>
                            </TableRow>

                            {active && (
                              <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={GROUP_COLUMNS} className="bg-muted/30 p-4">
                                  <GroupDetail
                                    reviewState={reviewState}
                                    onReviewState={(v) => pick({ reviewState: v })}
                                    query={itemsQuery}
                                    meta={meta}
                                    onPage={setPage}
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              )}

              {!selected && (summary?.groups.length ?? 0) > 0 && (
                <p className="text-muted-foreground mt-3 text-center text-sm">
                  Дэлгэрэнгүйг харахын тулд бүлэг дээр дарна уу.
                </p>
              )}
            </>
          )}
        </>
      )}
      {me?.canEditPlan && (
        <>
          <AddWorkTypeDialog
            blockId={blockId}
            open={addingWork}
            onOpenChange={setAddingWork}
            onDone={() => summaryQuery.refetch()}
          />
          <FloorDurationDialog
            // Блокийн өгөгдөл дараа ирвэл талбарын анхны утга хуучирна —
            // дахин холбож шинэ утгаар эхлүүлнэ.
            key={blockQuery.data?.taktDays ?? 5}
            blockId={blockId}
            open={editingDuration}
            onOpenChange={setEditingDuration}
            currentDays={blockQuery.data?.taktDays ?? 5}
            floors={blockQuery.data?.floors ?? 0}
            startDate={blockQuery.data?.startDate}
          />
        </>
      )}
    </div>
  );
}

/** Сонгосон бүлгийн доор задардаг ажлын жагсаалт. */
function GroupDetail({
  reviewState,
  onReviewState,
  query,
  meta,
  onPage,
}: {
  reviewState: ReviewState | "";
  onReviewState: (value: ReviewState | "") => void;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof workItems.listForBlock>>>>;
  meta?: { total: number; page: number; pageSize: number };
  onPage: (updater: (page: number) => number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {REVIEW_FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            onClick={() => onReviewState(f.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              reviewState === f.value
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <LoadingRows rows={3} />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : !query.data || query.data.data.length === 0 ? (
        <EmptyState title="Ажил олдсонгүй" description="Шүүлтүүрээ өөрчилж үзнэ үү." />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ажил</TableHead>
                <TableHead>Байршил</TableHead>
                <TableHead className="text-right">Төлөвлөсөн</TableHead>
                <TableHead className="text-right">Батлагдсан</TableHead>
                <TableHead className="w-32">Явц</TableHead>
                <TableHead>Төлөв</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">
                    <Link href={`/work-items/${w.id}`} className="hover:underline">
                      {w.workType.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{w.location.path}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {w.plannedQty} {w.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {w.acceptedQty} {w.unit}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={w.percentage} className="w-14" />
                      <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
                        {w.percentage}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <ReviewStateBadge state={w.reviewState} />
                      {w.overdueDays > 0 && <ToneBadge tone="red">{w.overdueDays} хоног</ToneBadge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {meta && meta.total > meta.pageSize && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm tabular-nums">
            {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)}{" "}
            / {meta.total.toLocaleString("mn-MN")}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page <= 1 || query.isFetching}
              onClick={() => onPage((p) => Math.max(1, p - 1))}
            >
              Өмнөх
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page * meta.pageSize >= meta.total || query.isFetching}
              onClick={() => onPage((p) => p + 1)}
            >
              Дараах
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Блокийн явцын үндсэн карт.
 *
 * Гурван тоог ЗЭРЭГ харуулна: төлөвлөсөн, мэдээлэгдсэн, батлагдсан. Зөвхөн
 * хувь харуулбал "34%" гэдэг нь юу гэсэн үг болох нь тодорхойгүй — батлагдсан
 * уу, хийгдсэн үү? Захиалагчийн маргааны эх үүсвэр яг энэ хоёрын зөрүү.
 */
function ProgressSummary({
  totals,
  loading,
}: {
  totals?: BlockSummary["totals"];
  loading?: boolean;
}) {
  const pendingQty = totals ? Math.max(0, totals.reportedQty - totals.acceptedQty) : 0;

  return (
    <Card className="lg:col-span-2">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">
              {loading ? "…" : `${totals?.percentage ?? 0}%`}
            </span>
            <span className="text-muted-foreground text-sm">батлагдсан</span>
          </div>
          <span className="text-muted-foreground text-sm tabular-nums">
            {totals ? `${totals.workItems.toLocaleString("mn-MN")} ажил` : "—"}
            {totals?.plannedEndDate ? ` · ${totals.plannedEndDate} хүртэл` : ""}
          </span>
        </div>

        <DualProgressBar
          accepted={totals?.acceptedQty ?? 0}
          reported={totals?.reportedQty ?? 0}
          planned={totals?.plannedQty ?? 1}
          className="h-2"
        />

        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <Legend className="bg-blue-500" label="Батлагдсан" value={totals?.acceptedQty} />
          <Legend className="bg-amber-400/60" label="Батлахыг хүлээж буй" value={pendingQty} />
          <Legend
            className="bg-muted"
            label="Эхлээгүй"
            value={totals ? Math.max(0, totals.plannedQty - totals.reportedQty) : undefined}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({ className, label, value }: { className: string; label: string; value?: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
      <span className="tabular-nums">
        {value === undefined ? "—" : Math.round(value).toLocaleString("mn-MN")}
      </span>
    </span>
  );
}

/**
 * Дарагддаг тоо — үйлдэл шаардсан үзүүлэлт.
 *
 * "47 хугацаа хэтэрсэн" гэж хараад тэр 47-г харах арга байх ёстой. Урьд нь
 * зөвхөн тоо байсан тул хэрэглэгч бүлэг бүрийг гараар нээж хайдаг байв.
 */
function ActionStat({
  label,
  value,
  loading,
  tone,
  active,
  onClick,
}: {
  label: string;
  value?: number;
  loading?: boolean;
  tone: "amber" | "red" | "muted";
  active?: boolean;
  onClick: () => void;
}) {
  const empty = !value;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      className={cn(
        "rounded-xl border p-4 text-left transition-colors",
        empty ? "cursor-default" : "hover:bg-accent cursor-pointer",
        active && "ring-primary ring-2",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 text-2xl font-semibold tabular-nums",
          !empty && tone === "red" && "text-destructive",
          !empty && tone === "amber" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {!empty && tone === "red" && <AlertTriangle className="size-5" />}
        {loading ? "…" : (value ?? 0)}
      </div>
      <div className="text-muted-foreground text-sm">{label}</div>
    </button>
  );
}
