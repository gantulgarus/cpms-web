"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { assignments, contractors, siteEngineerAssignments, workItems } from "@/lib/api/endpoints";
import { AssignmentGroup } from "@/components/assignment-group";
import { useWorkCatalog } from "@/lib/api/use-work-catalog";
import { useMe } from "@/lib/api/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, LoadingRows } from "@/components/states";

type Mode = "contractor" | "site";
const SELECT = "border-input bg-background h-10 w-full rounded-md border px-3 text-sm";

export function BulkAssignmentPanel({ blockId, blockName, mode }: { blockId: string; blockName: string; mode: Mode }) {
  const { me } = useMe();
  const [selected, setSelected] = useState<string[]>([]);
  const [person, setPerson] = useState("");
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(mode === "contractor");
  const [individual, setIndividual] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failures, setFailures] = useState<{ id: string; name: string; message: string }[]>([]);
  const qc = useQueryClient();
  const unitLabel = mode === "site" ? "дэд бүлэг" : "бүлэг";
  const allowed = mode === "contractor" ? me?.canManageContractors : me?.canAssignInspectors;
  const contractorGroups = useQuery({ queryKey: ["assignments", blockId], queryFn: () => assignments.forBlock(blockId), enabled: mode === "contractor" && Boolean(me?.canManageContractors) });
  const siteGroups = useQuery({ queryKey: ["site-engineer-assignments", blockId], queryFn: () => siteEngineerAssignments.forBlock(blockId), enabled: mode === "site" && Boolean(me?.canAssignInspectors) });
  const companies = useQuery({ queryKey: ["contractors"], queryFn: () => contractors.list(), enabled: mode === "contractor" && Boolean(me?.canManageContractors) });
  const source = mode === "contractor" ? contractorGroups : siteGroups;
  const rows = mode === "contractor"
    ? (contractorGroups.data ?? []).map((g) => ({ id: g.groupId, groupId: g.groupId, groupName: g.groupName, subgroupNumber: undefined as string | undefined, name: g.groupName, count: g.unassigned, total: g.workItems, missing: g.unassigned > 0, currentId: "", current: g.contractors.map((c) => `${c.name} (${c.workItems})`).join(", ") || "Оноогоогүй" }))
    : (siteGroups.data?.groups ?? []).map((g) => ({ id: `${g.groupId}:${g.subgroupNumber ?? ""}`, groupId: g.groupId, groupName: g.groupName, subgroupNumber: g.subgroupNumber, name: `${g.groupName} · ${g.subgroupNumber ? `Дэд бүлэг ${g.subgroupNumber}` : "Дэд бүлэггүй"}${g.typeName ? ` · ${g.typeName}` : ""}`, count: g.workItems, total: g.workItems, missing: g.needsAssignment, currentId: String(g.siteEngineer?.id ?? ""), current: g.siteEngineer?.name ?? "Оноогоогүй" }));
  const people = mode === "contractor"
    ? (companies.data?.data ?? []).filter((c) => !c.status || c.status === "active").map((c) => ({ id: String(c.id), name: c.name }))
    : (siteGroups.data?.engineers ?? []).map((u) => ({ id: String(u.id), name: u.name }));
  const visible = rows.filter((g) => (!onlyMissing || g.missing) && g.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const grouped = new Map<string, typeof rows>();
  for (const row of visible) grouped.set(row.groupId, [...(grouped.get(row.groupId) ?? []), row]);
  const chosen = rows.filter((g) => selected.includes(g.id) && (mode !== "contractor" || g.count > 0));
  const target = people.find((p) => p.id === person);
  const affected = chosen.reduce((sum, g) => sum + g.count, 0);
  const loading = source.isLoading || (mode === "contractor" && companies.isLoading);
  const error = source.error || (mode === "contractor" ? companies.error : null);

  const saveIndividual = useMutation({
    mutationFn: ({ group, engineerId }: { group: (typeof rows)[number]; engineerId: string }) => siteEngineerAssignments.assign(blockId, group.groupId, engineerId || null, group.subgroupNumber),
    onSuccess: (_, { group }) => {
      toast.success("Дэд бүлгийн инженерийн оноолт хадгалагдлаа");
      setIndividual((previous) => { const next = { ...previous }; delete next[group.id]; return next; });
      setPreview(false);
      for (const key of ["site-engineer-assignments", "summary", "work-items", "work-item", "queue", "queue-counts", "dashboard", "block-setup"]) void qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = running || saveIndividual.isPending;

  function resetReview() { setPreview(false); setFailures([]); }
  async function save() {
    if (!allowed || !target || chosen.length === 0 || busy) return;
    setRunning(true);
    setProgress(0);
    const failed: typeof failures = [];
    let affectedCount = 0;
    for (const [index, group] of chosen.entries()) {
      try {
        if (mode === "contractor") {
          const result = await assignments.assignGroup(blockId, { workTypeGroupId: group.groupId, contractorId: person });
          affectedCount += result.affected;
        } else {
          await siteEngineerAssignments.assign(blockId, group.groupId, person, group.subgroupNumber);
          affectedCount += group.count;
          setIndividual((previous) => { const next = { ...previous }; delete next[group.id]; return next; });
        }
      } catch (e) {
        failed.push({ id: group.id, name: group.name, message: e instanceof Error ? e.message : "Хадгалах амжилтгүй" });
      }
      setProgress(index + 1);
    }
    setFailures(failed);
    setSelected(failed.map((g) => g.id));
    setPreview(false);
    setRunning(false);
    for (const key of ["assignments", "site-engineer-assignments", "summary", "work-items", "work-item", "queue", "queue-counts", "dashboard", "block-setup"]) void qc.invalidateQueries({ queryKey: [key] });
    if (failed.length) toast.error(`${chosen.length - failed.length} бүлэг хадгалагдсан, ${failed.length} бүлэг амжилтгүй. Алдаатай бүлгүүд сонгогдсон хэвээр байна.`);
    else toast.success(`${chosen.length} бүлгийн ${affectedCount} ажилд хуваарилалт хийлээ.`);
  }

  if (!me?.canManageContractors && !me?.canAssignInspectors) return null;
  return (
    <section aria-labelledby={`bulk-assignment-${mode}-heading`} className="mb-8 space-y-4 rounded-xl border bg-card p-4 sm:p-6">
      <div><h2 id={`bulk-assignment-${mode}-heading`} className="text-lg font-semibold">{mode === "site" ? "Талбайн инженерийн хуваарилалт" : "Олон бүлэгт гүйцэтгэгч оноох"}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{mode === "contractor" ? "Гүйцэтгэгч ажлыг хийж, гүйцэтгэлээ бүртгэнэ. Оноох ажлын бүлгүүдээ сонгоно уу." : "Бүлгийг дэлгэж дэд бүлэг бүрийн инженерийг харж, өөрчилнө. Олон дэд бүлгийг чагтлаад нэг инженерт нэг дор оноож болно."}</p></div>
      {loading ? <LoadingRows rows={3} /> : error ? <ErrorState message={(error as Error).message} onRetry={() => { void source.refetch(); if (mode === "contractor") void companies.refetch(); }} /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span>Бүлэг, дэд бүлэг хайх</span><Input value={search} disabled={busy} onChange={(e) => { setSearch(e.target.value); resetReview(); }} placeholder="Өрлөг, засал…" /></label>
            <label className="space-y-1 text-sm"><span>{mode === "contractor" ? "Гүйцэтгэгч" : "Сонгосон дэд бүлгүүдэд оноох инженер"}</span><select className={SELECT} value={person} disabled={busy} onChange={(e) => { setPerson(e.target.value); resetReview(); }}><option value="">Сонгох…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          </div>
          {people.length === 0 && <p className="text-sm text-amber-700 dark:text-amber-300">{mode === "contractor" ? "Оноох боломжтой идэвхтэй гүйцэтгэгч алга." : "Энэ барилгыг хариуцах идэвхтэй талбайн инженер алга. Админаар эрх, хамрах барилгыг тохируулуулна уу."}</p>}
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={onlyMissing} disabled={busy} onChange={(e) => { setOnlyMissing(e.target.checked); resetReview(); }} />Зөвхөн оноолт дутуу {mode === "site" ? "дэд бүлгүүд" : "бүлгүүд"}</label>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{visible.length} {unitLabel} харагдаж байна · {chosen.length} {unitLabel} сонгосон</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy || !visible.length} onClick={() => { setSelected((old) => [...new Set([...old, ...visible.filter((g) => mode !== "contractor" || g.count > 0).map((g) => g.id)])]); resetReview(); }}>Харагдаж буйг сонгох</Button><Button variant="ghost" size="sm" disabled={busy || !selected.length} onClick={() => { setSelected([]); resetReview(); }}>Цэвэрлэх</Button></div>
          </div>
          <div className="max-h-[60dvh] space-y-3 overflow-y-auto">
            {visible.length === 0 ? <p className="text-muted-foreground p-4 text-sm">Тохирох бүлэг алга. Хайлт эсвэл шүүлтүүрээ өөрчилнө үү.</p> : [...grouped.entries()].map(([groupId, items]) => <AssignmentGroup key={groupId} name={items[0].groupName} subgroups={mode === "site" ? items.length : undefined} workItems={items.reduce((sum, row) => sum + row.total, 0)}>
              <div className="divide-y">
                {items.map((g) => <div key={g.id} className="py-3">
                  <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/50">
                    <input className="mt-1" type="checkbox" checked={selected.includes(g.id)} disabled={busy || (mode === "contractor" && g.count === 0)} onChange={(e) => { setSelected((old) => e.target.checked ? [...new Set([...old, g.id])] : old.filter((id) => id !== g.id)); resetReview(); }} />
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{mode === "site" ? g.name.slice(g.groupName.length + 3) : "Бүлгийн гүйцэтгэгчгүй бүх ажил"}</span><span className="text-muted-foreground mt-1 block text-xs">Одоогийн: {g.current}</span></span>
                    <span className="shrink-0 text-xs tabular-nums">{mode === "contractor" ? `${g.count} оноогоогүй / ${g.total} ажил` : `${g.total} ажил`}</span>
                  </label>
                  {mode === "site" && <div className="ml-7 mt-2 flex flex-wrap items-center gap-2">
                    <select aria-label={`${g.name} — талбайн инженер`} className={`${SELECT} min-w-0 flex-1 sm:max-w-xs`} disabled={busy} value={individual[g.id] ?? g.currentId} onChange={(event) => { setIndividual((previous) => ({ ...previous, [g.id]: event.target.value })); resetReview(); }}>
                      <option value="">Оноолтгүй</option>
                      {g.currentId && !people.some((engineer) => engineer.id === g.currentId) && <option value={g.currentId} disabled>{g.current} · эрхгүй</option>}
                      {people.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.name}</option>)}
                    </select>
                    <Button type="button" variant="outline" size="sm" disabled={busy || !allowed || (individual[g.id] ?? g.currentId) === g.currentId} onClick={() => saveIndividual.mutate({ group: g, engineerId: individual[g.id] ?? g.currentId })}>Хадгалах</Button>
                    {g.missing && <span className="text-xs text-amber-700 dark:text-amber-400">Хүчинтэй инженер оноогоогүй</span>}
                  </div>}
                  <AssignmentWorkPreview blockId={blockId} groupId={g.groupId} subgroupNumber={g.subgroupNumber} onlyUnassigned={mode === "contractor"} />
                </div>)}
              </div>
            </AssignmentGroup>)}
          </div>
          <p className="text-muted-foreground text-xs">{mode === "contractor" ? "Зөвхөн гүйцэтгэгчгүй ажлуудад онооно. Өмнөх оноолтыг солихгүй. Дараа нэмсэн ажлыг дахин онооно." : "Сонгосон дэд бүлгийн одоогийн инженер солигдоно. Дараа нэмэгдэх ажлууд мөн энэ хуваарилалтыг дагана. Оноолтыг авах бол дэд бүлгийн сонголтоос «Оноолтгүй»-г сонгоод хадгална. Шалгалтын түүх хадгалагдана."} Энэ үйлдэл барилгын бүх байршлыг хамарна.</p>
          {failures.length > 0 && <div role="alert" className="space-y-1 rounded-lg border border-destructive/30 p-3 text-sm"><p className="font-medium">Дахин оролдох бүлгүүд</p>{failures.map((f) => <p key={f.id}>{f.name}: {f.message}</p>)}</div>}
          {preview ? <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4"><h3 className="font-medium">Хуваарилалтаа шалгана уу</h3><p className="text-sm">{blockName} · {chosen.length} {unitLabel} · {affected} ажил → <strong>{target?.name}</strong></p><p className="text-muted-foreground text-sm">{chosen.map((g) => g.name).join(", ")}</p>{mode === "site" && chosen.some((g) => g.current !== "Оноогоогүй") && <p className="text-sm text-amber-700 dark:text-amber-300">Өмнө оноосон талбайн инженерийг сонгосон инженерээр солино.</p>}<div className="flex gap-2"><Button disabled={busy} onClick={() => void save()}>{running ? `${progress}/${chosen.length} хадгалж байна…` : "Баталгаажуулж оноох"}</Button><Button variant="outline" disabled={busy} onClick={() => setPreview(false)}>Буцах</Button></div><p role="status" className="text-muted-foreground text-xs">{running ? "Хадгалж дуустал энэ хуудсыг нээлттэй байлгана уу." : "Ажлын тоо нь одоогийн мэдээлэлд үндэслэсэн; сервер хадгалах үед дахин шалгана."}</p></div> : <Button disabled={!allowed || !target || chosen.length === 0 || busy} onClick={() => setPreview(true)}>{chosen.length} {unitLabel}т {affected} ажилд оноох →</Button>}
        </>
      )}
    </section>
  );
}


function AssignmentWorkPreview({ blockId, groupId, subgroupNumber, onlyUnassigned }: { blockId: string; groupId: string; subgroupNumber?: string; onlyUnassigned: boolean }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const catalog = useWorkCatalog();
  const list = useQuery({
    queryKey: ["work-items", blockId, "assignment-preview", groupId, subgroupNumber, onlyUnassigned, page],
    queryFn: () => workItems.listForBlock(blockId, { workTypeGroupId: groupId, subgroupNumber: subgroupNumber === "" ? "__none__" : subgroupNumber, contractorId: onlyUnassigned ? "none" : undefined, page, pageSize: 5 }),
    enabled: open,
  });
  return <details className="ml-7 text-sm" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer py-2 text-primary">Хамрах ажлуудыг харах</summary>
    {list.isLoading ? <LoadingRows rows={2} /> : list.error ? <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} /> : <div className="space-y-2 rounded-lg border bg-background p-3">
      {list.data?.data.map((work) => {
        const entry = catalog.byWorkTypeId.get(work.workTypeId);
        return <div key={work.id} className="border-b pb-2 last:border-0 last:pb-0">
          <p className="text-muted-foreground text-xs">{entry?.systemCode ?? ""}{entry ? ` · Дэд бүлэг ${entry.subgroupNumber} · ${entry.typeName}` : "Дэд бүлэггүй"}</p>
          <p className="mt-1 font-medium">{work.workType.name}</p>
          <p className="text-muted-foreground text-xs">{work.location.path}</p>
        </div>;
      })}
      <p className="text-muted-foreground text-xs">Нийт {list.data?.meta.total ?? 0} ажил · {page}/{Math.max(1, Math.ceil((list.data?.meta.total ?? 0) / 5))} хуудас. Оноолт бүх хамрах ажилд хийгдэнэ.</p>
      {(list.data?.meta.total ?? 0) > 5 && <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={page === 1 || list.isFetching} onClick={() => setPage((previous) => previous - 1)}>Өмнөх</Button>
        <Button type="button" size="sm" variant="outline" disabled={page * 5 >= (list.data?.meta.total ?? 0) || list.isFetching} onClick={() => setPage((previous) => previous + 1)}>Дараах</Button>
      </div>}
    </div>}
  </details>;
}
