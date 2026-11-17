"use client";

import { ChevronRight, Layers } from "lucide-react";

export function AssignmentGroup({ name, subgroups, workItems, missing, children }: {
  name: string;
  subgroups?: number;
  workItems: number;
  missing?: number;
  children: React.ReactNode;
}) {
  return (
    <details className="group/assignment overflow-hidden rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform group-open/assignment:rotate-90" />
        <Layers aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{name}</span>
          <span className="text-muted-foreground mt-1 block text-xs">{subgroups !== undefined && <>{subgroups} дэд бүлэг · </>}{workItems} ажил</span>
        </span>
        {Boolean(missing) && <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">{missing} оноогоогүй</span>}
      </summary>
      <div className="border-t bg-muted/15 px-3 py-2 sm:px-5">{children}</div>
    </details>
  );
}
