"use client";

import Link from "next/link";
import { ArrowRight, ClipboardCheck, Search, Stamp } from "lucide-react";

import { DashboardCount } from "@/components/dashboard-count";
import { cn } from "@/lib/utils";
import type { Me } from "@/lib/api/use-me";
import type { QueueCounts } from "@/lib/api/types";

export function DashboardActions({ me, counts, loading }: {
  me: Me;
  counts?: QueueCounts;
  loading: boolean;
}) {
  const actions: {
    title: string;
    detail: string;
    href: string;
    count?: number;
    counted?: boolean;
    icon: typeof Search;
  }[] = [];

  if (me.canReportProgress) actions.push({
    title: "Гүйцэтгэл оруулах",
    icon: ClipboardCheck,
    detail: "Ажлаа сонгоод хийсэн хэмжээ болон зургаа оруулна.",
    href: "/my-work",
  });
  if (me.canCheck) actions.push({
    title: "Шалгах",
    icon: Search,
    detail: "1-р шат: талбай дээр хийсэн ажлыг шалгана.",
    href: "/queue?type=check",
    count: counts?.check,
    counted: true,
  });
  if (me.canInspect) actions.push({
    title: "Батлах",
    icon: Stamp,
    detail: "2-р шат: шалгагдсан гүйцэтгэлийг эцэслэн батална.",
    href: "/queue?type=approval",
    count: counts?.approval,
    counted: true,
  });

  if (actions.length === 0) return null;

  return (
    <section aria-labelledby="dashboard-actions-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="dashboard-actions-heading" className="font-medium">Миний хийх ажил</h2>
        {me.canAssignInspectors && <Link href="/blocks" className="text-primary text-sm hover:underline">Талбайн инженер хуваарилах →</Link>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => {
          const pending = typeof action.count === "number" && action.count > 0;
          const Icon = action.icon;
          return (
            <Link
              key={action.title}
              href={action.href}
              className={cn(
                "group flex h-full flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-ring",
                pending && "border-amber-500/40",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Icon className="text-muted-foreground size-4" aria-hidden="true" />
                {action.title}
              </div>
              {action.counted ? (
                <div className={cn("flex items-baseline gap-2", pending ? "text-amber-800 dark:text-amber-400" : "text-muted-foreground")}>
                  <span className="text-4xl leading-none font-semibold tracking-tight"><DashboardCount value={action.count} loading={loading} /></span>
                  <span className="text-sm">ажил</span>
                </div>
              ) : <p className="text-lg font-semibold">Хийсэн ажлаа бүртгэх</p>}
              <p className="text-muted-foreground text-sm">{action.detail}</p>
              <span className="mt-auto flex items-center justify-between border-t pt-3 text-sm font-medium">
                {action.counted ? `${action.title} ажлуудыг нээх` : "Ажлаа сонгох"}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
