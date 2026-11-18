"use client";

import Link from "next/link";
import type { WorkCatalogEntry, WorkItem } from "@/lib/api/types";
import { formatDate, todayInProjectZone } from "@/lib/domain";
import { executionState, type WorkExecutionPlan } from "@/lib/work-execution";

function day(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value.slice(0, 10));
  return Number.isFinite(parsed) ? parsed : null;
}

export function WorkPlanTimeline({ works, allWorks, execution, catalog }: {
  works: WorkItem[];
  allWorks: WorkItem[];
  execution: WorkExecutionPlan;
  catalog: Map<string, WorkCatalogEntry>;
}) {
  const today = day(todayInProjectZone())!;
  const byId = new Map(allWorks.map((work) => [work.id, work]));
  const values = works.flatMap((work) => [day(work.plannedStartDate), day(work.plannedEndDate), day(work.actualStartDate), day(work.actualEndDate)]).filter((value): value is number => value !== null);
  if (works.some((work) => work.actualStartDate && !work.actualEndDate)) values.push(today);
  const first = values.length ? Math.min(...values) : today;
  const last = values.length ? Math.max(...values) : today;
  const span = Math.max(last - first + 86400000, 86400000);

  function bar(startValue?: string | null, endValue?: string | null) {
    const start = day(startValue);
    const end = day(endValue);
    if (start === null || end === null || end < start) return null;
    return { left: `${((start - first) / span) * 100}%`, width: `${Math.max(0.5, ((end - start + 86400000) / span) * 100)}%` };
  }

  return <div className="overflow-x-auto rounded-xl border bg-card">
    <div className="min-w-[850px] p-4">
      <div className="mb-3 flex flex-wrap gap-4 text-xs"><span className="flex items-center gap-2"><span className="h-2 w-6 rounded bg-blue-500" />Төлөвлөсөн</span><span className="flex items-center gap-2"><span className="h-2 w-6 rounded bg-emerald-500" />Бодит · Дуусаагүй бол өнөөдөр хүртэл</span></div>
      <div className="grid grid-cols-[280px_minmax(500px,1fr)] gap-4 border-b pb-2 text-xs"><span>Ажил / Өмнөх ажлууд</span><div className="flex justify-between"><span>{new Date(first).toISOString().slice(0, 10)}</span><span>{new Date(last).toISOString().slice(0, 10)}</span></div></div>
      {works.map((work) => {
        const previous = (execution.predecessors[work.id] ?? []).map((id) => byId.get(id)).filter((item): item is WorkItem => Boolean(item));
        const planned = bar(work.plannedStartDate, work.plannedEndDate);
        const actual = bar(work.actualStartDate, work.actualEndDate || todayInProjectZone());
        return <div key={work.id} className="grid grid-cols-[280px_minmax(500px,1fr)] gap-4 border-b py-3 last:border-0">
          <div className="space-y-1 text-xs">
            <Link href={`/work-items/${work.id}`} className="font-medium hover:underline">{catalog.get(work.workTypeId)?.systemCode || work.code} · {work.workType.name}</Link>
            <p className="text-muted-foreground">{work.location.path}</p>
            <p>{executionState(work, previous)}</p>
            {previous.map((item) => <Link key={item.id} className="text-muted-foreground block hover:underline" href={`/work-items/${item.id}`}>← {catalog.get(item.workTypeId)?.systemCode || item.code} · {item.workType.name} · {item.location.path}</Link>)}
          </div>
          <div className="space-y-2 pt-1">
            <div className="relative h-5 rounded bg-muted/40">{planned ? <div className="absolute h-5 rounded bg-blue-500" style={planned} title={`${formatDate(work.plannedStartDate)} — ${formatDate(work.plannedEndDate)}`} /> : <span className="text-muted-foreground px-2 text-xs">Хугацаа төлөвлөөгүй</span>}</div>
            <div className="relative h-5 rounded bg-muted/40">{actual && <div className="absolute h-5 rounded bg-emerald-500" style={actual} title={`${formatDate(work.actualStartDate)} — ${formatDate(work.actualEndDate || todayInProjectZone())}`} />}</div>
            <p className="text-muted-foreground text-xs">{formatDate(work.plannedStartDate)} — {formatDate(work.plannedEndDate)}</p>
          </div>
        </div>;
      })}
    </div>
  </div>;
}
