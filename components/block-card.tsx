"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Stamp } from "lucide-react";

import { DashboardCount } from "@/components/dashboard-count";
import { ProgressBar } from "@/components/progress-bar";
import type { Block, DashboardBlock } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Shared building card for the dashboard and the block list. */
export function BlockCard({ block, stat, loading = false }: {
  block: Block | DashboardBlock;
  stat?: DashboardBlock;
  loading?: boolean;
}) {
  const summary = stat ?? ("percentage" in block ? block : undefined);
  const percentage = summary?.percentage;
  const overdue = summary?.overdue ?? 0;
  const pending = summary?.pendingInspections ?? 0;

  return (
    <Link
      href={`/blocks/${block.id}`}
      className={cn(
        "group flex h-full flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-ring",
        overdue > 0 ? "border-red-500/40" : pending > 0 && "border-amber-500/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium" title={block.name}>{block.name}</h3>
          {"purpose" in block && <p className="text-muted-foreground mt-1 truncate text-xs">{block.purpose}</p>}
          {"floors" in block && <p className="text-muted-foreground mt-1 text-xs">{block.floors} давхар{block.unitCount > 0 && ` · ${block.unitCount} айл`}</p>}
        </div>
        <ArrowUpRight className="text-muted-foreground size-4 shrink-0 transition-colors group-hover:text-foreground" aria-hidden="true" />
      </div>

      <div className="mt-auto space-y-2">
        <div className="flex items-end justify-between gap-3">
          <span className="text-muted-foreground text-xs">Батлагдсан явц</span>
          <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">
            <DashboardCount value={percentage} loading={loading} />{percentage !== undefined && <span className="ml-0.5 text-sm font-normal text-muted-foreground">%</span>}
          </span>
        </div>
        {percentage !== undefined ? <ProgressBar value={percentage} className="h-2" /> : <div className="bg-muted h-2 rounded-full" aria-hidden="true" />}
        <p className="text-muted-foreground min-h-4 text-xs tabular-nums">
          {summary
            ? `${summary.totalItems.toLocaleString("mn-MN")} ажлаас ${summary.completedItems.toLocaleString("mn-MN")} дууссан${summary.inProgressItems > 0 ? ` · ${summary.inProgressItems.toLocaleString("mn-MN")} явцтай` : ""}`
            : loading ? "Явцын мэдээлэл ачаалж байна…" : "Явцын мэдээлэл тодорхойгүй"}
        </p>
      </div>

      <div className="flex min-h-7 flex-wrap items-center gap-2 border-t pt-3 text-xs">
        {overdue > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-red-700 dark:text-red-400"><AlertTriangle className="size-3.5" aria-hidden="true" />{overdue} хоцорсон</span>}
        {pending > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-400"><Stamp className="size-3.5" aria-hidden="true" />{pending} шалгалт хүлээж буй</span>}
        {summary && overdue === 0 && pending === 0 && <span className="text-muted-foreground">Хоцролт, хүлээгдэж буй шалгалтгүй</span>}
        {!summary && <span className="text-muted-foreground">{loading ? "Төлөв шалгаж байна…" : "Төлөв тодорхойгүй"}</span>}
      </div>
    </Link>
  );
}
