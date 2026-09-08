"use client";

/**
 * Schedule tab — CPM results for the project (header/tabs come from the layout).
 *
 * The table answers the two questions a director actually has: when does this
 * run, and how much can it slip. ES/EF/LS/LF are the intermediate steps of the
 * forward/backward pass, so they live in a collapsed section rather than in the
 * main table. When the project has a start date the day offsets are shown as
 * real calendar dates.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { projects, type ScheduleTaskEntry } from "@/lib/api";
import { addDays, formatShortDate } from "@/lib/domain";

export default function SchedulePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["schedule", projectId],
    queryFn: () => projects.schedule(projectId),
  });
  // Already in cache from the layout; used only for the start date.
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const recalc = useMutation({
    mutationFn: () => projects.recalculateSchedule(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule", projectId] });
      toast.success("Хуваарь дахин тооцоологдлоо");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const schedule = query.data;
  const total = schedule?.projectDurationDays ?? 0;
  const startDate = projectQuery.data?.startDate ?? null;

  /** Day offset → calendar date, or the raw offset when no start date is set. */
  const dayLabel = (offset: number) => {
    const label = formatShortDate(addDays(startDate, offset));
    return label ?? `${offset} дэх хоног`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Даалгаврын үргэлжлэх хугацаа ба хоорондын хамааралд тулгуурлан хэзээ эхлэх, дуусахыг
          бодно. <span className="text-foreground">Нөөц</span> нь тухайн ажлыг төслийг
          хойшлуулалгүйгээр хэдэн хоног хойшлуулж болохыг заана.
        </p>
        <Button variant="outline" onClick={() => recalc.mutate()} disabled={recalc.isPending}>
          <RefreshCw className="size-4" /> Дахин тооцоолох
        </Button>
      </div>

      {query.isLoading ? (
        <LoadingRows />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : !schedule || schedule.tasks.length === 0 ? (
        <EmptyState
          title="Тооцоолох өгөгдөл алга"
          description="Даалгавруудад үргэлжлэх хугацаа болон хамаарал нэмсний дараа хуваарь бодогдоно."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Нийт хугацаа" value={`${schedule.projectDurationDays} хоног`} />
            <Stat
              label="Хойшлуулж болохгүй"
              value={String(schedule.tasks.filter((t) => t.isCritical).length)}
            />
            <Stat label="Нийт даалгавар" value={String(schedule.tasks.length)} />
          </div>

          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Даалгавар</TableHead>
                  <TableHead className="text-right">Хугацаа</TableHead>
                  <TableHead>Эхлэх</TableHead>
                  <TableHead>Дуусах</TableHead>
                  <TableHead>Нөөц</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.tasks.map((t) => (
                  <TableRow key={t.taskId}>
                    <TableCell className="font-medium">{t.taskName}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.durationDays} хоног</TableCell>
                    <TableCell className="text-muted-foreground">
                      {dayLabel(t.earliestStart)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dayLabel(t.earliestFinish)}
                    </TableCell>
                    <TableCell>
                      {t.isCritical ? (
                        <ToneBadge tone="red">Хойшлуулж болохгүй</ToneBadge>
                      ) : (
                        <span className="text-muted-foreground tabular-nums">
                          {t.slack} хоног хүлцэнэ
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <CardContent className="space-y-2 pt-6">
              <div className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span>Хугацааны зурвас</span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-red-500" /> хойшлуулж болохгүй
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-blue-500" /> нөөцтэй
                </span>
              </div>
              {schedule.tasks.map((t) => (
                <GanttRow key={t.taskId} entry={t} total={total} dayLabel={dayLabel} />
              ))}
            </CardContent>
          </Card>

          <details className="rounded-xl border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">
              Дэлгэрэнгүй тооцоо (ES / EF / LS / LF)
            </summary>
            <p className="text-muted-foreground mt-3 text-sm">
              Тоонууд нь төслийн эхлэлээс хойших хоногийн дугаар. Эрт эхлэх/дуусах нь бүх зүйл
              төлөвлөсний дагуу явбал хамгийн эрт хэзээ болохыг, орой эхлэх/дуусах нь төслийг
              хойшлуулахгүйгээр хамгийн орой хэзээ болохыг заана. Нөөц = орой эхлэх − эрт эхлэх.
            </p>
            <div className="mt-3 -mx-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Даалгавар</TableHead>
                    <TableHead className="text-right">Эрт эхлэх</TableHead>
                    <TableHead className="text-right">Эрт дуусах</TableHead>
                    <TableHead className="text-right">Орой эхлэх</TableHead>
                    <TableHead className="text-right">Орой дуусах</TableHead>
                    <TableHead className="text-right">Нөөц</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.tasks.map((t) => (
                    <TableRow key={t.taskId}>
                      <TableCell className="font-medium">{t.taskName}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.earliestStart}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.earliestFinish}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.latestStart}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.latestFinish}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.slack}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
        <div className="text-muted-foreground text-sm">{label}</div>
      </CardContent>
    </Card>
  );
}

function GanttRow({
  entry,
  total,
  dayLabel,
}: {
  entry: ScheduleTaskEntry;
  total: number;
  dayLabel: (offset: number) => string;
}) {
  const span = Math.max(total, 1);
  const left = (entry.earliestStart / span) * 100;
  const width = (Math.max(entry.earliestFinish - entry.earliestStart, 0.1) / span) * 100;
  return (
    <div className="flex items-center gap-3">
      <div
        className="text-muted-foreground w-24 shrink-0 truncate text-sm sm:w-40"
        title={entry.taskName}
      >
        {entry.taskName}
      </div>
      <div className="bg-muted relative h-4 flex-1 overflow-hidden rounded">
        <div
          className={`absolute top-0 bottom-0 rounded ${entry.isCritical ? "bg-red-500" : "bg-blue-500"}`}
          style={{ left: `${left}%`, width: `${width}%`, minWidth: 3 }}
          title={`${dayLabel(entry.earliestStart)} — ${dayLabel(entry.earliestFinish)}`}
        />
      </div>
      <div className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
        {entry.durationDays} хон.
      </div>
    </div>
  );
}
