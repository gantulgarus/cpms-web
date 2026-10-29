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
import {
  AlertTriangle,
  CalendarPlus,
  ChevronRight,
  RotateCcw,
  Search,
  Stamp,
} from "lucide-react";

import { ExtendDeadlineDialog } from "@/components/extend-deadline-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { blocks as blocksApi, queue } from "@/lib/api/endpoints";
import type { QueueType, WorkItem } from "@/lib/api/types";
import { useMe } from "@/lib/api/use-me";
import { useProject } from "@/lib/api/use-project";
import { formatQty } from "@/lib/domain";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

/**
 * Байршлын замаас блокийн нэрийг хасна.
 *
 * `location.path` нь «А1 блок › 5-р давхар › B2» гэж ирдэг. Блокийг
 * дээр нь тусдаа мөрөнд тод бичсэн тул замд давтагдах нь зай иддэг.
 */
function stripBlock(path: string, blockName?: string | null): string {
  if (!blockName) return path;

  const prefix = `${blockName} › `;

  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

const TABS: { value: QueueType; label: string; icon: typeof Stamp; hint: string }[] = [
  /*
   * Хоёр шат — хоёр дараалал.
   *
   * Нэг жагсаалт хуваалцвал талбайн инженер ба хяналтын инженер хоёулаа
   * 3,711 мөрийг шүүж өөрийнхөө ажлыг хайх болно. Дараалал гэдэг үгийн
   * утга нь яг тэр хайлтыг арилгах байсан.
   */
  {
    value: "check",
    label: "Шалгахыг хүлээж буй",
    icon: Search,
    hint: "Гүйцэтгэгч мэдээлсэн — талбайн инженер газар дээр нь шалгах ёстой.",
  },
  {
    value: "approval",
    label: "Батлахыг хүлээж буй",
    icon: Stamp,
    hint: "Талбайн инженер шалгасан — хяналтын инженер батлах ёстой.",
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
  /*
   * Анхдагч таб нь ҮҮРГЭЭС хамаарна.
   *
   * Талбайн инженер нэвтрэхэд «батлахыг хүлээж буй» жагсаалт нээгдвэл
   * түүний хийж чадахгүй ажлууд харагдана. Хүн бүр өөрийн дараалалд
   * ормоор байна.
   */
  const defaultTab: QueueType = me?.role === "site_engineer" ? "check" : "approval";
  const [tab, setTab] = useState<QueueType | null>(
    initial === "returned" || initial === "overdue" || initial === "check" || initial === "approval"
      ? (initial as QueueType)
      : null,
  );
  const activeTab: QueueType = tab ?? defaultTab;
  const [page, setPage] = useState(1);
  const [extending, setExtending] = useState<WorkItem | null>(null);

  /*
   * БЛОКООР ШҮҮХ.
   *
   * «Өнөөдөр юу батлах вэ» гэдэгт блок хамаагүй нь үнэн — гэхдээ «А1 рүү
   * явж байгаа тул А1-ийнхээ ажлыг нэг дор дуусгая» гэдэг нь бас үнэн.
   * 75 барилгын цогцолборт хоёр дахь нь илүү түгээмэл.
   */
  const [blockId, setBlockId] = useState<string>("");

  const blockList = useQuery({
    queryKey: ["blocks", project?.id],
    queryFn: () => blocksApi.listForProject(project!.id),
    enabled: Boolean(project),
  });

  const blockOptions = blockList.data?.data ?? [];

  /*
   * `Select.Value` нь УТГЫГ харуулдаг тул UUID → нэр гэсэн хүснэгт
   * өгөхгүй бол товчин дээр UUID гарна.
   */
  const blockLabels = Object.fromEntries(blockOptions.map((b) => [b.id, b.name]));

  const counts = useQuery({
    queryKey: ["queue-counts", project?.id, blockId],
    queryFn: () => queue.counts(project!.id, blockId ? { blockId } : {}),
    enabled: Boolean(project),
  });

  const list = useQuery({
    queryKey: ["queue", project?.id, activeTab, page, blockId],
    queryFn: () =>
      queue.list(project!.id, activeTab, {
        page,
        pageSize: PAGE_SIZE,
        ...(blockId ? { blockId } : {}),
      }),
    enabled: Boolean(project),
    placeholderData: keepPreviousData,
  });

  const total = list.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const siteEngineer = me?.role === "site_engineer";
  const active = TABS.find((t) => t.value === activeTab)!;

  return (
    <div>
      {siteEngineer && <p className="text-muted-foreground mb-3 text-sm">Зөвхөн танд барилга, ажлын бүлгээр хуваарилсан ажлууд харагдана. Ажил харагдахгүй бол ерөнхий инженер эсвэл төслийн менежерээр хуваарилалтаа шалгуулна уу.</p>}
      <PageHeader
        title={me?.role === "site_engineer" ? "Миний шалгах ажлууд" : "Ажлын дараалал"}
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
                activeTab === t.value
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

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-52">
          <Select
            value={blockId}
            items={blockLabels}
            onValueChange={(v) => {
              setBlockId(v ?? "");
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Бүх блок" />
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

        {blockId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBlockId("");
              setPage(1);
            }}
          >
            Бүх блок харах
          </Button>
        )}

        <p className="text-muted-foreground text-xs">{active.hint}</p>
      </div>

      {list.isLoading ? (
        <LoadingRows rows={6} />
      ) : list.error ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : total === 0 ? (
        <EmptyState
          title="Хүлээгдэж буй зүйл алга"
          description={
            activeTab === "check"
              ? "Шалгах зүйл алга — мэдээлэгдсэн бүх ажил шалгагдсан байна."
              : activeTab === "approval"
                ? "Батлах зүйл алга — шалгагдсан бүх ажил баталгаажсан байна."
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
                  <TableHead>Блок, байршил</TableHead>
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
                      {/*
                        Дарааллын ХҮРЭЭГ холбоосоор дамжуулна.
                        Нэг ажлыг шийдсэний дараа дэлгэц дараагийнх руу
                        өөрөө үсрэхийн тулд «ямар дараалал, ямар блок»
                        гэдгийг мэдэх ёстой.
                      */}
                      <Link
                        href={{
                          pathname: `/work-items/${w.id}`,
                          query: {
                            from: "queue",
                            type: activeTab,
                            ...(blockId ? { blockId } : {}),
                          },
                        }}
                      >
                        {w.name}
                      </Link>
                    </TableCell>
                    {/* Блокийг ТУСДАА мөрөнд, тод. Урьд нь «А1 блок › 5-р
                        давхар › B2» гэсэн урт зам нэг мөрөнд багтаж, олон
                        блокийн ажил холилдоход аль барилгынх болох нь
                        харцаар ялгагдахгүй байв. */}
                    <TableCell>
                      <div className="font-medium">{w.blockName ?? "—"}</div>
                      <div className="text-muted-foreground text-xs">
                        {stripBlock(w.location.path, w.blockName)}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {w.contractor?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* Батлахыг хүлээж буй хэмжээ = мэдээлсэн − батлагдсан */}
                      {formatQty(w.reportedQty - w.acceptedQty, w.unit)}
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
                        {/* Сунгах хүсэлт гаргах эрх нь ӨРГӨН: хуваарь хэтэрч
                            байгааг хамгийн эрт мэддэг хүн нь талбай дээрх
                            хүн. Шийдвэрийг ерөнхий инженер гаргана. */}
                        {activeTab === "overdue" &&
                          (me?.canEditPlan || me?.canReportProgress) && (
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
