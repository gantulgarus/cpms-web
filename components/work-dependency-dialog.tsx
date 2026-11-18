"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { workExecution } from "@/lib/api/endpoints";
import type { Location, WorkCatalogEntry, WorkItem } from "@/lib/api/types";
import { locationAncestors, matchDependencyLocations, orderWorkDependencies, type WorkExecutionPlan } from "@/lib/work-execution";
import { matchesWorkSearch } from "@/lib/work-sequence";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WorkDependencyDialog({ item, works, locations, execution, catalog, onClose }: {
  item: WorkItem;
  works: WorkItem[];
  locations: Location[];
  execution: WorkExecutionPlan;
  catalog: Map<string, WorkCatalogEntry>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [version] = useState(execution.version);
  const [previous, setPrevious] = useState(execution.predecessors[item.id] ?? []);
  const [search, setSearch] = useState("");
  const [allLocations, setAllLocations] = useState(false);
  const [batch, setBatch] = useState(false);
  const [targets, setTargets] = useState<string[]>([item.id]);
  const ownAncestors = new Set(locationAncestors(item.locationId, locations));
  const available = works.filter((work) => work.id !== item.id
    && (allLocations || ownAncestors.has(work.locationId) || previous.includes(work.id))
    && matchesWorkSearch(work, search, catalog.get(work.workTypeId)));
  const selected = works.filter((work) => previous.includes(work.id));
  const peers = works.filter((work) => work.workTypeId === item.workTypeId);
  const mapped = matchDependencyLocations(item, previous, batch ? targets : [item.id], works, locations);
  const proposed = { ...execution.predecessors };
  for (const link of mapped.links) proposed[link.workItemId] = link.predecessorIds;
  const cyclic = !mapped.missing.length && orderWorkDependencies(execution.order, proposed) === null;

  const save = useMutation({
    mutationFn: () => workExecution.setDependencies(item.blockId, { version, links: mapped.links }),
    onSuccess: (result) => {
      qc.setQueryData(["execution-plan", item.blockId], result);
      toast.success(`${mapped.links.length} ажлын хамаарал хадгалагдлаа`);
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      void qc.invalidateQueries({ queryKey: ["execution-plan", item.blockId] });
    },
  });

  function togglePrevious(id: string) {
    setPrevious((old) => old.includes(id) ? old.filter((value) => value !== id) : [...old, id]);
  }

  return (
    <FormDialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }} title="Өмнөх ажлуудыг холбох" className="sm:max-w-2xl" submitLabel={`${mapped.links.length} ажлын холбоос хадгалах`} submitDisabled={!mapped.links.length || Boolean(mapped.missing.length) || cyclic} pending={save.isPending} onSubmit={() => save.mutate()}>
      <p className="text-sm font-medium">{catalog.get(item.workTypeId)?.systemCode} · {item.workType.name}</p>
      <p className="text-muted-foreground text-sm">{item.location.path}</p>
      <p className="text-sm">Доор сонгосон бүх ажил дууссаны дараа энэ ажил эхлэхээр төлөвлөнө. Хэд хэдэн ажил сонговол бүгдийг нь хүлээнэ.</p>
      <Input aria-label="Өмнөх ажил хайх" placeholder="Код, нэр, давхар, тоотоор хайх…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allLocations} onChange={(event) => setAllLocations(event.target.checked)} />Бүх байршлын ажлыг харуулах</label>
      <div className="max-h-64 overflow-y-auto rounded-lg border p-2">
        {available.map((work) => (
          <label key={work.id} className="flex cursor-pointer items-start gap-2 rounded p-2 text-sm hover:bg-accent/40">
            <input className="mt-1" type="checkbox" checked={previous.includes(work.id)} onChange={() => togglePrevious(work.id)} />
            <span><span className="font-mono text-xs">{catalog.get(work.workTypeId)?.systemCode || work.code}</span> {work.workType.name}<span className="text-muted-foreground block text-xs">{work.location.path}</span></span>
          </label>
        ))}
        {!available.length && <p className="text-muted-foreground p-2 text-sm">Өмнөх ажил олдсонгүй. Хайлт эсвэл байршлын сонголтоо шалгана уу.</p>}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Сонгосон {selected.length} өмнөх ажил</p>
        {selected.map((work) => <div key={work.id} className="flex items-start justify-between gap-2 text-xs"><span>{catalog.get(work.workTypeId)?.systemCode} · {work.workType.name} · {work.location.path}</span><Button type="button" variant="ghost" size="sm" onClick={() => togglePrevious(work.id)}>Хасах</Button></div>)}
        {!selected.length && <p className="text-muted-foreground text-xs">Өмнөх ажлын холбоосгүйгээр хадгална.</p>}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={batch} onChange={(event) => setBatch(event.target.checked)} />Ижил ажлын бусад байршилд багцаар тохируулах</label>
      {batch && <div className="space-y-2">
        <p className="text-muted-foreground text-xs">Өмнөх ажлын төрлийг сонгосон давхар, айл тус бүрийн ижил эсвэл дээд байршлын ажилтай тааруулна.</p>
        <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setTargets(peers.map((work) => work.id))}>Бүгдийг сонгох</Button><Button type="button" size="sm" variant="ghost" onClick={() => setTargets([])}>Цэвэрлэх</Button></div>
        <div className="max-h-40 overflow-y-auto rounded-lg border p-2">{peers.map((work) => <label key={work.id} className="flex items-center gap-2 p-2 text-sm"><input type="checkbox" checked={targets.includes(work.id)} onChange={(event) => setTargets((old) => event.target.checked ? [...old, work.id] : old.filter((id) => id !== work.id))} />{work.location.path}</label>)}</div>
        <p className="text-sm">{targets.length} ажлын өмнөх холбоосыг шинэ сонголтоор солино.</p>
      </div>}
      {mapped.missing.length > 0 && <div role="alert" className="rounded-lg border border-amber-500/40 p-3 text-sm">{mapped.missing.slice(0, 4).map((message) => <p key={message}>{message}</p>)}{mapped.missing.length > 4 && <p>Өөр {mapped.missing.length - 4} байршлыг мөн шалгана уу.</p>}</div>}
      {cyclic && <p role="alert" className="text-destructive text-sm">Тойрог хамаарал үүсэхээр байна. Өмнөх ажлуудын сонголтоо өөрчилнө үү.</p>}
      <p className="text-muted-foreground text-xs">Дуусалтыг бодит дууссан огноо эсвэл бүрэн батлагдсан гүйцэтгэлээр тодорхойлно. Холбоос нь төлөвлөгөөнд хүлээгдэж буй ажлыг харуулна.</p>
    </FormDialog>
  );
}
