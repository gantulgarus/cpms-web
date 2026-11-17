"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AssignmentGroup } from "@/components/assignment-group";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { siteEngineerAssignments } from "@/lib/api/endpoints";

export function SiteEngineerAssignmentPanel({ blockId }: { blockId: string }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const list = useQuery({ queryKey: ["site-engineer-assignments", blockId], queryFn: () => siteEngineerAssignments.forBlock(blockId) });
  const save = useMutation({
    mutationFn: ({ groupId, engineerId, subgroupNumber }: { groupId: string; engineerId: string; subgroupNumber?: string }) => siteEngineerAssignments.assign(blockId, groupId, engineerId || null, subgroupNumber),
    onSuccess: (_, { groupId, subgroupNumber }) => {
      toast.success("Талбайн инженерийн хуваарилалт хадгалагдлаа");
      setPicked((old) => { const next = { ...old }; delete next[`${groupId}:${subgroupNumber ?? ""}`]; return next; });
      for (const key of ["site-engineer-assignments", "queue", "queue-counts", "work-item", "work-items", "dashboard"]) void qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const grouped = new Map<string, NonNullable<typeof list.data>["groups"]>();
  for (const row of list.data?.groups ?? []) grouped.set(row.groupId, [...(grouped.get(row.groupId) ?? []), row]);
  const missing = list.data?.groups.filter((g) => g.needsAssignment) ?? [];

  return (
    <section id="site-engineers" className="mb-8 scroll-mt-20 space-y-3" aria-labelledby="site-engineer-heading">
      <div>
        <h2 id="site-engineer-heading" className="font-medium">Талбайн инженер хуваарилах · 1-р шат</h2>
        <p className="text-muted-foreground mt-1 text-sm">Дэд бүлэг бүрийг талбайн инженерт хариуцуулна. Дараа нь энэ дэд бүлэгт нэмэгдэх ажлууд мөн түүнд хамаарна. Өмнөх шалгалтын түүх хэвээр үлдэнэ.</p>
      </div>
      {list.isLoading ? <LoadingRows rows={3} /> : list.error ? <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} /> : list.data?.groups.length === 0 ? <EmptyState title="Хуваарилах ажил алга" description="Барилгад ажлуудаа нэмсний дараа энд бүлгүүд харагдана." /> : (
        <>
          {missing.length > 0 && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">{missing.length} дэд бүлэгт хүчинтэй талбайн инженер оноогоогүй байна. Эдгээр дэд бүлэгт шалгалт хүлээж буй {missing.reduce((sum, g) => sum + g.pendingCheck, 0)} ажил байна.</p>}
          {list.data?.engineers.length === 0 && <p className="text-muted-foreground text-sm">Энэ барилгыг хариуцах идэвхтэй талбайн инженер алга. Админаар хэрэглэгчийн эрх, хамрах барилгыг тохируулуулна уу.</p>}
          <div className="space-y-3">
            {[...grouped.entries()].map(([groupId, rows]) => <AssignmentGroup key={groupId} name={rows[0].groupName} subgroups={rows.length} workItems={rows.reduce((sum, row) => sum + row.workItems, 0)} missing={rows.filter((row) => row.needsAssignment).length}>
            <div className="divide-y">
            {rows.map((group) => {
              const key = `${group.groupId}:${group.subgroupNumber ?? ""}`;
              const label = `${group.subgroupNumber ? `Дэд бүлэг ${group.subgroupNumber}` : "Дэд бүлэггүй"}${group.typeName ? ` · ${group.typeName}` : ""}`;
              const current = String(group.siteEngineer?.id ?? "");
              const selected = picked[key] ?? current;
              return <div key={key} className="grid items-center gap-3 py-4 lg:grid-cols-2">
                <div><h3 className="text-sm font-medium">{label}</h3><p className="text-muted-foreground mt-1 text-xs">{group.workItems} ажил · {group.pendingCheck} шалгалт хүлээж буй</p><p className="mt-1 text-xs">Одоогийн инженер: {group.siteEngineer?.name ?? "Оноогоогүй"}{group.needsAssignment && group.siteEngineer && " · эрх эсвэл хамрах барилгыг шалгана уу"}</p></div>
                <div className="flex gap-2">
                  <select aria-label={`${label} — талбайн инженер`} value={selected} disabled={save.isPending} className="border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-2 text-sm" onChange={(e) => setPicked((old) => ({ ...old, [key]: e.target.value }))}>
                    <option value="">Оноогоогүй</option>
                    {group.siteEngineer && !list.data?.engineers.some((u) => String(u.id) === current) && <option value={current} disabled>{group.siteEngineer.name} · эрхгүй</option>}
                    {list.data?.engineers.map((u) => <option key={u.id} value={String(u.id)}>{u.name}{u.position ? ` · ${u.position}` : ""}</option>)}
                  </select>
                  <Button variant="outline" disabled={selected === current || save.isPending} onClick={() => save.mutate({ groupId: group.groupId, engineerId: selected, subgroupNumber: group.subgroupNumber })}>Хадгалах</Button>
                </div>
              </div>;
            })}
            </div>
            </AssignmentGroup>)}
          </div>
        </>
      )}
    </section>
  );
}
