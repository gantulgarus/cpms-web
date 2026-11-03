"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { assignments, blocks, contractors, workItems } from "@/lib/api/endpoints";
import type { WorkItem } from "@/lib/api/types";
import { compareAssignmentStart, isUnassignedWork, loadAssignmentWork } from "@/lib/assignment-priority";
import { formatDate } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";

const PAGE_SIZE = 25;
const SELECT = "border-input bg-background h-10 w-full rounded-md border px-3 text-sm";

function Dependency({ id }: { id: string }) {
  const [enabled, setEnabled] = useState(false);
  const detail = useQuery({ queryKey: ["work-item", id], queryFn: () => workItems.get(id), enabled });
  if (!enabled) return <Button size="sm" variant="ghost" onClick={() => setEnabled(true)}>Хамаарал шалгах</Button>;
  if (detail.isLoading) return <p className="text-muted-foreground text-sm">Хамаарал шалгаж байна…</p>;
  if (detail.error) return <p role="alert" className="text-sm">Хамаарлыг авч чадсангүй. <button className="underline" onClick={() => void detail.refetch()}>Дахин оролдох</button></p>;
  return <p className="text-sm text-muted-foreground">{detail.data?.holdPointReason ?? "Серверээс өмнөх ажлын хориг мэдээлээгүй. Эхлэх хугацаа, бусад бэлтгэлээ мөн шалгана уу."}</p>;
}

export function PriorityContractorAssignment({ blockId }: { blockId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [floor, setFloor] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [person, setPerson] = useState("");
  const [review, setReview] = useState<WorkItem[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failures, setFailures] = useState<{ id: string; name: string; message: string }[]>([]);
  const list = useQuery({
    queryKey: ["assignment-priority", blockId],
    queryFn: () => loadAssignmentWork((page) => workItems.listForBlock(blockId, { page, pageSize: 200 })),
  });
  const companies = useQuery({ queryKey: ["contractors"], queryFn: () => contractors.list() });
  const locations = useQuery({ queryKey: ["locations", blockId], queryFn: () => blocks.locations(blockId) });
  const rows = useMemo(() => (list.data ?? []).filter(isUnassignedWork).sort(compareAssignmentStart), [list.data]);
  const groups = [...new Set(rows.map((w) => w.workType.groupName))];
  const locationMap = new Map((locations.data?.data ?? []).map((l) => [l.id, l]));
  function inFloor(item: WorkItem) {
    if (!floor) return true;
    let id: string | null | undefined = item.locationId;
    const visited = new Set<string>();
    while (id && !visited.has(id)) {
      if (id === floor) return true;
      visited.add(id);
      id = locationMap.get(id)?.parentId;
    }
    return false;
  }
  const visible = rows.filter((w) => (!group || w.workType.groupName === group) && inFloor(w)
    && `${w.workType.name} ${w.location.path}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const shown = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const chosen = rows.filter((w) => selected.includes(w.id));
  const people = (companies.data?.data ?? []).filter((c) => !c.status || c.status === "active");
  const target = people.find((c) => c.id === person);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());
  function resetReview() { setReview(null); setFailures([]); }

  async function save() {
    if (!review || !target || running) return;
    setRunning(true);
    setProgress(0);
    const failed: typeof failures = [];
    let saved = 0;
    for (const [index, item] of review.entries()) {
      try {
        // Recheck immediately before saving: another operator may have assigned this work.
        const fresh = await workItems.get(item.id);
        if (fresh.blockId !== blockId || !isUnassignedWork(fresh)) throw new Error("Ажлын төлөв эсвэл оноолт өөрчлөгдсөн. Дахин шалгана уу.");
        await assignments.assignOne(item.id, target.id);
        saved++;
      } catch (error) {
        failed.push({ id: item.id, name: `${item.workType.name} · ${item.location.path}`, message: error instanceof Error ? error.message : "Оноож чадсангүй" });
      }
      setProgress(index + 1);
    }
    setSelected(failed.map((item) => item.id));
    setFailures(failed);
    setReview(null);
    setRunning(false);
    for (const key of ["assignment-priority", "assignments", "summary", "work-items", "work-item", "dashboard", "block-setup", "my-work", "queue", "queue-counts"]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
    if (failed.length) toast.error(`${saved} ажилд оноолоо. ${failed.length} ажил амжилтгүй.`);
    else toast.success(`${saved} ажилд гүйцэтгэгч оноолоо.`);
  }

  const error = list.error || companies.error || locations.error;
  return <section aria-labelledby="priority-assignment-heading" className="space-y-4">
    <div><h2 id="priority-assignment-heading" className="text-lg font-semibold">Эхэлж хийх ажилд гүйцэтгэгч оноох</h2>
      <p className="text-muted-foreground mt-1 text-sm">Гүйцэтгэгчгүй ажлуудыг төлөвлөсөн эхлэх огноогоор эрэмбэлэв. Хуваарьгүй ажлууд сүүлд харагдана. Өмнөх ажил хүлээж байсан ч гүйцэтгэгчийг урьдчилан оноож болно.</p></div>
    {list.isLoading || companies.isLoading || locations.isLoading ? <><p className="text-muted-foreground text-sm">Бүх ажлыг авч, эхлэх хугацаагаар эрэмбэлж байна…</p><LoadingRows rows={5} /></> : error ? <ErrorState message={(error as Error).message} onRetry={() => { void list.refetch(); void companies.refetch(); void locations.refetch(); }} /> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-sm"><span>Ажил, байршил хайх</span><Input value={search} disabled={running} onChange={(e) => { setSearch(e.target.value); setPage(1); resetReview(); }} placeholder="Суурь, зоорь…" /></label>
        <label className="space-y-1 text-sm"><span>Ажлын бүлэг</span><select className={SELECT} value={group} disabled={running} onChange={(e) => { setGroup(e.target.value); setPage(1); resetReview(); }}><option value="">Бүх бүлэг</option>{groups.map((name) => {
          const items = rows.filter((w) => w.workType.groupName === name);
          return <option key={name} value={name}>{name} · {items.length} ажил · {items[0]?.plannedStartDate ? formatDate(items[0].plannedStartDate) : "Хуваарьгүй"}</option>;
        })}</select></label>
        <label className="space-y-1 text-sm"><span>Давхар</span><select className={SELECT} value={floor} disabled={running} onChange={(e) => { setFloor(e.target.value); setPage(1); resetReview(); }}><option value="">Бүх байршил</option>{locations.data?.data.filter((l) => l.level === "floor").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      </div>
      <p className="text-muted-foreground text-sm">Нийт {rows.length} гүйцэтгэгчгүй ажил · Шүүлтүүрт {visible.length} · Сонгосон {chosen.length} (бүх хуудас, шүүлтүүрээс)</p>
      {visible.length === 0 ? <EmptyState title="Тохирох гүйцэтгэгчгүй ажил алга" description="Бүлэг, давхар эсвэл хайлтаа өөрчилнө үү." /> : <>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={running} onClick={() => { setSelected((old) => [...new Set([...old, ...shown.map((w) => w.id)])]); resetReview(); }}>Энэ хуудасны {shown.length} ажлыг сонгох</Button>
          <Button variant="outline" disabled={running} onClick={() => { setSelected((old) => [...new Set([...old, ...visible.map((w) => w.id)])]); resetReview(); }}>Шүүлтүүрийн бүх {visible.length} ажлыг сонгох</Button>
          <Button variant="ghost" disabled={running || !selected.length} onClick={() => { setSelected([]); resetReview(); }}>Сонголт цэвэрлэх</Button>
        </div>
        <div className="divide-y rounded-xl border bg-card">{shown.map((item) => <article key={item.id} className="space-y-2 p-4">
          <label className="flex items-start gap-3"><input className="mt-1" type="checkbox" checked={selected.includes(item.id)} disabled={running} onChange={(e) => { setSelected((old) => e.target.checked ? [...old, item.id] : old.filter((id) => id !== item.id)); resetReview(); }} />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.workType.name}</span><span className="text-muted-foreground block text-sm">{item.workType.groupName} · {item.location.path}</span></span>
            <span className="text-sm"><span className="block">{item.plannedStartDate ? `Эхлэх: ${formatDate(item.plannedStartDate)}` : "Эхлэх хугацаа тохируулаагүй"}</span><span className="text-muted-foreground block">Дуусах: {formatDate(item.plannedEndDate)}</span>
              {item.plannedStartDate && item.plannedStartDate.slice(0, 10) <= today && <span className="block font-medium text-amber-700 dark:text-amber-400">Эхлэх хугацаа болсон</span>}
            </span>
          </label>
          <div className="ml-6 flex flex-wrap items-center gap-2"><Dependency id={item.id} /><Link href={`/work-items/${item.id}`} className="text-sm text-primary underline">Ажлын дэлгэрэнгүй</Link></div>
        </article>)}</div>
        {pages > 1 && <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={running || currentPage <= 1} onClick={() => { setPage(currentPage - 1); setReview(null); }}>Өмнөх</Button><span className="text-sm">{currentPage}/{pages}</span><Button variant="outline" disabled={running || currentPage >= pages} onClick={() => { setPage(currentPage + 1); setReview(null); }}>Дараах</Button></div>}
      </>}
      <div className="space-y-3 rounded-xl border p-4">
        <label className="block space-y-1 text-sm"><span>Сонгосон ажлуудад оноох гүйцэтгэгч</span><select className={SELECT} value={person} disabled={running} onChange={(e) => { setPerson(e.target.value); resetReview(); }}><option value="">Гүйцэтгэгч сонгох…</option>{people.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {people.length === 0 && <p className="text-sm text-amber-700 dark:text-amber-400">Оноох боломжтой идэвхтэй гүйцэтгэгч алга.</p>}
        {failures.length > 0 && <div role="alert" className="space-y-1 text-sm"><p className="font-medium">Амжилтгүй ажлууд</p>{failures.map((f) => <p key={f.id}>{f.name}: {f.message}</p>)}</div>}
        {review ? <div className="space-y-3"><h3 className="font-medium">Оноолтоо шалгана уу</h3><p className="text-sm">{review.length} ажил → <strong>{target?.name}</strong></p>
          <ul className="max-h-60 space-y-2 overflow-y-auto text-sm">{review.map((w) => <li key={w.id}>{w.workType.name} · {w.location.path} · {w.plannedStartDate ? formatDate(w.plannedStartDate) : "Хуваарьгүй"}</li>)}</ul>
          <div className="flex gap-2"><Button disabled={running} onClick={() => void save()}>{running ? `${progress}/${review.length} хадгалж байна…` : "Баталгаажуулж оноох"}</Button><Button variant="outline" disabled={running} onClick={() => setReview(null)}>Буцах</Button></div>
        </div> : <Button disabled={!target || !chosen.length || list.isFetching} onClick={() => setReview(chosen)}>{chosen.length} ажлын оноолтыг шалгах</Button>}
        {running && <p role="status" className="text-muted-foreground text-sm">Хадгалж дуустал энэ хуудсыг нээлттэй байлгана уу.</p>}
      </div>
    </>}
  </section>;
}
