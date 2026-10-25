"use client";

/**
 * Нэг блокийн карт.
 *
 * ХҮСНЭГТЭЭС ЯЛГАРАХ НЬ: явцын хувь, хоцролт, батлах хүлээлт гурвыг
 * ЗЭРЭГ харуулна. Хүснэгтэд эдгээр нь нарийн баганууд болж тарж,
 * «аль барилга анхаарал шаардаж байна» гэдэг нь харцаар мэдэгдэхгүй.
 *
 * 75 барилгын цогцолборт энэ нь гол асуулт.
 */
import Link from "next/link";
import { AlertTriangle, Stamp } from "lucide-react";

import { ProgressBar } from "@/components/progress-bar";
import { Card } from "@/components/ui/card";
import type { Block, DashboardBlock } from "@/lib/api/v2/types";
import { cn } from "@/lib/utils";

export function BlockCard({
  block,
  stat,
  loading,
}: {
  block: Block;
  stat?: DashboardBlock;
  /** Нэгтгэл хараахан ирээгүй — хувийг «…» гэж харуулна. */
  loading?: boolean;
}) {
  const percentage = stat?.percentage ?? 0;
  const overdue = stat?.overdue ?? 0;
  const pending = stat?.pendingInspections ?? 0;

  return (
    <Card
      className={cn(
        "hover:border-foreground/20 relative p-4 transition-colors",
        // Хоцролттой барилгыг ХАРЦААР ялгана — жагсаалт урт болох тусам
        // энэ нь цорын гагц зам.
        overdue > 0 && "border-red-500/40",
      )}
    >
      {/*
        Бүтэн картыг дарж болно. Холбоосыг картын хэмжээгээр тэлэх нь
        жижиг нэр рүү онилохоос хавьгүй амар.
      */}
      <Link href={`/blocks/${block.id}`} className="absolute inset-0 rounded-xl" aria-label={block.name}>
        <span className="sr-only">{block.name}</span>
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{block.name}</div>
          <div className="text-muted-foreground truncate text-xs">{block.purpose}</div>
        </div>
        <div className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
          {block.floors} давхар
          {block.unitCount > 0 && (
            <div>
              {block.unitCount} айл
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <ProgressBar value={percentage} className="flex-1" />
        <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums">
          {loading ? "…" : `${percentage}%`}
        </span>
      </div>

      {/* Анхаарал шаардах тоонууд — байхгүй бол мөр огт гарахгүй, хоосон
          «0» нь зай эзэлж утга өгөхгүй. */}
      {(overdue > 0 || pending > 0) && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {overdue > 0 && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <AlertTriangle className="size-3.5" />
              {overdue} хоцорсон
            </span>
          )}
          {pending > 0 && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Stamp className="size-3.5" />
              {pending} батлах
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
