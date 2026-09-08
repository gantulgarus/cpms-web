"use client";

/**
 * Блокийн жагсаалт — v2 горимын нүүр хуудас.
 *
 * Явцын хувь, хоцролтыг төслийн dashboard-аас авна (сервер талд нэгтгэгдсэн),
 * давхар/айлын тоог блокийн жагсаалтаас. Хоёр дуудлага зэрэг явна.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
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
import { blocks, projectsV2 } from "@/lib/api/v2/endpoints";
import { useMe } from "@/lib/api/v2/use-me";
import { useProject } from "@/lib/api/v2/use-project";

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
          !isRep && (
            <Button nativeButton={false} render={<Link href="/blocks/new" />}>
              <Plus className="size-4" /> Шинэ блок
            </Button>
          )
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
              {blocksQuery.data.data.map((b) => {
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
