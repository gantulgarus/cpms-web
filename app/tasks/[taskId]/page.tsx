"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AddDependencyDialog } from "@/components/dialogs/add-dependency-dialog";
import { EnumSelect } from "@/components/enum-select";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { ReviewStateBadge, ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  dependencies as dependenciesApi,
  progress as progressApi,
  tasks,
  type Dependency,
  type WorkStatus,
} from "@/lib/api";
import { approvalActionOf, buildActionRemarks, deriveReview, stripTag } from "@/lib/approval";
import {
  DEPENDENCY_TYPE,
  REVIEW_STATE,
  WORK_STATUS,
  WORK_STATUS_OPTIONS,
  formatDateTime,
  formatDays,
} from "@/lib/domain";
import { useRole } from "@/lib/role";

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isDirector } = useRole();

  const taskQuery = useQuery({ queryKey: ["task", taskId], queryFn: () => tasks.get(taskId) });
  const depsQuery = useQuery({
    queryKey: ["dependencies", taskId],
    queryFn: async () => {
      const deps = await tasks.dependencies(taskId);
      const ids = [
        ...deps.predecessors.map((d) => d.predecessorTaskId),
        ...deps.successors.map((d) => d.successorTaskId),
      ];
      const names = new Map<string, string>();
      await Promise.all(
        [...new Set(ids)].map((id) =>
          tasks
            .get(id)
            .then((t) => names.set(id, t.name))
            .catch(() => names.set(id, id.slice(0, 8))),
        ),
      );
      return { deps, names };
    },
  });
  const progressQuery = useQuery({ queryKey: ["progress", taskId], queryFn: () => tasks.progress(taskId) });

  const [pct, setPct] = useState("");
  const [remarks, setRemarks] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["progress", taskId] });
  };

  const updateStatus = useMutation({
    mutationFn: (status: WorkStatus) => tasks.update(taskId, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task", taskId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const removeTask = useMutation({
    mutationFn: () => tasks.remove(taskId),
    onSuccess: () => {
      toast.success("Даалгавар устгагдлаа");
      const activityId = taskQuery.data?.activityId;
      router.push(activityId ? `/activities/${activityId}` : "/");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeDep = useMutation({
    mutationFn: (id: string) => dependenciesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dependencies", taskId] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addProgress = useMutation({
    mutationFn: () => tasks.addProgress(taskId, { progressPercentage: Number(pct), remarks: remarks.trim() || undefined }),
    onSuccess: () => {
      toast.success("Явц илгээгдлээ");
      setPct("");
      setRemarks("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reviewAction = useMutation({
    mutationFn: (action: "approved" | "returned") =>
      tasks.addProgress(taskId, {
        progressPercentage: review.percentage ?? 0,
        remarks: buildActionRemarks(action, reviewNote),
      }),
    onSuccess: (_d, action) => {
      toast.success(action === "approved" ? "Батлагдлаа" : "Буцаагдлаа");
      setReviewNote("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeProgress = useMutation({
    mutationFn: (id: string) => progressApi.remove(id),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const task = taskQuery.data;
  const review = deriveReview(progressQuery.data ?? []);
  const nameFor = (id: string) => depsQuery.data?.names.get(id) ?? id.slice(0, 8);

  if (taskQuery.isLoading) return <LoadingRows />;
  if (taskQuery.error) return <ErrorState message={(taskQuery.error as Error).message} onRetry={() => taskQuery.refetch()} />;
  if (!task) return null;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {task.name}
            {review.percentage != null && (
              <ToneBadge tone={review.percentage >= 100 ? "green" : "blue"}>{review.percentage}% гүйцэтгэл</ToneBadge>
            )}
            <ReviewStateBadge state={review.state} />
          </span>
        }
        crumbs={[
          { label: "Төслүүд", href: "/" },
          { label: "Үйл ажиллагаа", href: `/activities/${task.activityId}` },
          { label: task.name },
        ]}
        actions={
          isDirector && (
            <Button
              variant="outline"
              onClick={() => {
                if (confirm("Даалгаврыг устгах уу?")) removeTask.mutate();
              }}
            >
              <Trash2 className="size-4" /> Устгах
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 pt-6 text-sm sm:grid-cols-3">
              <Detail label="Үргэлжлэх" value={formatDays(task.durationDays)} />
              <Detail label="Төлөвлөсөн эхлэл" value={task.plannedStartDate} />
              <Detail label="Төлөвлөсөн төгсгөл" value={task.plannedEndDate} />
              {isDirector && (
                <div className="col-span-2 sm:col-span-3">
                  <Label className="text-muted-foreground mb-1 text-xs">Төлөв</Label>
                  <EnumSelect
                    value={task.status}
                    onChange={(v: WorkStatus) => updateStatus.mutate(v)}
                    options={WORK_STATUS_OPTIONS.map((v) => ({ value: v, label: WORK_STATUS[v].label }))}
                    className="max-w-xs"
                  />
                </div>
              )}
              {task.description && (
                <div className="col-span-2 sm:col-span-3">
                  <div className="text-muted-foreground text-xs">Тайлбар</div>
                  <div>{task.description}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <DependencyCard
              title="Өмнөх (Predecessors)"
              deps={depsQuery.data?.deps.predecessors ?? []}
              otherId={(d) => d.predecessorTaskId}
              nameFor={nameFor}
              canEdit={isDirector}
              onRemove={(id) => removeDep.mutate(id)}
              action={isDirector && <AddDependencyDialog taskId={taskId} />}
            />
            <DependencyCard
              title="Дараах (Successors)"
              deps={depsQuery.data?.deps.successors ?? []}
              otherId={(d) => d.successorTaskId}
              nameFor={nameFor}
              canEdit={false}
            />
          </div>
        </div>

        <div className="space-y-6">
          {isDirector ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Баталгаажуулалт</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {review.state === "none" ? (
                  <p className="text-muted-foreground text-sm">Гүйцэтгэгч одоогоор явц оруулаагүй.</p>
                ) : (
                  <>
                    <p className="text-muted-foreground text-sm">
                      Сүүлд мэдээлсэн: {review.percentage}% · {REVIEW_STATE[review.state].label}
                    </p>
                    <Textarea
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="Тайлбар (заавал биш)"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button className="flex-1" disabled={reviewAction.isPending} onClick={() => reviewAction.mutate("approved")}>
                        Батлах
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        disabled={reviewAction.isPending}
                        onClick={() => reviewAction.mutate("returned")}
                      >
                        Буцаах
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Гүйцэтгэл бүртгэх</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>
                    Гүйцэтгэл (%) <span className="text-destructive">*</span>
                  </Label>
                  <Input type="number" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="0–100" />
                </div>
                <div className="space-y-1.5">
                  <Label>Тайлбар</Label>
                  <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
                </div>
                <Button className="w-full" disabled={!pct.trim() || addProgress.isPending} onClick={() => addProgress.mutate()}>
                  Явц илгээх
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Явцын түүх</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!progressQuery.data || progressQuery.data.length === 0 ? (
                <p className="text-muted-foreground text-sm">Явц бүртгэгдээгүй.</p>
              ) : (
                progressQuery.data.map((p) => {
                  const action = approvalActionOf(p.remarks);
                  return (
                    <div key={p.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {action
                            ? action === "approved"
                              ? "✓ Захирал баталлаа"
                              : "↩ Захирал буцаалаа"
                            : `${p.progressPercentage}%`}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {(action ? stripTag(p.remarks) : p.remarks) || ""}{" "}
                          <span className="opacity-70">· {formatDateTime(p.recordedAt ?? p.createdAt)}</span>
                        </div>
                      </div>
                      {isDirector && (
                        <button
                          type="button"
                          onClick={() => removeProgress.mutate(p.id)}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          aria-label="Устгах"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
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

function DependencyCard({
  title,
  deps,
  otherId,
  nameFor,
  canEdit,
  onRemove,
  action,
}: {
  title: string;
  deps: Dependency[];
  otherId: (d: Dependency) => string;
  nameFor: (id: string) => string;
  canEdit: boolean;
  onRemove?: (id: string) => void;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="space-y-2">
        {deps.length === 0 ? (
          <p className="text-muted-foreground text-sm">Алга.</p>
        ) : (
          deps.map((d) => {
            const id = otherId(d);
            return (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
                <Link href={`/tasks/${id}`} className="min-w-0">
                  <div className="truncate text-sm font-medium">{nameFor(id)}</div>
                  <div className="text-muted-foreground text-xs">
                    {DEPENDENCY_TYPE[d.dependencyType].full}
                    {d.lagDays ? ` · +${d.lagDays}d` : ""}
                  </div>
                </Link>
                <div className="flex items-center gap-1">
                  <ToneBadge tone="gray">{d.dependencyType}</ToneBadge>
                  {canEdit && onRemove && (
                    <button
                      type="button"
                      onClick={() => onRemove(d.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Устгах"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
