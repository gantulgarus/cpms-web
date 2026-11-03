"use client";

/**
 * Ажлын бүлэг бүрийг туслан гүйцэтгэгчид оноох.
 *
 * ЯАГААД ТУСДАА ДЭЛГЭЦ: `ApplyBlockDesign` нь ажлыг ХАРИУЦАГЧГҮЙ үүсгэдэг.
 * Оноохгүй бол гүйцэтгэгч кодоороо нэвтрээд «Танд оноогдсон ажил алга» гэж
 * харна — нэвтрэх код, хамрах хүрээ, явц оруулах бүхэл функц өгөгдөлгүй
 * үлдэнэ.
 *
 * Оноолт нь БҮЛГЭЭР явна: «Гоо Засал ХХК — дотор засал бүхэлдээ». Нэг нэгээр
 * нь 3,290 мөрийг оноох нь боломжгүй тул энэ дэлгэц бүлгээр ажиллана.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { toast } from "sonner";

import { BulkAssignmentPanel } from "@/components/bulk-assignment-panel";
import { SiteEngineerAssignmentPanel } from "@/components/site-engineer-assignment-panel";
import { InspectorAssignmentPanel } from "@/components/inspector-assignment-panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assignments, blocks, contractors } from "@/lib/api/endpoints";
import type { Uuid } from "@/lib/api/types";
import { useMe } from "@/lib/api/use-me";

function ContractorAssignmentsPanel({ blockId }: { blockId: string }) {
  const qc = useQueryClient();
  const { me } = useMe();
  const canAssign = Boolean(me?.canManageContractors);

  /** Бүлэг бүрт сонгосон гүйцэтгэгч — хадгалахаас өмнөх төлөв. */
  const [picked, setPicked] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: ["assignments", blockId],
    queryFn: () => assignments.forBlock(blockId),
  });
  const contractorList = useQuery({
    queryKey: ["contractors"],
    queryFn: () => contractors.list(),
    enabled: canAssign,
  });

  const assign = useMutation({
    mutationFn: ({ groupId, contractorId }: { groupId: Uuid; contractorId: string }) =>
      assignments.assignGroup(blockId, {
        workTypeGroupId: groupId,
        contractorId: contractorId || null,
      }),
    onSuccess: (res) => {
      toast.success(
        res.affected > 0
          ? `${res.affected} ажилд хариуцагч оноогдлоо.`
          : "Оноох шинэ ажил олдсонгүй — бүгд хариуцагчтай байна.",
      );
      qc.invalidateQueries({ queryKey: ["assignments", blockId] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["work-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data ?? [];
  const totalUnassigned = rows.reduce((a, r) => a + r.unassigned, 0);

  return (
    <div>
      <h2 className="mb-3 font-medium">Гүйцэтгэгч хуваарилах</h2>
      {totalUnassigned > 0 && (
        <div className="bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 mb-4 flex gap-2 rounded-lg p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>{totalUnassigned.toLocaleString("mn-MN")} ажил</strong> хариуцагчгүй байна.
            Эдгээрийг туслан гүйцэтгэгч харахгүй, өөрөө гүйцэтгэл оруулах боломжгүй.
          </span>
        </div>
      )}

      {list.isLoading ? (
        <LoadingRows rows={5} />
      ) : list.error ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="Ажил алга" description="Энэ барилгад ажил үүсээгүй байна." />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ажлын бүлэг</TableHead>
                <TableHead className="text-right">Ажил</TableHead>
                <TableHead>Одоогийн хариуцагч</TableHead>
                {canAssign && <TableHead className="w-72">Оноох</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.groupId}>
                  <TableCell className="font-medium">{r.groupName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.workItems.toLocaleString("mn-MN")}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.contractors.map((c) => (
                        <span key={c.id} className="text-sm">
                          {c.name}
                          <span className="text-muted-foreground ml-1 text-xs tabular-nums">
                            {c.workItems}
                          </span>
                        </span>
                      ))}
                      {r.unassigned > 0 && (
                        <ToneBadge tone="amber">{r.unassigned} хариуцагчгүй</ToneBadge>
                      )}
                    </div>
                  </TableCell>

                  {canAssign && (
                    <TableCell>
                      <div className="flex gap-2">
                        <select
                          value={picked[r.groupId] ?? ""}
                          onChange={(e) =>
                            setPicked((p) => ({ ...p, [r.groupId]: e.target.value }))
                          }
                          className="border-input bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-sm"
                        >
                          <option value="">Гүйцэтгэгч сонгох…</option>
                          {(contractorList.data?.data ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!picked[r.groupId] || assign.isPending || r.unassigned === 0}
                          onClick={() =>
                            assign.mutate({
                              groupId: r.groupId,
                              contractorId: picked[r.groupId],
                            })
                          }
                          // Аль хэдийн хариуцагчтай ажлыг чимээгүй шилжүүлэхгүй.
                          title={
                            r.unassigned === 0
                              ? "Энэ бүлгийн бүх ажил хариуцагчтай байна"
                              : `${r.unassigned} ажилд оноох`
                          }
                        >
                          <Users className="size-3.5" /> Оноох
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <p className="text-muted-foreground mt-3 text-sm">
        Зөвхөн <strong>хариуцагчгүй</strong> ажилд ононо — өөр компанид зориудаар оноосон ажил
        хэвээр үлдэнэ. Гүйцэтгэл бүртгэгдсэн ажлын хариуцагчийг солих боломжгүй.
      </p>
    </div>
  );
}


function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export default function AssignmentsPage() {
  const { blockId } = useParams<{ blockId: string }>();
  const { me } = useMe();
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => "");
  const block = useQuery({ queryKey: ["block", blockId], queryFn: () => blocks.get(blockId) });
  const defaultTab = me?.canManageContractors ? "contractors" : me?.canAssignInspectors ? "site-engineers" : "contractors";
  const requested = hash.slice(1);
  const active = requested === "contractors" ? "contractors"
    : me?.canAssignInspectors && ["site-engineers", "inspectors"].includes(requested) ? requested : defaultTab;

  return (
    <div>
      <PageHeader title="Хариуцагч оноох"
        crumbs={[{ label: "Барилгууд", href: "/blocks" }, { label: block.data?.name ?? "Барилга", href: `/blocks/${blockId}` }, { label: "Хариуцагч" }]}
        description="Хэнийг оноохоо сонгоод тухайн төрлийн хуваарилалтыг хийнэ." />
      {block.error ? <ErrorState message={(block.error as Error).message} onRetry={() => block.refetch()} /> : (
        <Tabs value={active} onValueChange={(value) => { window.location.hash = String(value); }}>
          <TabsList className="mb-4 h-auto! w-full flex-wrap justify-start gap-2 p-1" aria-label="Хариуцагчийн төрөл">
            <TabsTrigger className="min-h-11 px-3" value="contractors">Гүйцэтгэгч · Гүйцэтгэл оруулах</TabsTrigger>
            {me?.canAssignInspectors && <TabsTrigger className="min-h-11 px-3" value="site-engineers">Талбайн инженер · Шалгах</TabsTrigger>}
            {me?.canAssignInspectors && <TabsTrigger className="min-h-11 px-3" value="inspectors">Хяналтын инженер · Батлах</TabsTrigger>}
          </TabsList>
          <TabsContent value="contractors" keepMounted>
            {me?.canManageContractors && <BulkAssignmentPanel key={`${blockId}:contractor`} blockId={blockId} blockName={block.data?.name ?? "Барилга"} mode="contractor" />}
            <details className="rounded-xl border p-4" open={!me?.canManageContractors}>
              <summary className="cursor-pointer text-sm font-medium">Бүлэг бүрийн гүйцэтгэгчийг харах, тусад нь оноох</summary>
              <div className="mt-4"><ContractorAssignmentsPanel key={blockId} blockId={blockId} /></div>
            </details>
          </TabsContent>
          {me?.canAssignInspectors && <TabsContent value="site-engineers" keepMounted>
            <BulkAssignmentPanel key={`${blockId}:site`} blockId={blockId} blockName={block.data?.name ?? "Барилга"} mode="site" />
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer text-sm font-medium">Бүлэг бүрийн инженерийг харах, өөрчлөх эсвэл оноолтыг авах</summary>
              <div className="mt-4"><SiteEngineerAssignmentPanel key={blockId} blockId={blockId} /></div>
            </details>
          </TabsContent>}
          {me?.canAssignInspectors && <TabsContent value="inspectors" keepMounted><InspectorAssignmentPanel key={blockId} blockId={blockId} /></TabsContent>}
        </Tabs>
      )}
    </div>
  );
}
