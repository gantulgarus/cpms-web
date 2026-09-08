"use client";

/**
 * Төслийн хянах самбар — нүүр хуудас.
 *
 * ХУВААРЬ: энэ хуудас "ЮУ БОЛЖ БАЙНА" гэдэгт хариулна. "ЮУ ХИЙХ ВЭ" гэдэг нь
 * `/queue`-ийн ажил. Хоёуланг нь нэг хуудсанд хийвэл аль нь ч сайн ажиллахгүй:
 * тоо харах хүн жагсаалтад дарагдаж, ажил хийх хүн тоонуудыг алгасна.
 * Тиймээс энд ЖАГСААЛТ БАЙХГҮЙ — зөвхөн тоо, тэдгээр нь дарагдаж дарааллын
 * зөв таб руу аваачна.
 *
 * Бүх нэгтгэл серверт хийгдэнэ (`/projects/{id}/dashboard`, `/queue/counts`).
 * 75 барилга болоход client тал 3,290×75 мөр татаж бодох ёсгүй.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  RotateCcw,
  Stamp,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { DualProgressBar } from "@/components/progress-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { projectsV2, queue } from "@/lib/api/v2/endpoints";
import type { DashboardBlock } from "@/lib/api/v2/types";
import { useMe } from "@/lib/api/v2/use-me";
import { useProject } from "@/lib/api/v2/use-project";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { project, isLoading: projectLoading, error: projectError } = useProject();
  const { me } = useMe();
  const isRep = me?.role === "contractor";

  const dash = useQuery({
    queryKey: ["v2-dashboard", project?.id],
    queryFn: () => projectsV2.dashboard(project!.id),
    enabled: Boolean(project),
  });
  const counts = useQuery({
    queryKey: ["v2-queue-counts", project?.id],
    queryFn: () => queue.counts(project!.id),
    enabled: Boolean(project),
  });

  const d = dash.data;

  if (projectError) return <ErrorState message={(projectError as Error).message} />;

  return (
    <div>
      <PageHeader
        title={isRep ? "Миний ажлын явц" : "Хянах самбар"}
        description={
          project
            ? isRep
              ? // Гүйцэтгэгчид энэ нь ТӨСЛИЙН биш ӨӨРИЙН явц. Үүнийг бичихгүй
                // бол "төсөл 3% явж байна" гэж андуурна.
                `${project.name} — доорх бүх тоо таны компанийн ажлынх.`
              : `${project.name} — ерөнхий байдал. Ажил гүйцэтгэхийн тулд «Дараалал» хэсэг рүү орно уу.`
            : "Ачаалж байна…"
        }
      />

      {projectLoading || dash.isLoading ? (
        <LoadingRows rows={4} />
      ) : dash.error ? (
        <ErrorState message={(dash.error as Error).message} onRetry={() => dash.refetch()} />
      ) : !d ? (
        <EmptyState title="Өгөгдөл алга" description="Төсөлд блок үүсээгүй байна." />
      ) : (
        <div className="space-y-6">
          {/* --- Ерөнхий явц --- */}
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tabular-nums">{d.percentage}%</span>
                  <span className="text-muted-foreground text-sm">батлагдсан гүйцэтгэл</span>
                </div>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {d.blocks.length} барилга
                </span>
              </div>

              <DualProgressBar
                accepted={d.acceptedQty}
                reported={d.reportedQty}
                planned={d.plannedQty || 1}
                className="h-2.5"
              />

              {/* Мэдээлэгдсэн ба батлагдсаны зөрүү нь маргааны эх үүсвэр —
                  тусад нь нэрлэж харуулна. */}
              <p className="text-muted-foreground text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-blue-500" />
                  Батлагдсан {Math.round(d.acceptedQty).toLocaleString("mn-MN")}
                </span>
                <span className="mx-3 inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-400/60" />
                  Батлахыг хүлээж буй{" "}
                  {Math.round(Math.max(0, d.reportedQty - d.acceptedQty)).toLocaleString("mn-MN")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="bg-muted size-2 rounded-full" />
                  Эхлээгүй{" "}
                  {Math.round(Math.max(0, d.plannedQty - d.reportedQty)).toLocaleString("mn-MN")}
                </span>
              </p>
            </CardContent>
          </Card>

          {/* --- Анхаарал шаардсан тоонууд — бүгд дарагдана --- */}
          <div className="grid gap-4 sm:grid-cols-3">
            <AttentionTile
              href="/queue?type=inspection"
              icon={Stamp}
              label="Батлахыг хүлээж буй"
              value={counts.data?.inspection ?? d.pendingInspections}
              tone="amber"
            />
            <AttentionTile
              href="/queue?type=overdue"
              icon={AlertTriangle}
              label="Хугацаа хэтэрсэн"
              value={counts.data?.overdue ?? d.overdueWorkItems}
              tone="red"
            />
            <AttentionTile
              href="/queue?type=returned"
              icon={RotateCcw}
              label="Буцаагдсан"
              value={counts.data?.returned ?? 0}
              tone="amber"
            />
          </div>

          {/* --- Саатлын шалтгаан --- */}
          {d.openIssues > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <AlertOctagon className="size-4" />
                  Нээлттэй саатал
                  <span className="text-muted-foreground tabular-nums">{d.openIssues}</span>
                </div>

                {/* "17 хоцорсон" гэдэг тоо шийдвэр гаргуулахгүй. "Түүний 12 нь
                    материал дутсанаас" гэдэг нь гаргуулна. */}
                <div className="space-y-1.5">
                  {d.issuesByCategory.map((c) => (
                    <div key={c.category} className="flex items-center gap-3 text-sm">
                      <span className="w-40 shrink-0">{c.categoryLabel}</span>
                      <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full bg-red-400"
                          style={{ width: `${(c.count / d.openIssues) * 100}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground w-8 text-right tabular-nums">
                        {c.count}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* --- Барилгууд --- */}
          <BlockSection blocks={d.blocks} />
        </div>
      )}
    </div>
  );
}

/**
 * Эрэмбэ: хоцорсон нь эхэнд, дараа нь батлах хүлээж буй, эцэст нь нэрээр.
 *
 * Цагаан толгойн дараалал бол хамгийн муу сонголт — 75 барилгад "А-1" нь
 * асуудалгүй, "Ю-9" нь шатаж байж болно.
 */
function sortByAttention(blocks: DashboardBlock[]): DashboardBlock[] {
  return [...blocks].sort(
    (a, b) =>
      b.overdue - a.overdue ||
      b.pendingInspections - a.pendingInspections ||
      a.name.localeCompare(b.name, "mn"),
  );
}

/** Анхаарал шаардаж байна уу — хоцорсон эсвэл батлах хүлээж буй ажилтай. */
const needsAttention = (b: DashboardBlock) => b.overdue > 0 || b.pendingInspections > 0;

/** Хэдэн барилгаас эхлээд хайлт харуулах вэ. */
const SEARCH_THRESHOLD = 12;

/**
 * Барилгуудын хэсэг.
 *
 * Захиалагчид 75 барилга байгаа. Бүгдийг нь ижил хэмжээний картаар зэрэгцүүлэн
 * тавивал асуудалгүй 60 нь шатаж байгаа 15-ыг булна — самбарын гол зорилго
 * тэр дор нь алдагдана.
 *
 * Тиймээс хоёр хэсэгт хуваана: анхаарал шаардсан нь дэлгэрэнгүй картаар,
 * хэвийн нь эвхэгдсэн нягт мөрөөр. "Хэвийн" гэдгийг ЗӨВХӨН нуухгүй — тоог нь
 * харуулж, дарж дэлгэх боломжтой.
 */
function BlockSection({ blocks }: { blocks: DashboardBlock[] }) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const q = search.trim().toLowerCase();
  const matched = q ? blocks.filter((b) => b.name.toLowerCase().includes(q)) : blocks;

  const attention = sortByAttention(matched.filter(needsAttention));
  const calm = sortByAttention(matched.filter((b) => !needsAttention(b)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          Барилгууд
          <span className="text-muted-foreground ml-2 font-normal tabular-nums">
            {blocks.length}
          </span>
        </h2>

        {blocks.length > SEARCH_THRESHOLD && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Барилгын нэрээр хайх…"
            className="h-8 max-w-56"
          />
        )}
      </div>

      {matched.length === 0 ? (
        <EmptyState title="Барилга олдсонгүй" description="Хайлтаа өөрчилж үзнэ үү." />
      ) : (
        <>
          {attention.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {attention.map((b) => (
                <BlockCard key={b.id} block={b} />
              ))}
            </div>
          )}

          {calm.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"
              >
                <ChevronRight
                  className={cn("size-4 transition-transform", showAll && "rotate-90")}
                />
                Хэвийн явж буй {calm.length} барилга
              </button>

              {showAll && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {calm.map((b) => (
                    <BlockCard key={b.id} block={b} />
                  ))}
                </div>
              )}
            </div>
          )}

          {attention.length === 0 && calm.length > 0 && !showAll && (
            <p className="text-muted-foreground text-sm">
              Анхаарал шаардсан барилга алга — бүгд хуваарийн дагуу явж байна.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function BlockCard({ block }: { block: DashboardBlock }) {
  return (
    <Link
      href={`/blocks/${block.id}`}
      className="hover:bg-accent/50 block rounded-xl border p-4 transition-colors"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-medium">{block.name}</span>
        <span className="text-muted-foreground text-sm tabular-nums">{block.percentage}%</span>
      </div>

      <DualProgressBar
        accepted={block.acceptedQty}
        reported={block.reportedQty}
        planned={block.plannedQty || 1}
      />

      <div className="text-muted-foreground mt-2 flex gap-3 text-xs">
        {block.overdue > 0 && (
          <span className="text-destructive flex items-center gap-1">
            <AlertTriangle className="size-3" />
            {block.overdue} хоцорсон
          </span>
        )}
        {block.pendingInspections > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {block.pendingInspections} батлах
          </span>
        )}
        {block.overdue === 0 && block.pendingInspections === 0 && <span>Хэвийн</span>}
      </div>
    </Link>
  );
}

function AttentionTile({
  href,
  icon: Icon,
  label,
  value,
  tone,
}: {
  href: string;
  icon: typeof Stamp;
  label: string;
  value: number;
  tone: "amber" | "red";
}) {
  const empty = value === 0;

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between rounded-xl border p-4 transition-colors",
        empty ? "opacity-60" : "hover:bg-accent",
      )}
    >
      <div>
        <div
          className={cn(
            "flex items-center gap-1.5 text-2xl font-semibold tabular-nums",
            !empty && tone === "red" && "text-destructive",
            !empty && tone === "amber" && "text-amber-600 dark:text-amber-400",
          )}
        >
          <Icon className="size-5" />
          {value.toLocaleString("mn-MN")}
        </div>
        <div className="text-muted-foreground text-sm">{label}</div>
      </div>
      {!empty && (
        <ArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
      )}
    </Link>
  );
}
