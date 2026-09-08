"use client";

/**
 * Project overview tab — "how is this project doing, and what needs me?"
 *
 * Deliberately answers only those two questions: the headline numbers, then the
 * tasks waiting on a director decision. The structure itself lives on the
 * "Ажлын бүтэц" tab, the dates on "Хуваарь".
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { workPackages } from "@/lib/api";
import { loadProjectReview } from "@/lib/review";

/** How many pending tasks to surface before linking out to the full list. */
const PENDING_PREVIEW = 6;

export default function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const reviewQuery = useQuery({
    queryKey: ["review", projectId],
    queryFn: () => loadProjectReview(projectId),
  });
  const wpQuery = useQuery({
    queryKey: ["workPackages", projectId],
    queryFn: () => workPackages.listForProject(projectId, { pageSize: 100 }),
  });

  const review = reviewQuery.data;

  // Flatten the contractor groups back to a per-task list of pending work. A
  // task can appear in several groups (shared activity), so dedupe by task id.
  const pending = new Map<string, { taskId: string; name: string; where: string; who: string }>();
  for (const group of review?.groups ?? []) {
    for (const entry of group.entries) {
      if (entry.review.state !== "pending" || pending.has(entry.task.id)) continue;
      pending.set(entry.task.id, {
        taskId: entry.task.id,
        name: entry.task.name,
        where: `${entry.workPackageName} › ${entry.activityName}`,
        who: group.contractor?.name ?? "Хариуцагчгүй",
      });
    }
  }
  const pendingList = [...pending.values()];

  if (reviewQuery.error)
    return (
      <ErrorState
        message={(reviewQuery.error as Error).message}
        onRetry={() => reviewQuery.refetch()}
      />
    );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Дундаж гүйцэтгэл"
          value={review ? `${review.avgPercentage}%` : "—"}
          loading={reviewQuery.isLoading}
        />
        <Stat
          label="Батлахыг хүлээж буй"
          value={review ? String(review.pendingCount) : "—"}
          loading={reviewQuery.isLoading}
        />
        <Stat
          label="Батлагдсан"
          value={review ? String(review.approvedCount) : "—"}
          loading={reviewQuery.isLoading}
        />
        <Stat
          label="Нийт даалгавар"
          value={review ? String(review.totalTasks) : "—"}
          hint={wpQuery.data ? `${wpQuery.data.data.length} ажлын багц` : undefined}
          loading={reviewQuery.isLoading}
        />
      </div>

      <Card className="p-0">
        <CardHeader className="flex-row items-center justify-between border-b">
          <CardTitle className="text-base">Батлахыг хүлээж буй даалгаврууд</CardTitle>
          <Link
            href={`/projects/${projectId}/review`}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
          >
            Бүгдийг харах <ArrowRight className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {reviewQuery.isLoading ? (
            <div className="p-4">
              <LoadingRows rows={3} />
            </div>
          ) : pendingList.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="size-6 text-emerald-600" />
              <p className="font-medium">Шийдвэр хүлээсэн даалгавар алга</p>
              <p className="text-muted-foreground text-sm">
                Гүйцэтгэгчид шинэ явц мэдээлмэгц энд харагдана.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {pendingList.slice(0, PENDING_PREVIEW).map((item) => (
                <li key={item.taskId}>
                  <Link
                    href={`/tasks/${item.taskId}`}
                    className="hover:bg-muted/50 flex items-center justify-between gap-3 px-4 py-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{item.name}</div>
                      <div className="text-muted-foreground truncate text-xs">{item.where}</div>
                    </div>
                    <div className="text-muted-foreground shrink-0 text-right text-xs">
                      {item.who}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {pendingList.length > PENDING_PREVIEW && (
            <div className="text-muted-foreground border-t px-4 py-2 text-xs">
              Бас {pendingList.length - PENDING_PREVIEW} даалгавар хүлээгдэж байна.
            </div>
          )}
        </CardContent>
      </Card>

      {!wpQuery.isLoading && wpQuery.data?.data.length === 0 && (
        <EmptyState
          title="Төслийн бүтэц хоосон байна"
          description="“Ажлын бүтэц” хэсэгт эхний ажлын багцаа нэмснээр даалгавар, хуваарь, гүйцэтгэл бүртгэх боломжтой болно."
          action={
            <Link
              href={`/projects/${projectId}/work-packages`}
              className="text-primary text-sm font-medium underline-offset-4 hover:underline"
            >
              Ажлын бүтэц рүү очих
            </Link>
          }
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-semibold tabular-nums">{loading ? "…" : value}</div>
        <div className="text-muted-foreground text-sm">{label}</div>
        {hint && <div className="text-muted-foreground/70 text-xs">{hint}</div>}
      </CardContent>
    </Card>
  );
}
