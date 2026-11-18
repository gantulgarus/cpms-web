"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { plan, workItems } from "@/lib/api/endpoints";
import type { WorkItem } from "@/lib/api/types";
import { loadAssignmentWork } from "@/lib/assignment-priority";
import { formatDate, todayInProjectZone } from "@/lib/domain";
import { FormDialog, FormField } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";

export function WorkPlanDatesDialog({ item, onClose }: { item: WorkItem; onClose: () => void }) {
  const qc = useQueryClient();
  const [start, setStart] = useState(item.plannedStartDate ?? "");
  const [end, setEnd] = useState(item.plannedEndDate ?? "");
  const [batch, setBatch] = useState(false);
  const [picked, setPicked] = useState<string[]>([item.locationId]);
  const [overwrite, setOverwrite] = useState(false);
  const [search, setSearch] = useState("");
  const matches = useQuery({ queryKey: ["work-items", item.blockId, "plan-locations", item.workTypeId], queryFn: () => loadAssignmentWork((page) => workItems.listForBlock(item.blockId, { workTypeId: item.workTypeId, page, pageSize: 200 })), enabled: batch });
  const candidates = matches.data ?? [];
  const eligible = candidates.filter((work) => work.acceptedQty === 0 && (!work.scheduleManual || overwrite));
  const targets = eligible.filter((work) => picked.includes(work.locationId));
  const valid = Boolean(start && end && start <= end && (batch ? targets.length > 0 : item.acceptedQty === 0));
  const save = useMutation({
    mutationFn: async () => batch ? plan.setDates(item.blockId, { workTypeId: item.workTypeId, locationIds: picked, plannedStartDate: start, plannedEndDate: end, overwriteManual: overwrite }) : plan.updateWorkItem(item.id, { plannedStartDate: start, plannedEndDate: end }).then(() => ({ updated: 1, skipped: 0 })),
    onSuccess: (result) => { toast.success(`${result.updated} ажлын хугацаа хадгалагдлаа${result.skipped ? ` · ${result.skipped} ажил хамгаалагдсан` : ""}`); for (const key of ["work-item", "work-items", "assignment-priority", "summary", "dashboard", "block-report", "block-setup"]) void qc.invalidateQueries({ queryKey: [key] }); onClose(); },
    onError: (error: Error) => toast.error(error.message),
  });
  return <FormDialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }} title="Ажлын хугацаа төлөвлөх" submitLabel={batch ? `${targets.length} ажлын хугацаа хадгалах` : "Хадгалах"} submitDisabled={!valid || (batch && (matches.isLoading || Boolean(matches.error)))} pending={save.isPending} onSubmit={() => save.mutate()} className="sm:max-w-xl">
    <p className="text-sm font-medium">{item.workType.name}</p>
    <p className="text-muted-foreground text-sm">{item.location.path}</p>
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Төлөвлөсөн эхлэх огноо" required><Input aria-label="Төлөвлөсөн эхлэх огноо" type="date" value={start} onChange={(event) => setStart(event.target.value)} /></FormField>
      <FormField label="Төлөвлөсөн дуусах огноо" required><Input aria-label="Төлөвлөсөн дуусах огноо" type="date" min={start || undefined} value={end} onChange={(event) => setEnd(event.target.value)} /></FormField>
    </div>
    {start && end && start <= end && <p className="text-muted-foreground text-xs">Төлөвлөсөн хугацаа: {Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1} хуанлийн хоног.</p>}
    {start && end && end < start && <p role="alert" className="text-destructive text-sm">Дуусах огноо эхлэхээс өмнө байж болохгүй.</p>}
    {item.acceptedQty > 0 && !batch && <p className="text-sm text-amber-700 dark:text-amber-400">Энэ ажил батлагдсан гүйцэтгэлтэй. Хугацаа сунгах хүсэлт ашиглана уу. Бусад байршлын ажлыг доорх багц сонголтоор төлөвлөж болно.</p>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={batch} onChange={(event) => setBatch(event.target.checked)} />Энэ ажлыг өөр давхар, айлуудад багцаар төлөвлөх</label>
    {batch && <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />Өмнө гараар төлөвлөсөн ажлуудын огноог мөн солих</label>
      <Input aria-label="Хугацаа төлөвлөх байршил хайх" placeholder="Давхар, тоотоор хайх…" value={search} onChange={(event) => setSearch(event.target.value)} />
      {matches.isLoading ? <LoadingRows rows={3} /> : matches.error ? <ErrorState message={(matches.error as Error).message} onRetry={() => matches.refetch()} /> : <>
        <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setPicked(eligible.filter((work) => work.location.path.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((work) => work.locationId))}>Харагдаж буйг сонгох</Button><Button type="button" variant="ghost" size="sm" onClick={() => setPicked([])}>Цэвэрлэх</Button></div>
        <div className="max-h-56 overflow-y-auto rounded-lg border p-2">{candidates.filter((work) => work.location.path.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((work) => <label key={work.id} className="flex items-start gap-2 rounded p-2 text-sm hover:bg-accent/40">
          <input type="checkbox" disabled={!eligible.includes(work)} checked={picked.includes(work.locationId)} onChange={(event) => setPicked((previous) => event.target.checked ? [...new Set([...previous, work.locationId])] : previous.filter((id) => id !== work.locationId))} />
          <span>{work.location.path}<span className="text-muted-foreground block text-xs">{formatDate(work.plannedStartDate)} — {formatDate(work.plannedEndDate)}{work.acceptedQty > 0 ? " · Батлагдсан гүйцэтгэлтэй" : work.scheduleManual ? " · Гараар төлөвлөсөн" : " · Автомат хуваарь"}</span></span>
        </label>)}{!candidates.length && <EmptyState title="Ажил олдсонгүй" />}</div>
      </>}
    </div>}
    <p className="text-muted-foreground text-xs">Сонгосон ажлуудад ижил огноо тавина. Автомат хуваарь энэ огноог өөрчлөхгүй. Батлагдсан гүйцэтгэлтэй ажлыг алгасана. Эхэлсэн ажлын анхны амлалтын огноо хадгалагдана.</p>
  </FormDialog>;
}

export function WorkDatesPanel({ item, canPlan, canRecordActual }: { item: WorkItem; canPlan: boolean; canRecordActual: boolean }) {
  const qc = useQueryClient();
  const [planning, setPlanning] = useState(false);
  const [actual, setActual] = useState(false);
  const [start, setStart] = useState(item.actualStartDate ?? item.actualStartSuggestion ?? "");
  const [end, setEnd] = useState(item.actualEndDate ?? "");
  const today = todayInProjectZone();
  const save = useMutation({ mutationFn: () => plan.setActualDates(item.id, { actualStartDate: start || null, actualEndDate: end || null }), onSuccess: () => { toast.success("Бодит огноо хадгалагдлаа"); setActual(false); for (const key of ["work-item", "work-items", "assignment-priority", "block-report", "summary", "dashboard"]) void qc.invalidateQueries({ queryKey: [key] }); }, onError: (error: Error) => toast.error(error.message) });
  return <section className="mb-6 space-y-3 rounded-xl border bg-card p-4" aria-label="Ажлын хугацаа">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Ажлын хугацаа</h2><div className="flex flex-wrap gap-2">
      {canPlan && <Button variant="outline" size="sm" onClick={() => setPlanning(true)}>Хугацаа төлөвлөх</Button>}
      {canRecordActual && <Button variant="outline" size="sm" onClick={() => { setStart(item.actualStartDate ?? item.actualStartSuggestion ?? ""); setEnd(item.actualEndDate ?? ""); setActual(true); }}>Бодит огноо бүртгэх</Button>}
    </div></div>
    <dl className="grid gap-4 text-sm sm:grid-cols-3">
      <div><dt className="text-muted-foreground">Төлөвлөсөн {item.scheduleManual ? "· Гараар" : "· Автомат"}</dt><dd className="mt-1">{formatDate(item.plannedStartDate)} — {formatDate(item.plannedEndDate)}</dd></div>
      <div><dt className="text-muted-foreground">Бодитоор эхэлсэн / дууссан</dt><dd className="mt-1">{formatDate(item.actualStartDate)} — {formatDate(item.actualEndDate)}</dd>{item.actualDurationDays != null && <dd className="text-muted-foreground text-xs">{item.actualDurationDays} хуанлийн хоног{item.completionDelayDays != null ? item.completionDelayDays > 0 ? ` · ${item.completionDelayDays} хоног хоцорч дууссан` : " · Хугацаандаа дууссан" : " · Төлөвлөсөн дуусах огноогүй"}</dd>}</div>
      <div><dt className="text-muted-foreground">Хяналтаар бүрэн баталсан</dt><dd className="mt-1">{formatDate(item.approvedCompletedAt)}</dd></div>
    </dl>
    {planning && <WorkPlanDatesDialog item={item} onClose={() => setPlanning(false)} />}
    {actual && <FormDialog open onOpenChange={(open) => { if (!save.isPending) setActual(open); }} title="Бодит огноо бүртгэх" pending={save.isPending} submitDisabled={Boolean((end && (!start || end < start)) || start > today || end > today)} onSubmit={() => save.mutate()}>
      <FormField label="Бодитоор эхэлсэн огноо" hint="Анхны гүйцэтгэлийн огноог санал болгоно. Бодит эхэлсэн өдрөө шалгаж баталгаажуулна уу."><Input type="date" max={today} value={start} onChange={(event) => setStart(event.target.value)} /></FormField>
      <FormField label="Бодитоор дууссан огноо" hint="Бүх тоо хэмжээний гүйцэтгэл мэдээлэгдсэн үед бүртгэнэ. Хяналтын баталсан өдрөөс тусдаа."><Input type="date" min={start || undefined} max={today} value={end} disabled={item.plannedQty <= 0 || item.reportedQty + 0.001 < item.plannedQty} onChange={(event) => setEnd(event.target.value)} /></FormField>
      <p className="text-muted-foreground text-xs">Эдгээр нь бодитоор хийсэн огноо. Төлөвлөсөн огноо болон гүйцэтгэлийн хэмжээг өөрчлөхгүй.</p>
    </FormDialog>}
  </section>;
}
