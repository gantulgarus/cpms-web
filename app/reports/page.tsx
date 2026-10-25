"use client";

/**
 * Гүйцэтгэлийн акт.
 *
 * Гүйцэтгэгч × хугацааны хооронд ЗАХИАЛАГЧИЙН ХЯНАЛТАД батлагдсан ажлын
 * жагсаалт. Гэрээний албанд тооцоо хийхэд шууд хэрэглэгдэнэ.
 *
 * ЯАГААД ШАЛГАЛТААС ГАРНА: ажлын мөр дээрх хуримтлагдсан «батлагдсан»
 * тоо нь ХЭЗЭЭ батлагдсаныг хэлдэггүй тул хугацаагаар таслах боломжгүй.
 * Шалгалтын бичлэг бүр огноо, шалгасан хүнтэй — актад яг тэр хэрэгтэй.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";

import { FormField } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { blocks as blocksApi, contractors, reports } from "@/lib/api/endpoints";
import type { AcceptanceParams } from "@/lib/api/endpoints";
import type { AcceptanceReport, InspectionStage, UnitTotal } from "@/lib/api/types";
import { useMe } from "@/lib/api/use-me";
import { useProject } from "@/lib/api/use-project";
import { formatDate, formatQty, todayInProjectZone } from "@/lib/domain";
import { cn } from "@/lib/utils";

/*
 * Акт нь ЗӨВХӨН 2-р шатаар гарна.
 *
 * 1-р шат (талбайн инженер шалгасан) нь акт БИШ: тэр хэмжээг хяналтын
 * инженер хараахан баталгаажуулаагүй. Хольвол баталгаажаагүй ажил актад
 * орж, төлбөр түүн дээр бодогдох эрсдэлтэй. Тиймээс шат нь сонголт биш,
 * тогтмол.
 */
const ACT_STAGE: InspectionStage = "final_approval";

/** Сарын эхэн — актыг ихэвчлэн сараар гаргадаг. */
function monthStart(): string {
  return todayInProjectZone().slice(0, 8) + "01";
}

/** Актад хэдэн барилгын ажил орсон бэ. */
function mixedBlocks(report: AcceptanceReport): number {
  const names = new Set<string>();

  for (const group of report.groups) {
    for (const row of group.rows) names.add(row.blockName);
  }

  return names.size;
}

export default function AcceptanceReportPage() {
  const { me } = useMe();
  const { project } = useProject();
  const projectId = project?.id;

  const [contractorId, setContractorId] = useState("");
  /*
   * БЛОКООР ШҮҮХ.
   *
   * Акт нь ажлын ТӨРЛӨӨР бүлэглэгддэг тул нэг бүлгийн дотор олон
   * блокийн мөр холилдоно. Ихэнх тохиолдолд энэ нь буруу: тохиролцоо
   * нь БЛОК тус бүрээр байгуулагддаг бөгөөд нэг гүйцэтгэгч хоёр блокт
   * өөр нэгж үнэтэй байж болно. Холимог актыг зөв үнэлэх аргагүй.
   */
  const [blockId, setBlockId] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayInProjectZone);
  const stage = ACT_STAGE;

  const contractorsQuery = useQuery({
    queryKey: ["contractors"],
    queryFn: () => contractors.list(),
    // Гүйцэтгэгч зөвхөн өөрийн актыг гаргах тул жагсаалт хэрэггүй.
    enabled: !me?.contractorId,
  });

  const blocksQuery = useQuery({
    queryKey: ["blocks", projectId],
    queryFn: () => blocksApi.listForProject(projectId!),
    enabled: Boolean(projectId),
  });

  const params: AcceptanceParams = {
    contractorId: contractorId || undefined,
    blockId: blockId || undefined,
    from,
    to,
    stage,
  };
  const validRange = Boolean(from && to && from <= to);

  const reportQuery = useQuery({
    queryKey: ["acceptance", projectId, contractorId, blockId, from, to, stage],
    queryFn: () => reports.acceptance(projectId!, params),
    enabled: Boolean(projectId) && validRange,
  });

  const download = useMutation({
    mutationFn: () => reports.acceptanceXlsx(projectId!, params),
    onSuccess: () => toast.success("Excel файл татагдлаа"),
    onError: (e: Error) => toast.error(e.message),
  });

  const report = reportQuery.data;
  const empty = report && report.groups.length === 0;

  return (
    <div>
      <PageHeader
        title="Гүйцэтгэлийн акт"
        description="Тухайн хугацаанд баталгаажсан ажлын жагсаалт — тооцоо хийхэд бэлэн."
        actions={
          <Button
            disabled={!validRange || !report || empty || download.isPending}
            onClick={() => download.mutate()}
          >
            <Download className="size-4" />
            {download.isPending ? "Бэлтгэж байна…" : "Excel татах"}
          </Button>
        }
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
          {!me?.contractorId && (
            <FormField label="Гүйцэтгэгч">
              <select
                value={contractorId}
                onChange={(e) => setContractorId(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">Бүх гүйцэтгэгч</option>
                {(contractorsQuery.data?.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          {/* Блокоор шүүх — тохиролцоо блок тус бүрээр байгуулагддаг тул
              акт ч ихэвчлэн нэг блокоор гарах ёстой. */}
          <FormField label="Барилга">
            <select
              value={blockId}
              onChange={(e) => setBlockId(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="">Бүх барилга</option>
              {(blocksQuery.data?.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Эхлэх огноо" required>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormField>

          <FormField label="Дуусах огноо" required>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-invalid={!validRange || undefined}
            />
          </FormField>
        </CardContent>
      </Card>

      {!validRange ? (
        <ErrorState message="Дуусах огноо эхлэхээсээ өмнө байж болохгүй." />
      ) : reportQuery.isLoading ? (
        <LoadingRows rows={6} />
      ) : reportQuery.error ? (
        <ErrorState
          message={(reportQuery.error as Error).message}
          onRetry={() => reportQuery.refetch()}
        />
      ) : empty ? (
        <EmptyState
          title="Энэ хугацаанд батлагдсан ажил алга"
          description="Огноо эсвэл гүйцэтгэгчээ өөрчилж үзнэ үү. Зөвхөн баталгаажсан ажил актад ордог."
        />
      ) : report ? (
        <div className="space-y-6">
          <Summary report={report} />

          {/*
            ОЛОН БАРИЛГА ХОЛИЛДСОНЫГ ХЭЛНЭ.

            Акт нь ажлын ТӨРЛӨӨР бүлэглэгддэг тул нэг бүлгийн нийлбэр
            хэд хэдэн барилгын тоог нийлүүлж бодно. Тохиролцоо нь блок
            тус бүрээр байгуулагддаг — нэг гүйцэтгэгч хоёр блокт өөр
            нэгж үнэтэй байж болох тул холимог актыг зөв үнэлэх аргагүй.
          */}
          {!blockId && mixedBlocks(report) > 1 && (
            <Card className="border-amber-500/50 bg-amber-500/5">
              <CardContent className="flex gap-3 pt-6 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {mixedBlocks(report)} барилгын ажил нэг актад холилдсон
                  </p>
                  <p className="text-muted-foreground">
                    Бүлгийн нийлбэр барилгуудыг нийлүүлж бодож байна. Тохиролцоо нь блок тус
                    бүрээр байгуулагддаг тул актыг барилгаар нь салгаж гаргах нь зөв.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {report.groups.map((g) => (
            <Card key={g.name} className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-sm font-medium">{g.name}</h2>
                <UnitTotals totals={g.totals} />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">№</TableHead>
                    <TableHead>Барилга</TableHead>
                    <TableHead>Байршил</TableHead>
                    <TableHead>Ажлын нэр</TableHead>
                    <TableHead className="text-right">Батлагдсан</TableHead>
                    <TableHead>Огноо</TableHead>
                    {/* «Баталсан», «шалгасан» БИШ: актад зөвхөн 2-р шат
                        ордог тул энэ хүн бол баталсан хяналтын инженер. */}
                    <TableHead>Баталсан</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.rows.map((r, i) => (
                    <TableRow key={r.inspectionId}>
                      <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell>{r.blockName}</TableCell>
                      <TableCell className="text-muted-foreground">{r.locationPath}</TableCell>
                      <TableCell className="font-medium">{r.workTypeName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQty(r.acceptedQty)}{" "}
                        <span className="text-muted-foreground">{r.unit}</span>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDate(r.inspectedAt)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.inspectorName ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Summary({ report }: { report: AcceptanceReport }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
        <div>
          <div className="text-lg font-semibold">{report.contractor?.name ?? "Бүх гүйцэтгэгч"}</div>
          <div className="text-muted-foreground text-sm">
            {formatDate(report.period.from)} — {formatDate(report.period.to)} ·{" "}
            {report.workItemCount} ажил · {report.inspectionCount} шалгалт
          </div>
        </div>
        <div className="text-right">
          <div className="text-muted-foreground mb-1 text-xs">Нийт дүн</div>
          <UnitTotals totals={report.totals} large />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Нэгж тус бүрийн дүн.
 *
 * м² ба м³-ийг нэг тоо болгож нэмэх нь утгагүй тул нэгж бүр тусдаа
 * харагдана — нэг «нийт» тоо ОГТ байхгүй.
 */
function UnitTotals({ totals, large }: { totals: UnitTotal[]; large?: boolean }) {
  if (totals.length === 0) return <span className="text-muted-foreground text-sm">—</span>;

  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1", large ? "justify-end" : "")}>
      {totals.map((t) => (
        <span
          key={t.unit}
          className={cn("tabular-nums", large ? "text-lg font-semibold" : "text-sm")}
        >
          {formatQty(t.qty)}{" "}
          <span className="text-muted-foreground text-sm font-normal">{t.unit}</span>
        </span>
      ))}
    </div>
  );
}
