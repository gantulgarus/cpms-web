"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { NewActivityDialog } from "@/components/dialogs/new-activity-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { WorkStatusBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { activities, workPackages } from "@/lib/api";
import { deriveStatus, loadWorkPackageRollup } from "@/lib/progress";
import { useRole } from "@/lib/role";

export default function WorkPackageDetailPage() {
  const { workPackageId } = useParams<{ workPackageId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isDirector } = useRole();

  const wpQuery = useQuery({ queryKey: ["workPackage", workPackageId], queryFn: () => workPackages.get(workPackageId) });
  const actQuery = useQuery({
    queryKey: ["activities", workPackageId],
    queryFn: () => activities.listForWorkPackage(workPackageId, { pageSize: 100 }),
  });
  const rollupQuery = useQuery({
    queryKey: ["wp-rollup", workPackageId],
    queryFn: () => loadWorkPackageRollup(workPackageId),
  });

  const remove = useMutation({
    mutationFn: () => workPackages.remove(workPackageId),
    onSuccess: () => {
      toast.success("Ажлын багц устгагдлаа");
      const projectId = wpQuery.data?.projectId;
      qc.invalidateQueries({ queryKey: ["workPackages"] });
      router.push(projectId ? `/projects/${projectId}` : "/");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const wp = wpQuery.data;
  if (wpQuery.isLoading) return <LoadingRows />;
  if (wpQuery.error) return <ErrorState message={(wpQuery.error as Error).message} onRetry={() => wpQuery.refetch()} />;
  if (!wp) return null;

  // Roll the activity rollups up to a work-package status for the header.
  const rollups = rollupQuery.data ? [...rollupQuery.data.values()] : [];
  const totalTasks = rollups.reduce((acc, r) => acc + r.taskCount, 0);
  const wpPercentage = totalTasks
    ? Math.round(rollups.reduce((acc, r) => acc + r.percentage * r.taskCount, 0) / totalTasks)
    : 0;
  const wpStatus = deriveStatus(wpPercentage, totalTasks, wp.status);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {wp.name} <WorkStatusBadge status={wpStatus} />
          </span>
        }
        crumbs={[
          { label: "Төслүүд", href: "/" },
          { label: "Ажлын бүтэц", href: `/projects/${wp.projectId}/work-packages` },
          { label: wp.name },
        ]}
        actions={
          isDirector && (
            <>
              <NewActivityDialog workPackageId={workPackageId} />
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm("Ажлын багцыг устгах уу?")) remove.mutate();
                }}
              >
                Устгах
              </Button>
            </>
          )
        }
      />

      {(wp.code || wp.description) && (
        <Card className="mb-6">
          <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 pt-6 text-sm sm:grid-cols-4">
            <Detail label="Код" value={wp.code} />
            <Detail label="Дараалал" value={wp.sequenceNumber?.toString()} />
            {wp.description && (
              <div className="col-span-2 sm:col-span-4">
                <div className="text-muted-foreground text-xs">Тайлбар</div>
                <div>{wp.description}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Үйл ажиллагаанууд</h2>
      {actQuery.isLoading ? (
        <LoadingRows rows={2} />
      ) : !actQuery.data || actQuery.data.data.length === 0 ? (
        <EmptyState title="Үйл ажиллагаа алга" description="Эхний үйл ажиллагаагаа нэмнэ үү." />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Нэр</TableHead>
                <TableHead>Код</TableHead>
                <TableHead className="text-right">Гүйцэтгэл</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {actQuery.data.data.map((a) => {
                const rollup = rollupQuery.data?.get(a.id);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <Link href={`/activities/${a.id}`}>{a.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.code ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rollup && rollup.taskCount > 0 ? `${rollup.percentage}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <WorkStatusBadge status={rollup?.status ?? a.status} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/activities/${a.id}`}>
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

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div>{value || "—"}</div>
    </div>
  );
}
