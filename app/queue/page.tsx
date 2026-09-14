"use client";

/**
 * "Надаас юу хүлээж байна" — төслийн хэмжээнд нэг жагсаалт.
 *
 * Урьд нь хяналтын инженер батлах ажлаа олохын тулд блок бүрийг нээж, 3,290
 * мөрийг шүүх ёстой байв. Ажил нь блокоор биш ЦАГААР зохион байгуулагддаг:
 * "өнөөдөр юу батлах вэ" гэсэн асуултад аль барилга гэдэг нь хамаагүй.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AlertTriangle, CalendarPlus, ChevronRight, RotateCcw, Stamp } from "lucide-react";

import { ExtendDeadlineDialog } from "@/components/extend-deadline-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { queue } from "@/lib/api/v2/endpoints";
import type { QueueType, WorkItem } from "@/lib/api/v2/types";
import { useMe } from "@/lib/api/v2/use-me";
import { useProject } from "@/lib/api/v2/use-project";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const TABS: { value: QueueType; label: string; icon: typeof Stamp; hint: string }[] = [
  {
    value: "inspection",
    label: "Батлахыг хүлээж буй",
    icon: Stamp,
    hint: "Гүйцэтгэл мэдээлэгдсэн ч хараахан баталгаажаагүй ажлууд.",
  },
  {
    value: "returned",
    label: "Буцаагдсан",
    icon: RotateCcw,
    hint: "Шалгалтад татгалзсан — дахин хийх шаардлагатай.",
  },
  {
    value: "overdue",
    label: "Хугацаа хэтэрсэн",
    icon: AlertTriangle,
    hint: "Төлөвлөсөн дуусах хугацаа өнгөрсөн ч дуусаагүй.",
  },
];

/**
 * `useSearchParams` нь статик рендерийг зогсоодог тул Suspense-д боох ёстой —
 * эс бөгөөс `next build` алдаа өгнө.
 */
export default function QueuePage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <QueueContent />
    </Suspense>
  );
}

function QueueContent() {
  const { project } = useProject();
  const { me } = useMe();
  // Хянах самбараас `?type=overdue` гэж ирж болно — тэр таб шууд нээгдэнэ.
  const params = useSearchParams();
  const initial = params.get("type");
  const [tab, setTab] = useState<QueueType>(
    initial === "returned" || initial === "overdue" ? initial : "inspection",
  );
  const [page, setPage] = useState(1);
  const [extending, setExtending] = useState<WorkItem | null>(null);

  const counts = useQuery({
    queryKey: ["v2-queue-counts", project?.id],
    queryFn: () => queue.counts(project!.id),
    enabled: Boolean(project),
  });

  const list = useQuery({
    queryKey: ["v2-queue", project?.id, tab, page],
    queryFn: () => queue.list(project!.id, tab, { page, pageSize: PAGE_SIZE }),
    enabled: Boolean(project),
    placeholderData: keepPreviousData,
  });

  const total = list.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const active = TABS.find((t) => t.value === tab)!;

  return (
    <div>
      <PageHeader
        title="Ажлын дараалал"
        description={
          me?.canInspect
            ? "Таны баталгаажуулалт хүлээж буй ажлууд — барилга бүрийг нэгжих шаардлагагүй."
            : "Таны мэдээлсэн ажлын явц энд харагдана."
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const n = counts.data?.[t.value];
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setTab(t.value);
                setPage(1);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                tab === t.value
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "hover:bg-accent",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
              {n !== undefined && <span className="tabular-nums opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      <p className="text-muted-foreground mb-3 text-xs">{active.hint}</p>

      {list.isLoading ? (
        <LoadingRows rows={6} />
      ) : list.error ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : total === 0 ? (
        <EmptyState
          title="Хүлээгдэж буй зүйл алга"
          description={
            tab === "inspection"
              ? "Бүх мэдээлэгдсэн ажил баталгаажсан байна."
              : "Энэ жагсаалтад ажил алга."
          }
        />
      ) : (
        <>
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ажил</TableHead>
                  <TableHead>Байршил</TableHead>
                  <TableHead>Гүйцэтгэгч</TableHead>
                  <TableHead className="text-right">Хүлээгдэж буй</TableHead>
                  <TableHead className="text-right">Хугацаа</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data?.data ?? []).map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">
                      <Link href={`/work-items/${w.id}`}>{w.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{w.location.path}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {w.contractor?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* Батлахыг хүлээж буй хэмжээ = мэдээлсэн − батлагдсан */}
                      {Math.round((w.reportedQty - w.acceptedQty) * 100) / 100} {w.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      {w.overdueDays > 0 ? (
                        <ToneBadge tone="red">{w.overdueDays} хоног</ToneBadge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {w.plannedEndDate ?? "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {/* Хугацаа хэтэрсэн табад л утгатай — бусад табад
                            огноо нь хараахан өнгөрөөгүй. */}
                        {tab === "overdue" && me?.canEditPlan && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExtending(w)}
                            title="Хугацаа сунгах"
                          >
                            <CalendarPlus className="size-3.5" /> Сунгах
                          </Button>
                        )}
                        <Link href={`/work-items/${w.id}`} aria-label={`${w.name} дэлгэрэнгүй`}>
                          <ChevronRight className="text-muted-foreground size-4" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {total} ажлаас {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Өмнөх
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Дараах
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Хугацаа сунгах — шалтгаан заавал бичигдэнэ. */}
      {extending && (
        <ExtendDeadlineDialog
          workItemId={extending.id}
          workItemName={extending.name}
          currentEndDate={extending.plannedEndDate}
          overdueDays={extending.overdueDays}
          open
          onOpenChange={(v) => !v && setExtending(null)}
          onDone={() => {
            setExtending(null);
            list.refetch();
          }}
        />
      )}
    </div>
  );
}
