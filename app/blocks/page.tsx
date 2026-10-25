"use client";

/**
 * Блокийн жагсаалт — v2 горимын нүүр хуудас.
 *
 * Явцын хувь, хоцролтыг төслийн dashboard-аас авна (сервер талд нэгтгэгдсэн),
 * давхар/айлын тоог блокийн жагсаалтаас. Хоёр дуудлага зэрэг явна.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ChevronRight, LayoutGrid, List, Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { BlockCard } from "@/components/block-card";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { blocks, projectsV2 } from "@/lib/api/v2/endpoints";
import { useMe } from "@/lib/api/v2/use-me";
import { useProject } from "@/lib/api/v2/use-project";
import { cn } from "@/lib/utils";

const VIEW_KEY = "cpms.blocks.view";

type BlocksView = "card" | "list";

/**
 * Карт эсвэл хүснэгт — сонголтыг САНАНА.
 *
 * Хоёулаа хэрэгтэй: карт нь «аль барилга анхаарал шаардаж байна»
 * гэдгийг харцаар хэлнэ, хүснэгт нь 75 мөрийг нэг дэлгэцэд багтаана.
 * Хүн бүр өөр ажилтай тул аль нэгийг албадах нь буруу.
 *
 * `useState`-ийн залхуу эхлүүлэгч — рендерийн үед `localStorage` уншвал
 * сервер талын рендертэй зөрнө.
 */
function useView(): [BlocksView, (v: BlocksView) => void] {
  const [view, setRaw] = useState<BlocksView>("card");

  const set = useCallback((v: BlocksView) => {
    setRaw(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Хувийн горимд `localStorage` алдаа өгдөг — сонголт санагдахгүй
      // нь хуудас унахаас дээр.
    }
  }, []);

  return [view, set];
}

export default function BlocksPage() {
  const { project, isLoading: projectLoading, error: projectError } = useProject();
  const { me } = useMe();
  const isRep = me?.role === "contractor";

  const blocksQuery = useQuery({
    queryKey: ["v2-blocks", project?.id],
    queryFn: () => blocks.listForProject(project!.id),
    enabled: Boolean(project),
  });
  const dashQuery = useQuery({
    queryKey: ["v2-dashboard", project?.id],
    queryFn: () => projectsV2.dashboard(project!.id),
    enabled: Boolean(project),
  });

  const stats = new Map((dashQuery.data?.blocks ?? []).map((b) => [b.id, b]));

  /*
   * ТОО ЗӨВ ЭРЭМБЭЛНЭ.
   *
   * Сервер нэрээр эрэмбэлдэг нь тэмдэгтийн эрэмбэ: «А1, А10, А11, А2».
   * 75 барилгын цогцолборт энэ нь утгагүй. `numeric` сонголт нь нэр
   * доторх тоог ТООГООР харьцуулна: «А1, А2, А10, А11».
   */
  const sorted = [...(blocksQuery.data?.data ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, "mn", { numeric: true, sensitivity: "base" }),
  );

  const [view, setView] = useView();

  return (
    <div>
      <PageHeader
        title={isRep ? "Миний ажлууд" : "Блокууд"}
        description={
          project
            ? isRep
              ? // Тоонууд нь БҮХ ажлын биш, зөвхөн энэ компанийн ажлын дүн.
                // Үүнийг тодорхой бичихгүй бол "явц 3% байна" гэж хараад
                // барилга бүхэлдээ хоцорсон гэж андуурна.
                `${project.name} — доорх хувь нь таны компанийн ажлын дүн.`
              : `${project.name} — явцыг харахын тулд блок дээр дарна уу.`
            : "Ачаалж байна…"
        }
        actions={
          <div className="flex items-center gap-2">
            {/* Карт ↔ хүснэгт. Сонголт нь хөтөч дээр санагдана. */}
            <div className="flex rounded-md border p-0.5">
              {(
                [
                  ["card", LayoutGrid, "Картаар"],
                  ["list", List, "Жагсаалтаар"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "rounded px-2 py-1 transition-colors",
                    view === value ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>

            {!isRep && (
              <Button nativeButton={false} render={<Link href="/blocks/new" />}>
                <Plus className="size-4" /> Шинэ блок
              </Button>
            )}
          </div>
        }
      />

      {projectError ? (
        <ErrorState message={(projectError as Error).message} />
      ) : projectLoading || blocksQuery.isLoading ? (
        <LoadingRows rows={3} />
      ) : blocksQuery.error ? (
        <ErrorState
          message={(blocksQuery.error as Error).message}
          onRetry={() => blocksQuery.refetch()}
        />
      ) : !blocksQuery.data || blocksQuery.data.data.length === 0 ? (
        <EmptyState
          title={isRep ? "Танд оноогдсон ажил алга" : "Блок алга"}
          description={
            isRep
              ? "Ажлын хуваарь гарсны дараа энд харагдана. Хэрэв ажил хийж байгаа бол хяналтын инженертэй холбогдоно уу."
              : "Стандарт загвараас эхний блокоо үүсгэнэ үү."
          }
          action={
            !isRep && (
              <Link
                href="/blocks/new"
                className="text-primary text-sm font-medium underline-offset-4 hover:underline"
              >
                Шинэ блок үүсгэх
              </Link>
            )
          }
        />
      ) : view === "card" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((b) => (
            <BlockCard
              key={b.id}
              block={b}
              stat={stats.get(b.id)}
              loading={dashQuery.isLoading}
            />
          ))}
        </div>
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Блок</TableHead>
                <TableHead>Зориулалт</TableHead>
                <TableHead className="text-right">Давхар / айл</TableHead>
                <TableHead className="w-40">Явц</TableHead>
                <TableHead className="text-right">Хоцорсон</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((b) => {
                const s = stats.get(b.id);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <Link href={`/blocks/${b.id}`}>{b.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.purpose}</TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {b.floors} / {b.unitCount || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={s?.percentage ?? 0} className="w-20" />
                        <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
                          {dashQuery.isLoading ? "…" : `${s?.percentage ?? 0}%`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s?.overdue ? <span className="text-destructive">{s.overdue}</span> : "—"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/blocks/${b.id}`} aria-label={`${b.name} дэлгэрэнгүй`}>
                        <ChevronRight className="text-muted-foreground size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
