"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DeadlineExtensionAction } from "@/components/deadline-extension-action";
import { PageHeader } from "@/components/page-header";
import { NoProjectState } from "@/components/no-project-state";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { DashboardCount } from "@/components/dashboard-count";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { blocks, extensions, myWork } from "@/lib/api/endpoints";
import type { ReportingState } from "@/lib/api/types";
import { useMe } from "@/lib/api/use-me";
import { useProject } from "@/lib/api/use-project";
import { formatDate, formatQty } from "@/lib/domain";
import { cn } from "@/lib/utils";

const TABS: { value: ReportingState; label: string }[] = [
  { value: "ready", label: "Оруулах боломжтой" },
  { value: "blocked", label: "Хүлээгдэж буй" },
  { value: "pending", label: "Шалгалтад илгээсэн" },
  { value: "completed", label: "Дууссан" },
];
const PAGE_SIZE = 50;
const SELECT_STYLE = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

export function MyWorkList({ blockId }: { blockId?: string }) {
  const { me, isLoading: meLoading } = useMe();
  const { project, isLoading, error } = useProject();
  const block = useQuery({
    queryKey: ["block", blockId],
    queryFn: () => blocks.get(blockId!),
    enabled: Boolean(blockId && me?.canReportProgress),
  });
  if (meLoading || isLoading || (blockId && block.isLoading)) return <LoadingRows rows={4} />;
  if (!me?.canReportProgress) return <EmptyState title="Гүйцэтгэл бүртгэх эрхгүй" description="Энэ хэсэг нь гүйцэтгэл мэдээлэх эрхтэй хэрэглэгчдэд зориулагдсан." />;
  if (error || block.error) return <ErrorState message={((error || block.error) as Error).message} />;
  if (!project && !block.data) return <NoProjectState />;
  const projectId = block.data?.projectId ?? project!.id;
  return <MyWorkContent key={`${projectId}:${blockId ?? "all"}`} projectId={projectId} fixedBlockId={blockId} title={block.data?.name ?? project!.name} />;
}

function MyWorkContent({ projectId, fixedBlockId, title }: { projectId: string; fixedBlockId?: string; title: string }) {
  const { me } = useMe();
  const [state, setState] = useState<ReportingState>("ready");
  const [blockId, setBlockId] = useState(fixedBlockId ?? "");
  const [floorId, setFloorId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [page, setPage] = useState(1);
  const blockList = useQuery({ queryKey: ["blocks", projectId], queryFn: () => blocks.listForProject(projectId) });
  const locations = useQuery({
    queryKey: ["locations", blockId],
    queryFn: () => blocks.locations(blockId),
    enabled: Boolean(blockId),
  });
  const list = useQuery({
    queryKey: ["work-items", "my-work", projectId, state, blockId, floorId, unitId, search, page],
    queryFn: () => myWork.list(projectId, {
      reportingState: state, blockId: blockId || undefined,
      locationId: unitId || floorId || undefined, includeDescendants: Boolean(unitId || floorId),
      search: search || undefined, page, pageSize: PAGE_SIZE,
    }),
  });
  const pendingExtensions = useQuery({
    queryKey: ["extensions", projectId, "pending"],
    queryFn: () => extensions.list(projectId, "pending"),
    enabled: (list.data?.data ?? []).some((w) => w.overdueDays > 0 && w.status !== "completed"),
    refetchInterval: 60_000,
  });
  const extensionByWork = new Map((pendingExtensions.data ?? []).map((request) => [request.workItemId, request]));
  const rows = list.data?.data ?? [];
  const count = list.isError ? undefined : list.data?.counts;
  const floors = locations.data?.data.filter((l) => l.level === "floor") ?? [];
  const locationMap = new Map((locations.data?.data ?? []).map((l) => [l.id, l]));
  const units = locations.data?.data.filter((l) => {
    if (l.level !== "unit" || !floorId) return false;
    let parent = l.parentId;
    const visited = new Set<string>();
    while (parent && !visited.has(parent)) {
      if (parent === floorId) return true;
      visited.add(parent);
      parent = locationMap.get(parent)?.parentId ?? null;
    }
    return false;
  }) ?? [];
  const total = list.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const detailHref = (id: string) => `/work-items/${id}?from=my-work${fixedBlockId ? `&blockId=${encodeURIComponent(fixedBlockId)}` : ""}`;

  return (
    <div>
      <PageHeader title={fixedBlockId ? `${title} · Миний ажлууд` : "Миний ажлууд"}
        description="Оруулах боломжтой ажлууд эхэлж харагдана. Хугацаа нь түрүүлж дуусах ажлыг дээр эрэмбэлсэн."
        crumbs={fixedBlockId ? [{ label: "Блокууд", href: "/blocks" }, { label: title }] : undefined} />
      <div className="mb-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs"><span>Барилга</span><select className={SELECT_STYLE} value={blockId} disabled={Boolean(fixedBlockId) || blockList.isLoading} onChange={(e) => { setBlockId(e.target.value); setFloorId(""); setUnitId(""); setPage(1); }}>
            <option value="">Бүх барилга</option>
            {fixedBlockId && !blockList.data?.data.some((b) => b.id === fixedBlockId) && <option value={fixedBlockId}>{title}</option>}
            {blockList.data?.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></label>
          <label className="space-y-1 text-xs"><span>Давхар</span><select className={SELECT_STYLE} value={floorId} disabled={!blockId || locations.isLoading || locations.isError} onChange={(e) => { setFloorId(e.target.value); setUnitId(""); setPage(1); }}>
            <option value="">{blockId ? "Бүх давхар" : "Эхлээд барилга сонгоно уу"}</option>
            {floors.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></label>
          <label className="space-y-1 text-xs"><span>Айл</span><select className={SELECT_STYLE} value={unitId} disabled={!floorId || locations.isLoading || locations.isError} onChange={(e) => { setUnitId(e.target.value); setPage(1); }}>
            <option value="">{floorId ? "Бүх айл" : "Эхлээд давхар сонгоно уу"}</option>
            {units.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></label>
        </div>
        {(blockList.error || locations.error) && <p role="alert" className="text-destructive text-sm">Барилга, байршлын сонголтыг авч чадсангүй. <button className="underline" onClick={() => { void blockList.refetch(); if (blockId) void locations.refetch(); }}>Дахин оролдох</button></p>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }}>
          <Input aria-label="Ажлын нэрээр хайх" placeholder="Ажлын нэрээр хайх…" maxLength={150} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
          <Button type="submit" variant="outline">Хайх</Button>
        </form>
        <nav aria-label="Гүйцэтгэл бүртгэх боломжийн шүүлтүүр" className="flex flex-wrap gap-2">
          {TABS.map((tab) => <button type="button" key={tab.value} aria-current={state === tab.value ? "page" : undefined} onClick={() => { setState(tab.value); setPage(1); }} className={cn("rounded-lg border px-3 py-2 text-sm", state === tab.value ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground hover:bg-accent")}>
            {tab.label} <span className="ml-1"><DashboardCount value={count?.[tab.value]} loading={list.isLoading} /></span>
          </button>)}
        </nav>
      </div>

      {list.isLoading ? <LoadingRows rows={5} /> : list.error ? <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} /> : rows.length === 0 ? (
        <EmptyState title={state === "ready" ? "Одоогоор гүйцэтгэл оруулах боломжтой ажил алга" : "Энэ төлөвтэй ажил алга"}
          description={state === "ready" ? "Хүлээгдэж буй хэсгээс хаалтын шалтгааныг, шалгалтад илгээсэн хэсгээс инженерийн батлалт хүлээж буй ажлыг харна уу. Барилга, давхар, айл болон хайлтаа мөн шалгана уу." : "Шүүлтүүрээ өөрчлөх эсвэл өөр төлөв сонгоно уу."}
          action={state === "ready" ? <Button variant="outline" onClick={() => { setState("blocked"); setPage(1); }}>Хүлээлтийн шалтгааныг харах</Button> : undefined} />
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">Нийт {total.toLocaleString("mn-MN")} ажил · {page}/{pages} хуудас</p>
          {rows.map((item) => <article key={item.id} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><Link href={detailHref(item.id)} className="font-medium hover:underline">{item.workType.name}</Link><p className="text-muted-foreground mt-1 text-xs">{item.blockName} · {item.location.path}</p></div>
              <span className="text-muted-foreground text-xs">Дуусах: {formatDate(item.plannedEndDate)}{item.overdueDays > 0 && <span className="text-destructive ml-2">{item.overdueDays} хоног хоцорсон</span>}</span>
            </div>
            {item.reportingState === "ready" && item.reportableQty > 0 ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Оруулах боломжтой: <strong className="tabular-nums">{formatQty(item.reportableQty, item.unit)}</strong></p><Button nativeButton={false} render={<Link href={`${detailHref(item.id)}#report-progress`} />}>Гүйцэтгэл оруулах</Button></div> : <div className="space-y-2"><p className="text-sm">{item.reportingReason ?? "Оруулах боломжийн мэдээллийг дахин шалгана уу."}</p>{item.blockingWorkItems.map((w) => <Link key={w.id} href={detailHref(w.id)} className="text-primary block text-xs hover:underline">Өмнөх ажлыг харах: {w.name} · {w.locationPath} →</Link>)}</div>}
            <DeadlineExtensionAction
              item={item}
              canRequest={Boolean(me?.canReportProgress || me?.canEditPlan)}
              canApprove={Boolean(me?.canApproveExtensions)}
              pending={extensionByWork.get(item.id)}
              loading={pendingExtensions.isPending || pendingExtensions.isFetching}
              error={pendingExtensions.isError}
              onRetry={() => { void pendingExtensions.refetch(); }}
            />
          </article>)}
          <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={page <= 1 || list.isFetching} onClick={() => setPage((p) => p - 1)}>Өмнөх</Button><span className="text-sm tabular-nums">{page}/{pages}</span><Button variant="outline" disabled={page >= pages || list.isFetching} onClick={() => setPage((p) => p + 1)}>Дараах</Button></div>
        </div>
      )}
    </div>
  );
}
