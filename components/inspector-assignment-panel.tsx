"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AssignInspectorDialog } from "@/components/assign-inspector-dialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workItems } from "@/lib/api/endpoints";
import type { WorkItem } from "@/lib/api/types";

const PAGE_SIZE = 25;

export function InspectorAssignmentPanel({ blockId }: { blockId: string }) {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const list = useQuery({
    queryKey: ["work-items", blockId, "inspector-assignment", search, onlyMissing, page],
    queryFn: () => workItems.listForBlock(blockId, {
      search: search || undefined,
      inspectorId: onlyMissing ? "none" : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  });
  const total = list.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-4" aria-labelledby="inspector-assignment-heading">
      <div>
        <h2 id="inspector-assignment-heading" className="text-lg font-semibold">Хяналтын инженер оноох · Эцсийн батлалт</h2>
        <p className="text-muted-foreground mt-1 text-sm">Хяналтын инженер шалгагдсан гүйцэтгэлийг эцэслэн батална. Ажлаа хайж олоод тухайн ажилд инженер оноох эсвэл солино.</p>
      </div>
      <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">Энд хийсэн оноолт зөвхөн сонгосон ажилд хамаарна. Төсвийг дахин импортлоход энэ оноолт дарагдаж болно.</p>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(draft.trim()); setPage(1); }}>
        <Input aria-label="Хяналтын инженер оноох ажлыг хайх" placeholder="Ажлын нэрээр хайх…" value={draft} maxLength={150} onChange={(event) => setDraft(event.target.value)} />
        <Button type="submit" variant="outline">Хайх</Button>
      </form>
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
      {editing && <AssignInspectorDialog key={editing.id} item={editing} open onOpenChange={(open) => { if (!open) setEditing(null); }} />}
    </section>
  );
}
