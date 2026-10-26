"use client";

/** Хийх ажил → анхаарах зүйлс → барилгын явц. Нэгтгэлийг сервер тооцно. */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  RotateCcw,
  Search,
  Stamp,
  Users,
} from "lucide-react";

import { BlockCard } from "@/components/block-card";
import { DashboardCount } from "@/components/dashboard-count";
import { DashboardActions } from "@/components/dashboard-actions";
import { NoProjectState } from "@/components/no-project-state";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ItemLegend } from "@/components/progress-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { projects, queue } from "@/lib/api/endpoints";
import type { DashboardBlock, ItemCounts } from "@/lib/api/types";
import { useMe } from "@/lib/api/use-me";
import { isObserver } from "@/lib/domain";
import { useProject } from "@/lib/api/use-project";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { project, isLoading: projectLoading, error: projectError } = useProject();
  const { me } = useMe();
  /*
   * Зөвхөн харах үүрэг (захирал).
   *
   * Тоонууд нь ҮЛДЭНЭ — тэдгээр нь төслийн эрүүл мэндийн үзүүлэлт.
   * Харин ДАРАГДДАГ хайрцаг байхаа болино: дарвал хийж чадахгүй
   * дараалал руу аваачих нь «энэ чиний ажил» гэж худал хэлж байгаа хэрэг.
   */
  const observer = isObserver(me);
  const isRep = me?.role === "contractor";

  const dash = useQuery({
    queryKey: ["dashboard", project?.id],
    queryFn: () => projects.dashboard(project!.id),
    enabled: Boolean(project),
  });
  const counts = useQuery({
    queryKey: ["queue-counts", project?.id],
    queryFn: () => queue.counts(project!.id),
    enabled: Boolean(project),
  });

  const d = dash.data;
  const queueCounts = counts.isError ? undefined : counts.data;

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
              : `${project.name} — хийх ажил, анхаарах зүйлс, барилгын явц.`
            : "Ачаалж байна…"
        }
      />

      {projectLoading || dash.isLoading ? (
        <LoadingRows rows={4} />
      ) : !project ? (
        <NoProjectState />
      ) : dash.error ? (
        <ErrorState message={(dash.error as Error).message} onRetry={() => dash.refetch()} />
      ) : d?.blocks.length === 0 ? (
        <EmptyState title="Эхний барилгаа нэмье" description="Төсөл бэлэн байна. Барилга нэмсний дараа ажлуудаа тохируулж, гүйцэтгэл бүртгэж эхэлнэ."
          action={me?.canEditPlan ? <Button nativeButton={false} render={<Link href="/blocks/new" />}>Эхний барилгаа нэмэх</Button> : undefined} />
      ) : !d ? (
        <EmptyState title="Өгөгдөл алга" description="Төсөлд блок үүсээгүй байна." />
      ) : (
        <div className="space-y-6">
          {me && <DashboardActions me={me} counts={queueCounts} loading={counts.isPending} />}

          <section aria-labelledby="attention-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="attention-heading" className="font-medium">Анхаарах зүйлс</h2>
              {me?.canEditPlan && <Link href="/blocks" className="text-primary text-sm hover:underline">Барилга, ажлаа тохируулах →</Link>}
            </div>
            {counts.isError && (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
                <span>Хүлээгдэж буй ажлын тоог авч чадсангүй. «—» нь мэдээлэл тодорхойгүй гэсэн утгатай.</span>
                <Button size="sm" variant="outline" onClick={() => counts.refetch()} disabled={counts.isFetching}>Дахин оролдох</Button>
              </div>
            )}
            <div className={cn("grid gap-3 sm:grid-cols-2", me?.canCheck && me?.canInspect ? "lg:grid-cols-2" : !me?.canCheck && !me?.canInspect ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
              {!me?.canCheck && <AttentionTile href={null} icon={Search} label="Шалгалт хүлээж буй ажил" value={queueCounts?.check} loading={counts.isPending} tone="amber" />}
              {!me?.canInspect && <AttentionTile href={null} icon={Stamp} label="Батлалт хүлээж буй ажил" value={queueCounts?.approval} loading={counts.isPending} tone="amber" />}
              <AttentionTile href={observer ? null : "/queue?type=overdue"} icon={AlertTriangle} label="Хугацаа хэтэрсэн ажил" value={queueCounts?.overdue ?? d.overdueWorkItems} tone="red" />
              <AttentionTile href={observer ? null : "/queue?type=returned"} icon={RotateCcw} label="Буцаагдсан ажил" value={queueCounts?.returned} loading={counts.isPending} tone="amber" />
            </div>
            {observer && <p className="text-muted-foreground text-xs">Эдгээр нь төслийн үзүүлэлт. Ажлыг хариуцсан инженерүүд шалгаж, батална.</p>}

          {/* --- Тохируулга дутуу байна гэсэн анхааруулга ---

              ЯАГААД ТООН ХАЙРЦАГ БИШ ВЭ: дээрх гурван тоо нь ӨДӨР ТУТМЫН
              ажил. Хариуцагч оноох нь өдөр тутмын ажил биш, НЭГ УДААГИЙН
              тохируулга — дуусмагц бүрмөсөн алга болно. Хооронд нь холивол
              «анхаарал шаардсан» гэсэн эгнээ хэзээ ч тэглэгдэхгүй болно. */}
          {me?.canManageContractors && (d.unassignedItems ?? 0) > 0 && (
            <UnassignedNotice blocks={d.blocks} total={d.unassignedItems} />
          )}

          </section>

          {/* --- Барилгууд ---
              Явц нь ЗӨВХӨН энд харагдана. Барилга бүр өөрийн хувьтай — нэг
              тоонд шахаж нэгтгэвэл хаана асуудалтай байгаа нь алга болно. */}
          <BlockSection blocks={d.blocks} counts={d} />

          {/* --- Саатлын шалтгаан --- */}
          {d.openIssues > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <AlertOctagon className="size-4" />
                  Нээлттэй саатал
                  <span className="text-muted-foreground tabular-nums">{d.openIssues}</span>
                  <Link
                    href="/issues"
                    className="text-muted-foreground hover:text-foreground ml-auto text-xs font-normal"
                  >
                    Бүгдийг харах →
                  </Link>
                </div>

                {/* "17 хоцорсон" гэдэг тоо шийдвэр гаргуулахгүй. "Түүний 12 нь
                    материал дутсанаас" гэдэг нь гаргуулна.

                    Багана бүр нь ХОЛБООС: тоо нь асуулт төрүүлдэг («яагаад
                    12 юм бэ?») тул хариултыг нь нэг дарахад өгөх ёстой. */}
                <div className="space-y-1.5">
                  {d.issuesByCategory.map((c) => (
                    <Link
                      key={c.category}
                      href={`/issues?category=${c.category}`}
                      className="hover:bg-accent/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-1 text-sm transition-colors"
                    >
                      <span className="w-40 shrink-0">{c.categoryLabel}</span>
                      <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full bg-red-400"
                          style={{
                            width: `${(c.count / d.openIssues) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-muted-foreground w-8 text-right tabular-nums">
                        {c.count}
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * «Хариуцагч оноогоогүй ажил байна» гэсэн анхааруулга.
 *
 * Урьд нь энэ тоо ЗӨВХӨН оноох хуудсан дээр харагддаг байв — тийш орсон хүн
 * л мэддэг. Гэтэл оноохоо мартсан хүн яг тийш ордоггүй: туслан гүйцэтгэгч
 * нэвтрээд «юу ч харагдахгүй байна» гэж залгах хүртэл мэдэгддэггүй.
 */
function UnassignedNotice({ blocks, total }: { blocks: DashboardBlock[]; total: number }) {
  const affected = blocks.filter((b) => (b.unassignedItems ?? 0) > 0);

  return (
    <div className="flex flex-wrap items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <Users className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <strong className="tabular-nums">{total.toLocaleString("mn-MN")} ажил</strong> хариуцагчгүй
        байна. Туслан гүйцэтгэгч эдгээрийг харахгүй, гүйцэтгэл оруулах боломжгүй.
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {affected.map((b) => (
            <Link
              key={b.id}
              href={`/blocks/${b.id}/assignments`}
              className="underline underline-offset-2"
            >
              {b.name}{" "}
              <span className="tabular-nums">{b.unassignedItems.toLocaleString("mn-MN")}</span>
            </Link>
          ))}
        </div>
      </div>
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
 * Хэдэн барилга хүртэл БҮГДИЙГ нь шууд дэлгэх вэ.
 *
 * «Хэвийн явж буйг эвхэх» нь 75 барилгад утга учиртай. 2 барилгатай төсөлд
 * самбарын хагасыг нуух болно — хэрэглэгч «энэ хоёр барилга хаана байна» гэж
 * гайхна.
 */
const AUTO_EXPAND_MAX = 6;

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
function BlockSection({ blocks, counts }: { blocks: DashboardBlock[]; counts: ItemCounts }) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(blocks.length <= AUTO_EXPAND_MAX);

  const q = search.trim().toLowerCase();
  const matched = q ? blocks.filter((b) => b.name.toLowerCase().includes(q)) : blocks;

  const attention = sortByAttention(matched.filter(needsAttention));
  const calm = sortByAttention(matched.filter((b) => !needsAttention(b)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">
            Барилгын явц
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {blocks.length}
            </span>
          </h2>
          {/* Нийт ажлын тоо нь ХЭМЖЭЭСИЙН мэдээлэл — «5,008 ажлын 100 нь
              дууссан» гэдэг нь барилгын хувиудыг уншихад хэрэгтэй. Гэхдээ
              энэ нь самбарын толгойд сууж байхаар чухал зүйл биш. */}
          <p className="text-muted-foreground mt-0.5 text-xs">
            Нийт {counts.totalItems.toLocaleString("mn-MN")} ажил. Хувь нь тоо хэмжээтэй ажлуудын батлагдсан гүйцэтгэлийн дундаж; тоо хэмжээгүй ажлыг оруулаагүй.
          </p>
        </div>

        {blocks.length > SEARCH_THRESHOLD && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Барилгын нэрээр хайх…"
            className="h-8 max-w-56"
          />
        )}
      </div>

      <ItemLegend counts={counts} />

      {matched.length === 0 ? (
        <EmptyState title="Барилга олдсонгүй" description="Хайлтаа өөрчилж үзнэ үү." />
      ) : (
        <>
          {attention.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                Хоцролт, хүлээгдэж буй шалгалтгүй {calm.length} барилга
              </button>

              {showAll && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {calm.map((b) => (
                    <BlockCard key={b.id} block={b} />
                  ))}
                </div>
              )}
            </div>
          )}

          {attention.length === 0 && calm.length > 0 && !showAll && (
            <p className="text-muted-foreground text-sm">
              Бүртгэлээр хоцролттой болон шалгалт хүлээж буй барилга алга.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AttentionTile({
  href,
  icon: Icon,
  label,
  value,
  loading = false,
  tone,
}: {
  /** `null` бол ДАРАГДАХГҮЙ — үйлдэл хийх эрхгүй хүнд зориулав. */
  href: string | null;
  icon: typeof Stamp;
  label: string;
  value?: number;
  loading?: boolean;
  tone: "amber" | "red";
}) {
  const empty = value === 0;
  const needsAttention = typeof value === "number" && value > 0;

  const body = (
    <>
      <div>
        <div
          className={cn(
            "flex items-center gap-1.5 text-3xl font-semibold tracking-tight tabular-nums",
            !needsAttention && "text-muted-foreground",
            needsAttention && tone === "red" && "text-destructive",
            needsAttention && tone === "amber" && "text-amber-600 dark:text-amber-400",
          )}
        >
          <Icon className="size-5" />
          <DashboardCount value={value} loading={loading} />
        </div>
        <div className="text-muted-foreground text-sm">{label}</div>
      </div>
      {href && !empty && (
        <ArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
      )}
    </>
  );

  const shell = cn(
    "flex items-center justify-between rounded-xl border p-4",
    empty && "opacity-60",
  );

  /*
   * Холбоосгүй бол `div` — `Link` биш.
   *
   * Хулганы заагч, hover өнгө, сум гурав нь «дар» гэж хэлдэг. Дарахад
   * юу ч болохгүй бол хэрэглэгч эвдэрсэн гэж бодно.
   */
  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link href={href} className={cn(shell, "group transition-colors", !empty && "hover:bg-accent")}>
      {body}
    </Link>
  );
}
