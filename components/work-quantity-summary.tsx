import { ArrowRight } from "lucide-react";

import { ProgressBar } from "@/components/progress-bar";
import type { WorkItem } from "@/lib/api/types";
import { formatQty } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function WorkQuantitySummary({ item }: { item: WorkItem }) {
  const twoStage = (item.inspectionStages ?? 2) >= 2;
  const steps = [
    { label: "Мэдээлсэн", value: item.reportedQty, hint: "Гүйцэтгэгчийн бүртгэсэн хэмжээ" },
    ...(twoStage ? [{ label: "Шалгагдсан", value: item.checkedQty, hint: "1-р шатны шалгалт давсан" }] : []),
    { label: "Батлагдсан", value: item.acceptedQty, hint: twoStage ? "2-р шатны эцсийн батлалт" : "Эцэслэн баталсан хэмжээ" },
  ];

  return (
    <div className="space-y-4">
      <dl className="flex flex-wrap justify-between gap-x-6 gap-y-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-baseline gap-2"><dt className="text-muted-foreground">Төлөвлөсөн</dt><dd className="font-medium tabular-nums">{formatQty(item.plannedQty, item.unit)}</dd></div>
        <div className="flex flex-wrap items-baseline gap-2"><dt className="text-muted-foreground">Батлуулах үлдэгдэл</dt><dd className="font-medium tabular-nums">{formatQty(item.remainingQty, item.unit)}</dd></div>
      </dl>

      <ol className={cn("grid gap-3", twoStage ? "sm:grid-cols-3" : "sm:grid-cols-2")} aria-label="Гүйцэтгэлийн үе шатууд">
        {steps.map((step, index) => (
          <li key={step.label} className={cn("min-w-0 rounded-lg border p-3", index === steps.length - 1 && item.acceptedQty > 0 && "border-emerald-500/30 bg-emerald-500/5")}>
            <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
              <span>{index + 1}. {step.label}</span>
              {index < steps.length - 1 && <ArrowRight className="size-3.5 rotate-90 sm:rotate-0" aria-hidden="true" />}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
              <span className="break-all text-2xl font-semibold tracking-tight tabular-nums">{formatQty(step.value)}</span>
              <span className="text-muted-foreground text-sm">{item.unit}</span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{step.hint}</p>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-xs">Эдгээр нь үе шат бүрийн хуримтлагдсан хэмжээ; хооронд нь нэмж тооцохгүй.</p>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Батлагдсан явц</span>
          <span className="font-semibold tabular-nums">{item.plannedQty > 0 ? `${item.percentage}%` : "—"}</span>
        </div>
        {item.plannedQty > 0 ? <ProgressBar value={item.percentage} className="h-2" /> : <div className="bg-muted h-2 rounded-full" aria-hidden="true" />}
      </div>
    </div>
  );
}
