"use client";

/**
 * WBS tab — the project's work breakdown, one level at a time.
 *
 * Only work packages are listed here; drilling in goes to the work package
 * page (activities) and from there to tasks.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { NewWorkPackageDialog } from "@/components/dialogs/new-work-package-dialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { WorkStatusBadge } from "@/components/tone-badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { workPackages } from "@/lib/api";
import { loadProjectRollup } from "@/lib/progress";
import { useRole } from "@/lib/role";

export default function ProjectWorkPackagesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isDirector } = useRole();

  const wpQuery = useQuery({
    queryKey: ["workPackages", projectId],
    queryFn: () => workPackages.listForProject(projectId, { pageSize: 100 }),
  });
  const rollupQuery = useQuery({
    queryKey: ["project-rollup", projectId],
    queryFn: () => loadProjectRollup(projectId),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Ажлын багц <span className="px-1">›</span> үйл ажиллагаа{" "}
          <span className="px-1">›</span> даалгавар. Гүйцэтгэлийн хувь нь доорх даалгавруудын
          мэдээлсэн явцаас бодогдоно.
        </p>
        {isDirector && <NewWorkPackageDialog projectId={projectId} />}
      </div>

      {wpQuery.isLoading ? (
        <LoadingRows rows={3} />
      ) : wpQuery.error ? (
        <ErrorState message={(wpQuery.error as Error).message} onRetry={() => wpQuery.refetch()} />
      ) : !wpQuery.data || wpQuery.data.data.length === 0 ? (
        <EmptyState
          title="Ажлын багц алга"
          description="Ажлын багц бол төслийн хамгийн дээд түвшний хуваарилалт — жишээ нь “Суурь”, “Дотор засал”."
        />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ажлын багц</TableHead>
                <TableHead>Код</TableHead>
                <TableHead className="text-right">Гүйцэтгэл</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {wpQuery.data.data.map((wp) => {
                const rollup = rollupQuery.data?.get(wp.id);
                return (
                  <TableRow key={wp.id}>
                    <TableCell className="font-medium">
                      <Link href={`/work-packages/${wp.id}`}>{wp.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{wp.code ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rollupQuery.isLoading
                        ? "…"
                        : rollup && rollup.taskCount > 0
                          ? `${rollup.percentage}%`
                          : "—"}
                    </TableCell>
                    <TableCell>
                      <WorkStatusBadge status={rollup?.status ?? wp.status} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/work-packages/${wp.id}`} aria-label={`${wp.name} дэлгэрэнгүй`}>
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
