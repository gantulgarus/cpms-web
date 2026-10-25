"use client";

/**
 * Ажил гүйцэтгэх тохиролцооны жагсаалт.
 *
 * МӨНГӨ системд эндээс орно: акт нь тохиролцооны нэгж үнэ дээр тогтоно.
 * Тиймээс «төсвөөс хэдэн хувиар зөрсөн» гэдэг нь жагсаалтын гол багана —
 * нуувал 14.4 саяын ажил 16.2 саяар гэрээлэгдээд хэн ч мэдэхгүй.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, FileText, Plus } from "lucide-react";

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
import { agreements } from "@/lib/api/endpoints";
import type { AgreementStatus } from "@/lib/api/types";
import { useMe } from "@/lib/api/use-me";
import { useProject } from "@/lib/api/use-project";
import { formatDate, formatMoney } from "@/lib/domain";
import { cn } from "@/lib/utils";

const TABS: { value: AgreementStatus | ""; label: string }[] = [
  { value: "", label: "Бүгд" },
  { value: "draft", label: "Драфт" },
  { value: "active", label: "Хүчин төгөлдөр" },
  { value: "completed", label: "Дууссан" },
];

const STATUS_TONE: Record<AgreementStatus, "amber" | "green" | "gray" | "red"> = {
  draft: "amber",
  active: "green",
  completed: "gray",
  cancelled: "red",
};

export default function AgreementsPage() {
  const { me } = useMe();
  const { project } = useProject();
  const [tab, setTab] = useState<AgreementStatus | "">("");

  const list = useQuery({
    queryKey: ["agreements", project?.id, tab],
    queryFn: () => agreements.list(project!.id, tab ? { status: tab } : {}),
    enabled: Boolean(project),
    placeholderData: keepPreviousData,
  });

  const rows = list.data ?? [];

  return (
    <div>
      <PageHeader
        title="Ажил гүйцэтгэх тохиролцоо"
        description="Нэгж үнэ эндээс орно — акт, төлбөр тооцоо тохиролцоон дээр тогтоно."
        actions={
          me?.canManageContractors && (
            <Link href="/agreements/new">
              <Button>
                <Plus className="size-4" /> Шинэ тохиролцоо
              </Button>
            </Link>
          )
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              tab === t.value
                ? "bg-primary text-primary-foreground border-transparent"
                : "hover:bg-accent",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <LoadingRows rows={5} />
      ) : list.error ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Тохиролцоо алга"
          description="Гүйцэтгэгчтэй ажлын тоо хэмжээ, нэгж үнээ тохирсон хуудас эндээс үүснэ."
        />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дугаар</TableHead>
                <TableHead>Гүйцэтгэгч</TableHead>
                <TableHead>Ажил</TableHead>
                <TableHead className="text-right">Дүн</TableHead>
                <TableHead className="text-right">Төсвөөс</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    <Link href={`/agreements/${a.id}`} className="flex items-center gap-1.5">
                      <FileText className="text-muted-foreground size-3.5" />
                      {a.number}
                    </Link>
                    <div className="text-muted-foreground text-xs">
                      {a.blockName} · {formatDate(a.startDate)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.contractorName}
                    <div className="text-muted-foreground text-xs tabular-nums">
                      {a.contractorRegistrationNo ?? "РД алга"}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.scope ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(a.totalAmount)}
                    {a.retentionPercent > 0 && (
                      <div className="text-muted-foreground text-xs">
                        барьцаа {formatMoney(a.retentionAmount)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Зөрүү нь ХАМГИЙН чухал багана: гэрээний үнэ төсвөөс
                        дээш байвал гарын үсэг зурахаас өмнө харагдах ёстой. */}
                    {a.variancePercent == null ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <ToneBadge
                        tone={
                          a.variancePercent > 10
                            ? "red"
                            : a.variancePercent > 0
                              ? "amber"
                              : "green"
                        }
                      >
                        {a.variancePercent > 0 ? "+" : ""}
                        {a.variancePercent}%
                      </ToneBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={STATUS_TONE[a.status]}>{a.statusLabel}</ToneBadge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/agreements/${a.id}`} aria-label={`${a.number} дэлгэрэнгүй`}>
                      <ChevronRight className="text-muted-foreground size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
