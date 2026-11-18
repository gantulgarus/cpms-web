"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { blocks, workItems } from "@/lib/api/endpoints";
import { loadAssignmentWork } from "@/lib/assignment-priority";
import { matchesWorkSearch, sortWorkPlan } from "@/lib/work-sequence";
import { formatDate } from "@/lib/domain";
import { useWorkCatalog } from "@/lib/api/use-work-catalog";
import { useMe } from "@/lib/api/use-me";
import type { WorkItem } from "@/lib/api/types";
import { ErrorState, EmptyState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/progress-bar";
import { WorkPlanDatesDialog } from "@/components/work-dates-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function WorkDependency({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: ["work-item", id],
    queryFn: () => workItems.get(id),
    staleTime: 30_000,
    enabled: open,
  });
  const work = detail.data;

  return (
    <details className="mt-2 text-xs font-normal" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer py-1 text-primary">Өмнөх ажлын хамаарал</summary>
      {open && (
        <div className="mt-1 rounded-md border bg-muted/30 p-2">
          {detail.isLoading ? <p>Хамаарал шалгаж байна…</p> : detail.error ? (
            <p role="alert">Хамаарлын мэдээлэл ирсэнгүй. <button className="underline" onClick={() => void detail.refetch()}>Дахин оролдох</button></p>
          ) : work && (
            <>
              {work.status === "completed" ? <p>Дууссан</p> : work.status === "cancelled" ? <p>Цуцлагдсан</p> : work.holdPointReason ? (
                <p className="text-amber-800 dark:text-amber-300">Өмнөх ажил хүлээж буй — {work.holdPointReason}</p>
              ) : <p>{work.holdPointReason === null ? "Өмнөх ажлын хориггүй." : "Хамаарлын мэдээлэл тохируулаагүй."}</p>}
              {work.plannedQty <= 0 && <p>Төлөвлөсөн тоо хэмжээ оруулаагүй.</p>}
              {work.status === "on_hold" && <p>Ажил түр зогссон.</p>}
            </>
          )}
        </div>
      )}
    </details>
  );
}

const PAGE_SIZE = 25;
const SELECT = "border-input bg-background h-10 w-full rounded-md border px-3 text-sm";

export function BlockWorkPlan({ blockId }: { blockId: string }) {
  const { me } = useMe();
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [floor, setFloor] = useState("");
  const [assignment, setAssignment] = useState("");
  const [page, setPage] = useState(1);
  const catalog = useWorkCatalog();
  const list = useQuery({
    queryKey: ["assignment-priority", blockId],
    queryFn: () => loadAssignmentWork((page) => workItems.listForBlock(blockId, { page, pageSize: 200, sort: "workCode" })),
  });
  const locations = useQuery({ queryKey: ["locations", blockId], queryFn: () => blocks.locations(blockId) });
  const rows = useMemo(
    () => sortWorkPlan(list.data ?? [], catalog.data?.data ?? [], locations.data?.data ?? []),
    [list.data, catalog.data, locations.data],
  );
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
    return matchesWorkSearch(work, search, catalog.byWorkTypeId.get(work.workTypeId));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const error = list.error || locations.error || catalog.error;

  if (list.isLoading || locations.isLoading || catalog.isLoading) return <LoadingRows rows={5} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => {
    void list.refetch();
    void locations.refetch();
    void catalog.refetch();
  }} />;

  return (
    <section className="space-y-4" aria-label="Ажлын төлөвлөгөө">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>
      <p className="text-muted-foreground text-sm" aria-live="polite">Нийт {rows.length} ажил · Шүүлтүүрт {filtered.length} · {current}/{pages} хуудас</p>
      {!shown.length ? <EmptyState title="Ажил олдсонгүй" description="Шүүлтүүр эсвэл хайлтаа өөрчилнө үү." /> : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead aria-sort="ascending">Ажлын код ↑</TableHead>
                <TableHead>Хийгдэх ажил</TableHead>
                <TableHead>Байршил</TableHead>
                <TableHead>Төлөвлөсөн хугацаа</TableHead>
                <TableHead>Бодит хугацаа</TableHead>
                <TableHead>Гүйцэтгэгч</TableHead>
                <TableHead>Батлагдсан явц</TableHead>
                {me?.canEditPlan && <TableHead><span className="sr-only">Хугацаа төлөвлөх</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((work) => {
                const entry = catalog.byWorkTypeId.get(work.workTypeId);
                return (
                  <TableRow key={work.id}>
                    <TableCell className="align-top font-mono text-xs">{entry?.systemCode || work.code || "—"}</TableCell>
                    <TableCell className="min-w-64 max-w-sm whitespace-normal align-top">
                      <Link href={`/work-items/${work.id}`} className="font-medium hover:underline">{work.workType.name}</Link>
                      <p className="text-muted-foreground mt-1 text-xs">{work.workType.groupName}{entry && ` · Дэд бүлэг ${entry.subgroupNumber} · ${entry.typeName}`}</p>
                      <WorkDependency id={work.id} />
                    </TableCell>
                    <TableCell className="min-w-40 whitespace-normal align-top">{work.location.path}</TableCell>
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
      {editing && <WorkPlanDatesDialog item={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
