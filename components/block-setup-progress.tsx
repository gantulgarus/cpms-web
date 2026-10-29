"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { siteEngineerAssignments, workItems } from "@/lib/api/endpoints";
import type { BlockSummary } from "@/lib/api/types";
import type { Me } from "@/lib/api/use-me";

export function BlockSetupProgress({ blockId, totals, me, onAdd, onQuantities, onSchedule, onInspectors, onWork }: {
  blockId: string;
  totals: BlockSummary["totals"];
  me: Me;
  onAdd: () => void;
  onQuantities: () => void;
  onSchedule: () => void;
  onInspectors: () => void;
  onWork: () => void;
}) {
  // Only the server's total is needed; never download every work item to count.
  const inspectors = useQuery({
    queryKey: ["work-items", blockId, { inspectorId: "none", pageSize: 1 }],
    queryFn: () => workItems.listForBlock(blockId, { inspectorId: "none", pageSize: 1 }),
    enabled: totals.workItems > 0,
  });
  const siteAssignments = useQuery({
    queryKey: ["site-engineer-assignments", blockId],
    queryFn: () => siteEngineerAssignments.forBlock(blockId),
    enabled: totals.workItems > 0 && me.canAssignInspectors,
  });
  const unassignedGroups = siteAssignments.isError ? undefined : siteAssignments.data?.groups.filter((g) => g.needsAssignment).length;
  const hasWork = totals.workItems > 0;
  const missingInspectors = inspectors.isError ? undefined : inspectors.data?.meta.total;
  const steps = [
    { title: "Ажлууд үүсгэх", done: hasWork, detail: hasWork ? `${totals.workItems} ажил үүссэн` : "Загвар ашиглах эсвэл ажлаа гараар нэмнэ үү.", allowed: me.canEditPlan, action: onAdd },
    { title: "Тоо хэмжээ оруулах", done: hasWork && totals.unmeasuredItems === 0, detail: !hasWork ? "Эхлээд ажлуудаа үүсгэнэ үү." : totals.unmeasuredItems === undefined ? "Тоо хэмжээг шалгах шаардлагатай" : `${totals.unmeasuredItems} ажилд тоо хэмжээ дутуу`, allowed: me.canEditPlan, action: onQuantities },
    { title: "Хугацаа төлөвлөх", done: hasWork && Boolean(totals.plannedStartDate && totals.plannedEndDate), detail: "Ажлын эхлэх, дуусах хугацааг шалгана уу.", allowed: me.canEditPlan, action: onSchedule },
    { title: "Гүйцэтгэгч оноох", done: hasWork && totals.unassignedItems === 0, detail: !hasWork ? "Эхлээд ажлуудаа үүсгэнэ үү." : totals.unassignedItems === undefined ? "Хариуцагчийг шалгах шаардлагатай" : `${totals.unassignedItems} ажил гүйцэтгэгчгүй`, allowed: me.canManageContractors, href: `/blocks/${blockId}/assignments` },
    { title: "Талбайн инженер хуваарилах", done: hasWork && unassignedGroups === 0, detail: !hasWork ? "Эхлээд ажлуудаа үүсгэнэ үү." : siteAssignments.isError ? "Хуваарилалтын мэдээллийг авч чадсангүй" : unassignedGroups === undefined ? "Хуваарилалтыг шалгана уу" : `${unassignedGroups} бүлэгт талбайн инженер дутуу`, allowed: me.canAssignInspectors, href: `/blocks/${blockId}/assignments#site-engineers` },
    { title: "Хяналтын инженер оноох", done: hasWork && missingInspectors === 0, detail: !hasWork ? "Эхлээд ажлуудаа үүсгэнэ үү." : inspectors.isError ? "Тоо авч чадсангүй. Дарж дахин шалгана уу." : missingInspectors === undefined ? "Шалгаж байна…" : `${missingInspectors} ажилд инженер оноогоогүй`, allowed: me.canAssignInspectors, action: inspectors.isError ? () => { void inspectors.refetch(); } : onInspectors },
  ];
  const completed = steps.filter((step) => step.done).length;
  const ready = completed === steps.length;

  return (
    <Card className="mb-6 gap-4 p-4" aria-label="Блокийн тохиргооны явц">
      <div>
        <h2 className="font-medium">{ready ? "Гүйцэтгэл бүртгэхэд бэлэн" : "Блокоо ажил эхлэхэд бэлдэе"}</h2>
        <p className="text-muted-foreground text-sm">{completed}/{steps.length} алхам бэлэн. {ready ? "Ажлаа сонгоод гүйцэтгэлээ бүртгэнэ үү." : "Дутуу алхам дээр дарж тохируулна уу. Эрхгүй алхмыг хариуцсан ажилтнаар хийлгэнэ."}</p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((step, index) => {
          const content = <><span className="flex items-center gap-2 font-medium">{step.done ? <Check className="size-4 text-emerald-600" aria-label="Бэлэн" /> : <span className="text-muted-foreground">{index + 1}.</span>}{step.title}</span><span className="text-muted-foreground mt-1 block text-xs">{step.done ? "Бэлэн · шалгах" : step.detail}</span></>;
          const style = "block h-full rounded-lg border p-3 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring";
          return <li key={step.title}>{step.allowed && (hasWork || index === 0) ? step.href ? <Link href={step.href} className={style}>{content}</Link> : <button type="button" className={`${style} w-full`} onClick={step.action}>{content}</button> : <div className="h-full rounded-lg border p-3 text-sm">{content}</div>}</li>;
        })}
      </ol>
      {ready && me.canReportProgress && <Button className="self-start" onClick={onWork}>Гүйцэтгэл оруулах ажлаа сонгох <ArrowRight className="size-4" /></Button>}
    </Card>
  );
}
