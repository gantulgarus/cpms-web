"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { assignments, contractors, siteEngineerAssignments } from "@/lib/api/endpoints";
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
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [preview, setPreview] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failures, setFailures] = useState<{ id: string; name: string; message: string }[]>([]);
  const qc = useQueryClient();
  const allowed = mode === "contractor" ? me?.canManageContractors : me?.canAssignInspectors;
  const contractorGroups = useQuery({ queryKey: ["assignments", blockId], queryFn: () => assignments.forBlock(blockId), enabled: mode === "contractor" && Boolean(me?.canManageContractors) });
  const siteGroups = useQuery({ queryKey: ["site-engineer-assignments", blockId], queryFn: () => siteEngineerAssignments.forBlock(blockId), enabled: mode === "site" && Boolean(me?.canAssignInspectors) });
  const companies = useQuery({ queryKey: ["contractors"], queryFn: () => contractors.list(), enabled: mode === "contractor" && Boolean(me?.canManageContractors) });
  const source = mode === "contractor" ? contractorGroups : siteGroups;
  const rows = mode === "contractor"
    ? (contractorGroups.data ?? []).map((g) => ({ id: g.groupId, name: g.groupName, count: g.unassigned, total: g.workItems, missing: g.unassigned > 0, current: g.contractors.map((c) => `${c.name} (${c.workItems})`).join(", ") || "Оноогоогүй" }))
    : (siteGroups.data?.groups ?? []).map((g) => ({ id: g.groupId, name: g.groupName, count: g.workItems, total: g.workItems, missing: g.needsAssignment, current: g.siteEngineer?.name ?? "Оноогоогүй" }));
  const people = mode === "contractor"
    ? (companies.data?.data ?? []).filter((c) => !c.status || c.status === "active").map((c) => ({ id: String(c.id), name: c.name }))
    : (siteGroups.data?.engineers ?? []).map((u) => ({ id: String(u.id), name: u.name }));
  const visible = rows.filter((g) => (!onlyMissing || g.missing) && g.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const chosen = rows.filter((g) => selected.includes(g.id) && (mode !== "contractor" || g.count > 0));
  const target = people.find((p) => p.id === person);
  const affected = chosen.reduce((sum, g) => sum + g.count, 0);
  const loading = source.isLoading || (mode === "contractor" && companies.isLoading);
  const error = source.error || (mode === "contractor" ? companies.error : null);

  function resetReview() { setPreview(false); setFailures([]); }
  async function save() {
    if (!allowed || !target || chosen.length === 0 || running) return;
    setRunning(true);
    setProgress(0);
    const failed: typeof failures = [];
    let affectedCount = 0;
    for (const [index, group] of chosen.entries()) {
      try {
        if (mode === "contractor") {
          const result = await assignments.assignGroup(blockId, { workTypeGroupId: group.id, contractorId: person });
          affectedCount += result.affected;
        } else {
          await siteEngineerAssignments.assign(blockId, group.id, person);
          affectedCount += group.count;
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
      <div><h2 id={`bulk-assignment-${mode}-heading`} className="text-lg font-semibold">Олон бүлэгт нэг дор оноох</h2>
        <p className="text-muted-foreground mt-1 text-sm">{mode === "contractor" ? "Гүйцэтгэгч ажлыг хийж, гүйцэтгэлээ бүртгэнэ. Оноох ажлын бүлгүүдээ сонгоно уу." : "Талбайн инженер гүйцэтгэлийг газар дээр нь шалгана. Хариуцах ажлын бүлгүүдийг сонгоно уу."}</p></div>
      {loading ? <LoadingRows rows={3} /> : error ? <ErrorState message={(error as Error).message} onRetry={() => { void source.refetch(); if (mode === "contractor") void companies.refetch(); }} /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span>Ажлын бүлэг хайх</span><Input value={search} disabled={running} onChange={(e) => { setSearch(e.target.value); resetReview(); }} placeholder="Өрлөг, засал…" /></label>
            <label className="space-y-1 text-sm"><span>{mode === "contractor" ? "Гүйцэтгэгч" : "Талбайн инженер"}</span><select className={SELECT} value={person} disabled={running} onChange={(e) => { setPerson(e.target.value); resetReview(); }}><option value="">Сонгох…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          </div>
          {people.length === 0 && <p className="text-sm text-amber-700 dark:text-amber-300">{mode === "contractor" ? "Оноох боломжтой идэвхтэй гүйцэтгэгч алга." : "Энэ барилгыг хариуцах идэвхтэй талбайн инженер алга. Админаар эрх, хамрах барилгыг тохируулуулна уу."}</p>}
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={onlyMissing} disabled={running} onChange={(e) => { setOnlyMissing(e.target.checked); resetReview(); }} />Зөвхөн оноолт дутуу бүлгүүд</label>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{visible.length} бүлэг харагдаж байна · {chosen.length} бүлэг сонгосон</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={running || !visible.length} onClick={() => { setSelected((old) => [...new Set([...old, ...visible.filter((g) => mode !== "contractor" || g.count > 0).map((g) => g.id)])]); resetReview(); }}>Харагдаж буйг сонгох</Button><Button variant="ghost" size="sm" disabled={running || !selected.length} onClick={() => { setSelected([]); resetReview(); }}>Цэвэрлэх</Button></div>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border divide-y">
            {visible.length === 0 ? <p className="text-muted-foreground p-4 text-sm">Тохирох бүлэг алга. Хайлт эсвэл шүүлтүүрээ өөрчилнө үү.</p> : visible.map((g) => <label key={g.id} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/50"><input className="mt-1" type="checkbox" checked={selected.includes(g.id)} disabled={running || (mode === "contractor" && g.count === 0)} onChange={(e) => { setSelected((old) => e.target.checked ? [...old, g.id] : old.filter((id) => id !== g.id)); resetReview(); }} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{g.name}</span><span className="text-muted-foreground block text-xs">{g.total} ажил · Одоогийн: {g.current}</span></span><span className="shrink-0 text-sm tabular-nums">{mode === "contractor" ? `${g.count} оноогоогүй` : `${g.count} ажил`}</span></label>)}
          </div>
          <p className="text-muted-foreground text-xs">{mode === "contractor" ? "Зөвхөн гүйцэтгэгчгүй ажлуудад онооно. Өмнөх оноолтыг солихгүй. Дараа нэмсэн ажлыг дахин онооно." : "Сонгосон бүлгийн одоогийн инженер солигдоно. Дараа нэмэгдэх ажлууд мөн энэ хуваарилалтыг дагана. Шалгалтын түүх хадгалагдана."} Энэ үйлдэл барилгын бүх байршлыг хамарна.</p>
          {failures.length > 0 && <div role="alert" className="space-y-1 rounded-lg border border-destructive/30 p-3 text-sm"><p className="font-medium">Дахин оролдох бүлгүүд</p>{failures.map((f) => <p key={f.id}>{f.name}: {f.message}</p>)}</div>}
          {preview ? <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4"><h3 className="font-medium">Хуваарилалтаа шалгана уу</h3><p className="text-sm">{blockName} · {chosen.length} бүлэг · {affected} ажил → <strong>{target?.name}</strong></p><p className="text-muted-foreground text-sm">{chosen.map((g) => g.name).join(", ")}</p>{mode === "site" && chosen.some((g) => g.current !== "Оноогоогүй") && <p className="text-sm text-amber-700 dark:text-amber-300">Өмнө оноосон талбайн инженерийг сонгосон инженерээр солино.</p>}<div className="flex gap-2"><Button disabled={running} onClick={() => void save()}>{running ? `${progress}/${chosen.length} хадгалж байна…` : "Баталгаажуулж оноох"}</Button><Button variant="outline" disabled={running} onClick={() => setPreview(false)}>Буцах</Button></div><p role="status" className="text-muted-foreground text-xs">{running ? "Хадгалж дуустал энэ хуудсыг нээлттэй байлгана уу." : "Ажлын тоо нь одоогийн мэдээлэлд үндэслэсэн; сервер хадгалах үед дахин шалгана."}</p></div> : <Button disabled={!allowed || !target || chosen.length === 0} onClick={() => setPreview(true)}>{chosen.length} бүлгийн {affected} ажилд оноох →</Button>}
        </>
      )}
    </section>
  );
}
