"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { blocks, referenceData, workItems } from "@/lib/api/endpoints";
import { loadAssignmentWork } from "@/lib/assignment-priority";
import { sortWorkSequence } from "@/lib/work-sequence";
import { formatDate } from "@/lib/domain";
import { ErrorState, EmptyState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/progress-bar";

function WorkDependency({ id }: { id: string }) {
  const detail = useQuery({ queryKey: ["work-item", id], queryFn: () => workItems.get(id), staleTime: 30_000 });
  if (detail.isLoading) return <p className="text-muted-foreground text-sm">Хамаарал шалгаж байна…</p>;
  if (detail.error) return <p role="alert" className="text-sm">Хамаарлын мэдээлэл ирсэнгүй. <button className="underline" onClick={() => void detail.refetch()}>Дахин оролдох</button></p>;
  const work = detail.data;
  if (!work) return null;
  if (work.status === "completed") return <p className="text-sm text-emerald-700 dark:text-emerald-400">Дууссан</p>;
  if (work.status === "cancelled") return <p className="text-muted-foreground text-sm">Цуцлагдсан</p>;
  if (work.holdPointReason) return <p className="rounded-md bg-amber-500/10 p-2 text-sm text-amber-800 dark:text-amber-300">Өмнөх ажил хүлээж буй: {work.holdPointReason}</p>;
  return <p className="text-muted-foreground text-sm">{work.holdPointReason === null ? "Өмнөх ажлын хориггүй. Эхлэх хугацаа, бэлтгэлээ шалгана уу." : "Сервер хамаарлын мэдээлэл өгөөгүй."}{work.plannedQty <= 0 && " Төлөвлөсөн тоо хэмжээ оруулаагүй."}{work.status === "on_hold" && " Ажил түр зогссон."}</p>;
}

const PAGE_SIZE = 25;
const SELECT = "border-input bg-background h-10 w-full rounded-md border px-3 text-sm";

export function BlockWorkSequence({ blockId }: { blockId: string }) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [floor, setFloor] = useState("");
  const [assignment, setAssignment] = useState("");
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["assignment-priority", blockId], queryFn: () => loadAssignmentWork((page) => workItems.listForBlock(blockId, { page, pageSize: 200 })) });
  const groups = useQuery({ queryKey: ["work-type-groups"], queryFn: () => referenceData.groups() });
  const locations = useQuery({ queryKey: ["locations", blockId], queryFn: () => blocks.locations(blockId) });
  const rows = useMemo(() => sortWorkSequence(list.data ?? [], groups.data?.data ?? [], locations.data?.data ?? []), [list.data, groups.data, locations.data]);
  const groupNames = [...new Set(rows.map((w) => w.workType.groupName))];
  const ranks = new Map((groups.data?.data ?? []).map((g) => [g.name, g.sequenceNumber]));
  const locationMap = new Map((locations.data?.data ?? []).map((l) => [l.id, l]));
  const filtered = rows.filter((w) => {
    if (group && group !== w.workType.groupName) return false;
    if (assignment === "missing" && w.contractor) return false;
    if (assignment === "assigned" && !w.contractor) return false;
    if (floor) {
      let id: string | null | undefined = w.locationId;
      const visited = new Set<string>();
      while (id && id !== floor && !visited.has(id)) { visited.add(id); id = locationMap.get(id)?.parentId; }
      if (id !== floor) return false;
    }
    return `${w.workType.name} ${w.location.path} ${w.contractor?.name ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const error = list.error || groups.error || locations.error;
  return <section className="space-y-4" aria-labelledby="work-sequence-heading">
    <div><h2 id="work-sequence-heading" className="text-lg font-semibold">Ажлын технологийн дараалал</h2>
      <p className="text-muted-foreground mt-1 text-sm">Лавлах сангийн ажлын бүлгийн дарааллаар, бүлэг дотроо давхрын дарааллаар харуулав. Гүйцэтгэгчтэй болон гүйцэтгэгчгүй бүх ажил багтана. Нэг бүлэг доторх ажлууд заавал нэг нэгнийхээ дараа хийгдэхийг энэ жагсаалт илэрхийлэхгүй.</p></div>
    {list.isLoading || groups.isLoading || locations.isLoading ? <LoadingRows rows={5} /> : error ? <ErrorState message={(error as Error).message} onRetry={() => { void list.refetch(); void groups.refetch(); void locations.refetch(); }} /> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm"><span>Ажил, байршил, гүйцэтгэгч хайх</span><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Ажлын нэр…" /></label>
        <label className="space-y-1 text-sm"><span>Ажлын бүлэг</span><select className={SELECT} value={group} onChange={(e) => { setGroup(e.target.value); setPage(1); }}><option value="">Бүх бүлэг</option>{groupNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>Давхар</span><select className={SELECT} value={floor} onChange={(e) => { setFloor(e.target.value); setPage(1); }}><option value="">Бүх байршил</option>{locations.data?.data.filter((l) => l.level === "floor").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>Гүйцэтгэгчийн оноолт</span><select className={SELECT} value={assignment} onChange={(e) => { setAssignment(e.target.value); setPage(1); }}><option value="">Бүх ажил</option><option value="missing">Гүйцэтгэгчгүй</option><option value="assigned">Гүйцэтгэгчтэй</option></select></label>
      </div>
      <p className="text-muted-foreground text-sm">Барилгын нийт {rows.length} ажил · Шүүлтүүрт {filtered.length} · {current}/{pages} хуудас</p>
      {groupNames.some((name) => !ranks.has(name)) && <p className="rounded-lg border p-3 text-sm">Дараалал тохируулаагүй бүлгүүд жагсаалтын сүүлд байна.</p>}
      {!shown.length ? <EmptyState title="Ажил олдсонгүй" description="Шүүлтүүр эсвэл хайлтаа өөрчилнө үү." /> : <div className="space-y-3">{shown.map((w, index) => <article key={w.id} className="space-y-3 rounded-xl border bg-card p-4">
        {(index === 0 || shown[index - 1].workType.groupName !== w.workType.groupName) && <h3 className="border-b pb-2 font-semibold">{w.workType.groupName}{!ranks.has(w.workType.groupName) && " · Дараалал тохируулаагүй"}</h3>}
        <div className="flex flex-wrap justify-between gap-3"><div><Link href={`/work-items/${w.id}`} className="font-medium hover:underline">{w.workType.name}</Link><p className="text-muted-foreground mt-1 text-sm">{w.location.path}</p></div>
          <p className="text-sm">Эхлэх: {w.plannedStartDate ? formatDate(w.plannedStartDate) : "Тохируулаагүй"}<br />Дуусах: {formatDate(w.plannedEndDate)}</p></div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>Гүйцэтгэгч: {w.contractor?.name ?? "Оноогоогүй"}</p><div className="flex items-center gap-2"><span>Батлагдсан явц</span><ProgressBar value={w.percentage} className="w-20" /><span>{w.percentage}%</span></div></div>
        <WorkDependency id={w.id} />
      </article>)}</div>}
      {pages > 1 && <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={current <= 1} onClick={() => setPage(current - 1)}>Өмнөх</Button><span className="text-sm">{current}/{pages}</span><Button variant="outline" disabled={current >= pages} onClick={() => setPage(current + 1)}>Дараах</Button></div>}
    </>}
  </section>;
}
