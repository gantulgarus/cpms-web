"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, X } from "lucide-react";
import { toast } from "sonner";

import { AssignContractorDialog } from "@/components/dialogs/assign-contractor-dialog";
import { NewTaskDialog } from "@/components/dialogs/new-task-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { WorkStatusBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { activities, tasks } from "@/lib/api";
import { formatDays } from "@/lib/domain";
import { deriveStatus, loadActivityRollup } from "@/lib/progress";
import { useRole } from "@/lib/role";

export default function ActivityDetailPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isDirector } = useRole();

  const activityQuery = useQuery({ queryKey: ["activity", activityId], queryFn: () => activities.get(activityId) });
  const tasksQuery = useQuery({
    queryKey: ["tasks", activityId],
    queryFn: () => tasks.listForActivity(activityId, { pageSize: 100 }),
  });
  const contractorsQuery = useQuery({
    queryKey: ["activityContractors", activityId],
    queryFn: () => activities.listContractors(activityId),
  });
  const rollupQuery = useQuery({
    queryKey: ["activity-rollup", activityId],
    queryFn: () => loadActivityRollup(activityId),
  });

  const remove = useMutation({
    mutationFn: () => activities.remove(activityId),
    onSuccess: () => {
      toast.success("Үйл ажиллагаа устгагдлаа");
      const wpId = activityQuery.data?.workPackageId;
      qc.invalidateQueries({ queryKey: ["activities"] });
      router.push(wpId ? `/work-packages/${wpId}` : "/");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassign = useMutation({
    mutationFn: (contractorId: string) => activities.unassignContractor(activityId, contractorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activityContractors", activityId] });
      toast.success("Хариуцлага цуцаллаа");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activity = activityQuery.data;
  if (activityQuery.isLoading) return <LoadingRows />;
  if (activityQuery.error)
    return <ErrorState message={(activityQuery.error as Error).message} onRetry={() => activityQuery.refetch()} />;
  if (!activity) return null;

  const assignedIds = new Set((contractorsQuery.data ?? []).map((a) => a.contractor.id));

  // Roll the per-task progress up to an activity status for the header.
  const rollups = rollupQuery.data ? [...rollupQuery.data.values()] : [];
  const activityPercentage = rollups.length
    ? Math.round(rollups.reduce((acc, r) => acc + r.percentage, 0) / rollups.length)
    : 0;
  const activityStatus = deriveStatus(activityPercentage, rollups.length, activity.status);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {activity.name} <WorkStatusBadge status={activityStatus} />
          </span>
        }
        crumbs={[
          { label: "Төслүүд", href: "/" },
          { label: "Ажлын багц", href: `/work-packages/${activity.workPackageId}` },
          { label: activity.name },
        ]}
        actions={
          isDirector && (
            <>
              <NewTaskDialog activityId={activityId} />
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm("Үйл ажиллагааг устгах уу?")) remove.mutate();
                }}
              >
                Устгах
              </Button>
            </>
          )
        }
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Даалгаврууд</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {tasksQuery.isLoading ? (
              <div className="p-4">
                <LoadingRows rows={2} />
              </div>
            ) : !tasksQuery.data || tasksQuery.data.data.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Даалгавар алга" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Нэр</TableHead>
                    <TableHead>Хугацаа</TableHead>
                    <TableHead className="text-right">Гүйцэтгэл</TableHead>
                    <TableHead>Төлөв</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasksQuery.data.data.map((t) => {
                    const rollup = rollupQuery.data?.get(t.id);
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">
                          <Link href={`/tasks/${t.id}`}>{t.name}</Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDays(t.durationDays)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {rollup ? `${rollup.percentage}%` : "—"}
                        </TableCell>
                        <TableCell>
                          <WorkStatusBadge status={rollup?.status ?? t.status} />
                        </TableCell>
                        <TableCell>
                          <Link href={`/tasks/${t.id}`}>
                            <ChevronRight className="text-muted-foreground size-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Гүйцэтгэгчид</CardTitle>
            {isDirector && <AssignContractorDialog activityId={activityId} assignedIds={assignedIds} />}
          </CardHeader>
          <CardContent className="space-y-2">
            {(contractorsQuery.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">Хариуцагч алга.</p>
            ) : (
              (contractorsQuery.data ?? []).map((ac) => (
                <div key={ac.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <Link href={`/contractors/${ac.contractor.id}`} className="min-w-0">
                    <div className="truncate text-sm font-medium">{ac.contractor.name}</div>
                    {ac.contractor.tradeSpecialty && (
                      <div className="text-muted-foreground truncate text-xs">{ac.contractor.tradeSpecialty}</div>
                    )}
                  </Link>
                  {isDirector && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => unassign.mutate(ac.contractor.id)}
                      aria-label="Цуцлах"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
