"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { blocks, workExecution, workItems } from "@/lib/api/endpoints";
import { loadAssignmentWork } from "@/lib/assignment-priority";
import { matchesWorkSearch, sortWorkPlan } from "@/lib/work-sequence";
import { formatDate } from "@/lib/domain";
import { useWorkCatalog } from "@/lib/api/use-work-catalog";
import { useMe } from "@/lib/api/use-me";
import { executionState, workHasFinished } from "@/lib/work-execution";
import { WorkDependencyDialog } from "@/components/work-dependency-dialog";
import { WorkPlanTimeline } from "@/components/work-plan-timeline";
import type { WorkCatalogEntry, WorkItem } from "@/lib/api/types";
import { ErrorState, EmptyState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/progress-bar";
import { WorkPlanDatesDialog } from "@/components/work-dates-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function WorkDependency({ work, previous, catalog, onEdit }: {
  work: WorkItem;
  previous: WorkItem[];
  catalog: Map<string, WorkCatalogEntry>;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const detail = useQuery({ queryKey: ["work-item", work.id], queryFn: () => workItems.get(work.id), staleTime: 30_000, enabled: open });
  const waiting = previous.filter((item) => !workHasFinished(item));
  return <div className="min-w-48 space-y-2 whitespace-normal text-xs">
    <p className="font-medium">{executionState(work, previous)}</p>
    {waiting.length > 0 && <p className="text-amber-700 dark:text-amber-400">{waiting.length} өмнөх ажил дуусаагүй</p>}
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-primary">Өмнөх ажлууд ({previous.length})</summary>
      <div className="mt-2 space-y-2 rounded border bg-muted/30 p-2">
        {previous.map((item) => <div key={item.id}><Link href={`/work-items/${item.id}`} className="font-medium hover:underline">{catalog.get(item.workTypeId)?.systemCode || item.code} · {item.workType.name}</Link><p>{item.location.path}</p><p className="text-muted-foreground">{workHasFinished(item) ? "Дууссан" : "Хүлээгдэж буй"}</p></div>)}
        {!previous.length && <p>Өмнөх ажил холбогоогүй.</p>}
        {detail.isLoading && <p>Шалгалтын цэг шалгаж байна…</p>}
        {detail.error && <p role="alert">Шалгалтын цэгийн мэдээлэл ирсэнгүй. <button className="underline" onClick={() => void detail.refetch()}>Дахин оролдох</button></p>}
        {detail.data?.holdPointReason && <p className="text-amber-700 dark:text-amber-400">{detail.data.holdPointReason}</p>}
      </div>
    </details>
    {onEdit && <Button variant="outline" size="sm" onClick={onEdit}>Хамаарал тохируулах</Button>}
  </div>;
}

const PAGE_SIZE = 25;
const SELECT = "border-input bg-background h-10 w-full rounded-md border px-3 text-sm";

export function BlockWorkPlan({ blockId }: { blockId: string }) {
  const { me } = useMe();
  const qc = useQueryClient();
  const [view, setView] = useState<"execution" | "code" | "timeline">("execution");
  const [dependencyEditing, setDependencyEditing] = useState<WorkItem | null>(null);
  const execution = useQuery({ queryKey: ["execution-plan", blockId], queryFn: () => workExecution.get(blockId) });
  const move = useMutation({
    mutationFn: (input: { workItemId: string; relativeToId: string; position: "before" | "after" }) => workExecution.move(blockId, { ...input, version: execution.data!.version }),
    onSuccess: (result) => qc.setQueryData(["execution-plan", blockId], result),
    onError: (error: Error) => { toast.error(error.message); void qc.invalidateQueries({ queryKey: ["execution-plan", blockId] }); },
  });
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [floor, setFloor] = useState("");
  const [assignment, setAssignment] = useState("");
  const [page, setPage] = useState(1);
  const [progress, setProgress] = useState("");
  const catalog = useWorkCatalog();
  const list = useQuery({
    queryKey: ["assignment-priority", blockId],
    queryFn: () => loadAssignmentWork((page) => workItems.listForBlock(blockId, { page, pageSize: 200, sort: "workCode" })),
  });
  const locations = useQuery({ queryKey: ["locations", blockId], queryFn: () => blocks.locations(blockId) });
  const codeRows = useMemo(
    () => sortWorkPlan(list.data ?? [], catalog.data?.data ?? [], locations.data?.data ?? []),
    [list.data, catalog.data, locations.data],
  );
  const ranks = new Map((execution.data?.order ?? []).map((id, index) => [id, index]));
  const rows = view === "code" ? codeRows : [...codeRows].sort((first, second) => (ranks.get(first.id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(second.id) ?? Number.MAX_SAFE_INTEGER));
  const workMap = new Map(rows.map((work) => [work.id, work]));
  const groupNames = [...new Set(rows.map((work) => work.workType.groupName))];
  const locationMap = new Map((locations.data?.data ?? []).map((location) => [location.id, location]));
  const filtered = rows.filter((work) => {
    if (group && group !== work.workType.groupName) return false;
    if (assignment === "missing" && work.contractor) return false;
    if (assignment === "assigned" && !work.contractor) return false;
    if (floor) {
      let locationId: string | null | undefined = work.locationId;
      const visited = new Set<string>();
      while (locationId && locationId !== floor && !visited.has(locationId)) {
        visited.add(locationId);
        locationId = locationMap.get(locationId)?.parentId;
      }
      if (locationId !== floor) return false;
    }
    if (progress) {
      const previous = (execution.data?.predecessors[work.id] ?? []).map((id) => workMap.get(id)).filter((item): item is WorkItem => Boolean(item));
      if (executionState(work, previous) !== progress) return false;
    }
    return matchesWorkSearch(work, search, catalog.byWorkTypeId.get(work.workTypeId));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const error = list.error || locations.error || catalog.error || execution.error;

  if (list.isLoading || locations.isLoading || catalog.isLoading || execution.isLoading) return <LoadingRows rows={5} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => {
    void list.refetch();
    void locations.refetch();
    void catalog.refetch();
    void execution.refetch();
  }} />;
  if (!execution.data || execution.data.order.length !== rows.length || execution.data.order.some((id) => !workMap.has(id))) {
    if (list.isFetching || execution.isFetching) return <LoadingRows rows={5} />;
    return <ErrorState message="Ажлын жагсаалт өөрчлөгдсөн байна. Төлөвлөгөөг дахин ачаална уу." onRetry={() => { void list.refetch(); void execution.refetch(); }} />;
  }

  return (
    <section className="space-y-4" aria-label="Ажлын төлөвлөгөө">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Төлөвлөгөөний харагдац">
        <Button variant={view === "execution" ? "secondary" : "outline"} aria-pressed={view === "execution"} onClick={() => { setView("execution"); setPage(1); }}>Гүйцэтгэх дараалал</Button>
        <Button variant={view === "code" ? "secondary" : "outline"} aria-pressed={view === "code"} onClick={() => { setView("code"); setPage(1); }}>Ажлын кодоор</Button>
        <Button variant={view === "timeline" ? "secondary" : "outline"} aria-pressed={view === "timeline"} onClick={() => { setView("timeline"); setPage(1); }}>Хугацааны график</Button>
      </div>
      {!execution.data.hasOrder && <p className="text-muted-foreground text-sm">Инженерийн дарааллыг дээш/доош зөөж тохируулна.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="space-y-1 text-sm">
          <span>Код, ажил, байршил, гүйцэтгэгч хайх</span>
          <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="WT-000024, цутгалт, А1…" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Ажлын бүлэг</span>
          <select className={SELECT} value={group} onChange={(event) => { setGroup(event.target.value); setPage(1); }}>
            <option value="">Бүх бүлэг</option>
            {groupNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Давхар</span>
          <select className={SELECT} value={floor} onChange={(event) => { setFloor(event.target.value); setPage(1); }}>
            <option value="">Бүх байршил</option>
            {locations.data?.data.filter((location) => location.level === "floor").map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Гүйцэтгэгчийн оноолт</span>
          <select className={SELECT} value={assignment} onChange={(event) => { setAssignment(event.target.value); setPage(1); }}>
            <option value="">Бүх ажил</option>
            <option value="missing">Гүйцэтгэгчгүй</option>
            <option value="assigned">Гүйцэтгэгчтэй</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Ажлын явц</span>
          <select className={SELECT} value={progress} onChange={(event) => { setProgress(event.target.value); setPage(1); }}>
            <option value="">Бүх явц</option>
            <option value="Хийгдэж байна">Хийгдэж байна</option>
            <option value="Өмнөх ажил хүлээж буй">Өмнөх ажил хүлээж буй</option>
            <option value="Дууссан">Дууссан</option>
            <option value="Түр зогссон">Түр зогссон</option>
          </select>
        </label>
      </div>
      <Button variant="ghost" size="sm" disabled={list.isFetching || execution.isFetching} onClick={() => { void list.refetch(); void execution.refetch(); }}>Явц шинэчлэх</Button>
      <p className="text-muted-foreground text-sm" aria-live="polite">Нийт {rows.length} ажил · Шүүлтүүрт {filtered.length} · {current}/{pages} хуудас</p>
      {!shown.length ? <EmptyState title="Ажил олдсонгүй" description="Шүүлтүүр эсвэл хайлтаа өөрчилнө үү." /> : view === "timeline" ? <WorkPlanTimeline works={shown} allWorks={rows} execution={execution.data} catalog={catalog.byWorkTypeId} /> : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {view === "execution" && <TableHead aria-sort="ascending">Дараалал</TableHead>}
                <TableHead aria-sort={view === "code" ? "ascending" : undefined}>Ажлын код{view === "code" && " ↑"}</TableHead>
                <TableHead>Хийгдэх ажил</TableHead>
                <TableHead>Байршил</TableHead>
                <TableHead>Хамаарал / Төлөв</TableHead>
                <TableHead>Төлөвлөсөн хугацаа</TableHead>
                <TableHead>Бодит хугацаа</TableHead>
                <TableHead>Гүйцэтгэгч</TableHead>
                <TableHead>Батлагдсан явц</TableHead>
                {me?.canEditPlan && <TableHead><span className="sr-only">Хугацаа төлөвлөх</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((work, index) => {
                const entry = catalog.byWorkTypeId.get(work.workTypeId);
                const previous = (execution.data.predecessors[work.id] ?? []).map((id) => workMap.get(id)).filter((item): item is WorkItem => Boolean(item));
                const visibleIndex = (current - 1) * PAGE_SIZE + index;
                const earlier = filtered[visibleIndex - 1];
                const later = filtered[visibleIndex + 1];
                return (
                  <TableRow key={work.id}>
                    {view === "execution" && <TableCell className="align-top"><span className="tabular-nums">{(ranks.get(work.id) ?? 0) + 1}</span>{me?.canEditPlan && <div className="mt-1 flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`${work.workType.name} · ${work.location.path} дээш зөөх`} disabled={!earlier || move.isPending} onClick={() => move.mutate({ workItemId: work.id, relativeToId: earlier.id, position: "before" })}><ArrowUp className="size-3.5" /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`${work.workType.name} · ${work.location.path} доош зөөх`} disabled={!later || move.isPending} onClick={() => move.mutate({ workItemId: work.id, relativeToId: later.id, position: "after" })}><ArrowDown className="size-3.5" /></Button>
                    </div>}</TableCell>}
                    <TableCell className="align-top font-mono text-xs">{entry?.systemCode || work.code || "—"}</TableCell>
                    <TableCell className="min-w-64 max-w-sm whitespace-normal align-top">
                      <Link href={`/work-items/${work.id}`} className="font-medium hover:underline">{work.workType.name}</Link>
                      <p className="text-muted-foreground mt-1 text-xs">{work.workType.groupName}{entry && ` · Дэд бүлэг ${entry.subgroupNumber} · ${entry.typeName}`}</p>
                    </TableCell>
                    <TableCell className="min-w-40 whitespace-normal align-top">{work.location.path}</TableCell>
                    <TableCell className="align-top"><WorkDependency work={work} previous={previous} catalog={catalog.byWorkTypeId} onEdit={me?.canEditPlan ? () => setDependencyEditing(work) : undefined} /></TableCell>
                    <TableCell className="align-top">
                      <p>Эхлэх {formatDate(work.plannedStartDate)}</p>
                      <p>Дуусах {formatDate(work.plannedEndDate)}</p>
                      <p className="text-muted-foreground mt-1 text-xs">{work.scheduleManual ? "Гараар төлөвлөсөн" : "Автомат"}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <p>Эхэлсэн {formatDate(work.actualStartDate)}</p>
                      <p>Дууссан {formatDate(work.actualEndDate)}</p>
                      {work.completionDelayDays != null && work.completionDelayDays > 0 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{work.completionDelayDays} хоног хоцорсон</p>}
                    </TableCell>
                    <TableCell className="min-w-32 whitespace-normal align-top">{work.contractor?.name ?? "Оноогоогүй"}</TableCell>
                    <TableCell className="align-top">
                      <div className="flex items-center gap-2"><ProgressBar value={work.percentage} className="w-16" /><span>{work.percentage}%</span></div>
                    </TableCell>
                    {me?.canEditPlan && <TableCell className="align-top"><Button variant="outline" size="sm" onClick={() => setEditing(work)}>Хугацаа төлөвлөх</Button></TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {pages > 1 && <div className="flex items-center justify-end gap-3">
        <Button variant="outline" disabled={current <= 1} onClick={() => setPage(current - 1)}>Өмнөх</Button>
        <span className="text-sm">{current}/{pages}</span>
        <Button variant="outline" disabled={current >= pages} onClick={() => setPage(current + 1)}>Дараах</Button>
      </div>}
      {dependencyEditing && <WorkDependencyDialog item={dependencyEditing} works={rows} locations={locations.data?.data ?? []} execution={execution.data} catalog={catalog.byWorkTypeId} onClose={() => setDependencyEditing(null)} />}
      {editing && <WorkPlanDatesDialog item={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
