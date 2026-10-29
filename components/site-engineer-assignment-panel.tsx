"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { siteEngineerAssignments } from "@/lib/api/endpoints";

export function SiteEngineerAssignmentPanel({ blockId }: { blockId: string }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const list = useQuery({ queryKey: ["site-engineer-assignments", blockId], queryFn: () => siteEngineerAssignments.forBlock(blockId) });
  const save = useMutation({
    mutationFn: ({ groupId, engineerId }: { groupId: string; engineerId: string }) => siteEngineerAssignments.assign(blockId, groupId, engineerId || null),
    onSuccess: (_, { groupId }) => {
      toast.success("Талбайн инженерийн хуваарилалт хадгалагдлаа");
      setPicked((old) => { const next = { ...old }; delete next[groupId]; return next; });
      for (const key of ["site-engineer-assignments", "queue", "queue-counts", "work-item", "work-items", "dashboard"]) void qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const missing = list.data?.groups.filter((g) => g.needsAssignment) ?? [];

  return (
    <section id="site-engineers" className="mb-8 scroll-mt-20 space-y-3" aria-labelledby="site-engineer-heading">
      <div>
        <h2 id="site-engineer-heading" className="font-medium">Талбайн инженер хуваарилах · 1-р шат</h2>
        <p className="text-muted-foreground mt-1 text-sm">Ажлын бүлэг бүрийг нэг талбайн инженерт хариуцуулна. Дараа нь энэ бүлэгт нэмэгдэх ажлууд мөн түүнд хамаарна. Өмнөх шалгалтын түүх хэвээр үлдэнэ.</p>
      </div>
      {list.isLoading ? <LoadingRows rows={3} /> : list.error ? <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} /> : list.data?.groups.length === 0 ? <EmptyState title="Хуваарилах ажил алга" description="Блокт ажлуудаа нэмсний дараа энд бүлгүүд харагдана." /> : (
        <>
          {missing.length > 0 && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">{missing.length} бүлэгт хүчинтэй талбайн инженер оноогоогүй байна. Эдгээр бүлэгт шалгалт хүлээж буй {missing.reduce((sum, g) => sum + g.pendingCheck, 0)} ажил байна.</p>}
          {list.data?.engineers.length === 0 && <p className="text-muted-foreground text-sm">Энэ барилгыг хариуцах идэвхтэй талбайн инженер алга. Админаар хэрэглэгчийн эрх, хамрах барилгыг тохируулуулна уу.</p>}
          <div className="divide-y rounded-xl border bg-card">
            {list.data?.groups.map((group) => {
              const current = String(group.siteEngineer?.id ?? "");
              const selected = picked[group.groupId] ?? current;
              return <div key={group.groupId} className="grid items-center gap-3 p-4 lg:grid-cols-2">
                <div><h3 className="text-sm font-medium">{group.groupName}</h3><p className="text-muted-foreground mt-1 text-xs">{group.workItems} ажил · {group.pendingCheck} шалгалт хүлээж буй</p><p className="mt-1 text-xs">Одоогийн инженер: {group.siteEngineer?.name ?? "Оноогоогүй"}{group.needsAssignment && group.siteEngineer && " · эрх эсвэл хамрах барилгыг шалгана уу"}</p></div>
                <div className="flex gap-2">
                  <select aria-label={`${group.groupName} — талбайн инженер`} value={selected} disabled={save.isPending} className="border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-2 text-sm" onChange={(e) => setPicked((old) => ({ ...old, [group.groupId]: e.target.value }))}>
                    <option value="">Оноогоогүй</option>
                    {group.siteEngineer && !list.data?.engineers.some((u) => String(u.id) === current) && <option value={current} disabled>{group.siteEngineer.name} · эрхгүй</option>}
                    {list.data?.engineers.map((u) => <option key={u.id} value={String(u.id)}>{u.name}{u.position ? ` · ${u.position}` : ""}</option>)}
                  </select>
                  <Button variant="outline" disabled={selected === current || save.isPending} onClick={() => save.mutate({ groupId: group.groupId, engineerId: selected })}>Хадгалах</Button>
                </div>
              </div>;
            })}
          </div>
        </>
      )}
    </section>
  );
}
