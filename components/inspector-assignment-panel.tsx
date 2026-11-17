"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "sonner";
import { FormDialog, FormField } from "@/components/form-dialog";
import { AssignmentGroup } from "@/components/assignment-group";
import { AssignInspectorDialog } from "@/components/assign-inspector-dialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkCatalog } from "@/lib/api/use-work-catalog";
import { referenceData, siteEngineerAssignments, users, workItems } from "@/lib/api/endpoints";
import type { WorkItem } from "@/lib/api/types";

const PAGE_SIZE = 25;

export function InspectorAssignmentPanel({ blockId }: { blockId: string }) {
  const qc = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkInspector, setBulkInspector] = useState("");
  const catalog = useWorkCatalog();
  const [groupId, setGroupId] = useState("");
  const [subgroupNumber, setSubgroupNumber] = useState("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const list = useQuery({
    queryKey: ["work-items", blockId, "inspector-assignment", search, onlyMissing, page, groupId, subgroupNumber],
    queryFn: () => workItems.listForBlock(blockId, {
      search: search || undefined,
      workTypeGroupId: groupId || undefined,
      subgroupNumber: subgroupNumber || undefined,
      inspectorId: onlyMissing ? "none" : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  });
  const groups = useQuery({ queryKey: ["wt-groups"], queryFn: referenceData.groups });
  const groupName = groups.data?.data.find((group) => group.id === groupId)?.name;
  const assignmentGroups = useQuery({ queryKey: ["site-engineer-assignments", blockId], queryFn: () => siteEngineerAssignments.forBlock(blockId) });
  const grouped = new Map<string, NonNullable<typeof assignmentGroups.data>["groups"]>();
  for (const row of assignmentGroups.data?.groups ?? []) grouped.set(row.groupId, [...(grouped.get(row.groupId) ?? []), row]);
  const engineers = useQuery({ queryKey: ["inspectors"], queryFn: users.inspectors, enabled: bulkOpen });
  const bulkSave = useMutation({
    mutationFn: () => siteEngineerAssignments.assignInspectorSubgroup(blockId, groupId, subgroupNumber === "__none__" ? "" : subgroupNumber, bulkInspector || null),
    onSuccess: (result) => { toast.success(`${result.updated} ажлын хяналтын инженер шинэчлэгдлээ`); setBulkOpen(false); for (const key of ["work-items", "work-item", "summary", "queue", "queue-counts", "dashboard", "block-setup"]) void qc.invalidateQueries({ queryKey: [key] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const total = list.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-4" aria-labelledby="inspector-assignment-heading">
      <div>
        <h2 id="inspector-assignment-heading" className="text-lg font-semibold">Хяналтын инженер оноох · Эцсийн батлалт</h2>
        <p className="text-muted-foreground mt-1 text-sm">Хяналтын инженер шалгагдсан гүйцэтгэлийг эцэслэн батална. Ажлаа хайж олоод тухайн ажилд инженер оноох эсвэл солино.</p>
      </div>
      <p className="text-muted-foreground text-sm">Бүлэг, дэд бүлгээр шүүж ажлаа олоод инженер онооно. Оноолт сонгосон ажилд хамаарна.</p>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(draft.trim()); setPage(1); }}>
        <Input aria-label="Хяналтын инженер оноох ажлыг хайх" placeholder="Ажлын нэрээр хайх…" value={draft} maxLength={150} onChange={(event) => setDraft(event.target.value)} />
        <Button type="submit" variant="outline">Хайх</Button>
      </form>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={!groupId ? "secondary" : "outline"} size="sm" onClick={() => { setGroupId(""); setSubgroupNumber(""); setPage(1); }}>Бүх ажил</Button>
          {groupId && <span className="text-muted-foreground text-sm">{groupName}{subgroupNumber ? ` · ${subgroupNumber === "__none__" ? "Дэд бүлэггүй" : `Дэд бүлэг ${subgroupNumber}`}` : " · Бүх дэд бүлэг"}</span>}
        </div>
        {assignmentGroups.isLoading ? <LoadingRows rows={3} /> : assignmentGroups.error ? <ErrorState message={(assignmentGroups.error as Error).message} onRetry={() => assignmentGroups.refetch()} /> : [...grouped.entries()].map(([id, rows]) => <AssignmentGroup key={id} name={rows[0].groupName} subgroups={rows.length} workItems={rows.reduce((sum, row) => sum + row.workItems, 0)}>
          <div className="space-y-1 py-1">
            <Button variant="ghost" size="sm" className="mb-1" onClick={() => { setGroupId(id); setSubgroupNumber(""); setPage(1); }}>Энэ бүлгийн бүх ажил</Button>
            {rows.map((row) => {
              const number = row.subgroupNumber || "__none__";
              const active = groupId === id && subgroupNumber === number;
              return <button key={number} type="button" aria-pressed={active} className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors ${active ? "border-primary bg-accent" : "border-transparent hover:bg-accent/40"}`} onClick={() => { setGroupId(id); setSubgroupNumber(number); setPage(1); }}>
                <span className="min-w-0"><span className="block font-medium">{row.subgroupNumber ? `Дэд бүлэг ${row.subgroupNumber}` : "Дэд бүлэггүй"}</span>{row.typeName && <span className="text-muted-foreground mt-1 block text-xs">{row.typeName}</span>}</span>
                <span className="text-muted-foreground shrink-0 text-xs">{row.workItems} ажил</span>
              </button>;
            })}
          </div>
        </AssignmentGroup>)}
      </div>
      {groupId && subgroupNumber && <Button variant="outline" onClick={() => { setBulkInspector("__choose__"); setBulkOpen(true); }}>Дэд бүлэгт хяналтын инженер оноох</Button>}
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyMissing} onChange={(event) => { setOnlyMissing(event.target.checked); setPage(1); }} />
        Зөвхөн хяналтын инженер оноогоогүй ажлууд
      </label>
      {list.isLoading ? <LoadingRows rows={5} /> : list.error ? <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} /> : !list.data?.data.length ? (
        <EmptyState title="Тохирох ажил алга" description="Хайлт эсвэл оноолтын шүүлтүүрээ өөрчилнө үү." />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">Нийт {total.toLocaleString("mn-MN")} ажил · {page}/{pages} хуудас</p>
          <div className="divide-y rounded-xl border bg-card">
            {list.data.data.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-medium">{item.workType.name}</h3>
                  <p className="text-muted-foreground text-xs">{item.workType.groupName} · Дэд бүлэг {catalog.byWorkTypeId.get(item.workTypeId)?.subgroupNumber ?? "—"} · {catalog.byWorkTypeId.get(item.workTypeId)?.typeName ?? ""}</p>
                  <p className="text-muted-foreground text-sm">{item.location.path}</p>
                  <p className="text-sm">Хяналтын инженер: <span className={item.inspector ? "font-medium" : "text-amber-700 dark:text-amber-400"}>{item.inspector?.name ?? "Оноогоогүй"}</span></p>
                </div>
                <Button variant="outline" onClick={() => setEditing(item)} aria-label={`${item.workType.name} · ${item.location.path} — хяналтын инженер ${item.inspector ? "солих" : "оноох"}`}>
                  {item.inspector ? "Инженер солих" : "Инженер оноох"}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
      {!list.isError && !list.isLoading && pages > 1 && <div className="flex items-center justify-end gap-3">
        <Button variant="outline" disabled={page <= 1 || list.isFetching} onClick={() => setPage((current) => current - 1)}>Өмнөх</Button>
        <span className="text-sm tabular-nums">{page}/{pages}</span>
        <Button variant="outline" disabled={page >= pages || list.isFetching} onClick={() => setPage((current) => current + 1)}>Дараах</Button>
      </div>}
      {bulkOpen && <FormDialog open onOpenChange={(open) => { if (!bulkSave.isPending) setBulkOpen(open); }} title="Дэд бүлэгт хяналтын инженер оноох" submitLabel="Хадгалах" pending={bulkSave.isPending} submitDisabled={bulkInspector === "__choose__" || engineers.isLoading || Boolean(engineers.error)} onSubmit={() => bulkSave.mutate()}>
        <p className="text-sm">{groupName} · {subgroupNumber === "__none__" ? "Дэд бүлэггүй" : `Дэд бүлэг ${subgroupNumber}`}. Энэ барилгын тухайн дэд бүлгийн бүх ажлын одоогийн хяналтын инженерийг солино. Хайлт, хуудас болон «Оноогоогүй» шүүлтүүрээс үл хамаарна.</p>
        <FormField label="Хяналтын инженер"><select aria-label="Дэд бүлгийн хяналтын инженер" className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm" value={bulkInspector} onChange={(event) => setBulkInspector(event.target.value)}><option value="__choose__" disabled>Инженер сонгоно уу</option><option value="">Оноолтыг авах</option>{engineers.data?.map((engineer) => <option key={engineer.id} value={String(engineer.id)}>{engineer.name}</option>)}</select></FormField>
        {engineers.error && <p role="alert" className="text-destructive text-sm">Инженерийн жагсаалт ачаалсангүй.</p>}
      </FormDialog>}
      {editing && <AssignInspectorDialog key={editing.id} item={editing} open onOpenChange={(open) => { if (!open) setEditing(null); }} />}
    </section>
  );
}
