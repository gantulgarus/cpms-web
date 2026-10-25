"use client";

/**
 * Блокийн ерөнхий тайлан.
 *
 * ТАВАН ХЭСГИЙГ ЗЭРЭГ ХАРУУЛНА — энэ нь тайлангийн бүхий л утга.
 * «Барилга хэр явж байна» гэсэн асуултад нэг тоо хариулдаггүй: 95%
 * дууссан барилга төсвөө 40% хэтрүүлсэн, 60 хоног хоцорсон байж болно.
 * Гурвуулаа нэг дэлгэцэд харагдаж байж шийдвэр гарна.
 *
 * ХЭЗЭЭ Ч ГАРНА. Зөвхөн дууссан блокт хязгаарлавал хамгийн хэрэгтэй үе
 * нь — явцын дунд — ашиглагдахгүй.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { blocks } from "@/lib/api/v2/endpoints";
import { formatDate, formatMoney } from "@/lib/domain";
import { cn } from "@/lib/utils";

export default function BlockReportPage() {
  const { blockId } = useParams<{ blockId: string }>();

  const query = useQuery({
    queryKey: ["v2-block-report", blockId],
    queryFn: () => blocks.report(blockId),
  });

  const download = useMutation({
    mutationFn: () => blocks.reportSheet(blockId, query.data?.block.buildingNo ?? "blok"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) return <LoadingRows rows={8} />;
  if (query.error) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />;
  }

  const r = query.data!;
  const { progress: p, money: m, schedule: s, quality: q, materials: mat } = r;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Блокийн ерөнхий тайлан"
        crumbs={[
          { label: "Блокууд", href: "/blocks" },
          { label: r.block.name, href: `/blocks/${blockId}` },
          { label: "Тайлан" },
        ]}
        description={`${r.block.name} · ${r.block.floors} давхар · ${r.block.purpose}`}
        actions={
          <Button variant="outline" onClick={() => download.mutate()} disabled={download.isPending}>
            <Download className="size-4" />
            {download.isPending ? "Бэлтгэж байна…" : "Excel татах"}
          </Button>
        }
      />

      {/* --- Гүйцэтгэл --- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Гүйцэтгэл</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <ProgressBar value={p.percentage} className="flex-1" />
            <span className="w-14 text-right text-xl font-medium tabular-nums">
              {p.percentage}%
            </span>
          </div>

          {/* Хувь нь МӨРИЙН дунджаар — м² ба м³ нийлүүлэх нь утгагүй. */}
          <p className="text-muted-foreground text-xs">
            Хувь нь ажил тус бүрийн дунджаар бодогдсон. Тоо хэмжээгээр нэгтгэвэл м³ нь м²-ыг дарна.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Нийт ажил" value={p.workItems} />
            <Stat label="Дууссан" value={p.completed} tone="green" />
            <Stat label="Хүлээгдэж буй" value={p.pending} tone={p.pending ? "amber" : undefined} />
            <Stat label="Буцаагдсан" value={p.returned} tone={p.returned ? "red" : undefined} />
            <Stat label="Тоо хэмжээгүй" value={p.unmeasured} />
          </div>
        </CardContent>
      </Card>

      {/* --- Мөнгө --- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Мөнгө</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/*
            ГУРВАН ҮНЭ зэрэгцэнэ. Төсөв нь жишиг, гэрээ нь амлалт, акт
            нь бодит төлбөр. Зөрүү гарах нь хэвийн — харагдахгүй байх
            нь асуудал.
          */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Amount label="Төсвийн дүн" value={m.budgetAmount} hint="Төлөвлөсөн × төсвийн үнэ" />
            <Amount
              label="Гэрээний дүн"
              value={m.agreedAmount}
              hint={`${m.agreementCount} тохиролцоо`}
              variance={m.agreedVariancePercent}
              varianceLabel="төсвөөс"
            />
            <Amount
              label="Актын дүн"
              value={m.acceptedAmount}
              hint="Батлагдсан × гэрээний үнэ"
              variance={m.acceptedVariancePercent}
              varianceLabel="гэрээнээс"
            />
          </div>

          {m.withoutBudgetPrice > 0 && (
            <p className="text-muted-foreground text-xs">
              {m.withoutBudgetPrice.toLocaleString("mn-MN")} ажилд төсвийн үнэ тавигдаагүй —
              төсвийн дүнд ороогүй.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* --- Хугацаа --- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Хугацаа</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Эхэлсэн" value={formatDate(s.plannedStart?.slice(0, 10))} />
            <Row label="Дуусах (одоогийн)" value={formatDate(s.plannedEnd?.slice(0, 10))} />
            {/* Үндсэн амлалт нь сунгалтын дараа ч ХӨДӨЛДӨГГҮЙ — зөвхөн
                одоогийн огноог харвал гулсалт алга болно. */}
            <Row label="Дуусах (анхны амлалт)" value={formatDate(s.baselineEnd?.slice(0, 10))} muted />
            <div className="border-t pt-2" />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Гулсалт</span>
              {s.slippageDays == null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <ToneBadge tone={s.slippageDays > 0 ? "red" : "green"}>
                  {s.slippageDays > 0 ? `+${s.slippageDays}` : s.slippageDays} хоног
                </ToneBadge>
              )}
            </div>
            <Row label="Сунгагдсан ажил" value={String(s.extendedItems)} muted />
            <Row label="Хугацаа хэтэрсэн ажил" value={String(s.overdueItems)} muted />
          </CardContent>
        </Card>

        {/* --- Чанар --- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Чанар</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Шалгалт" value={q.inspections.toLocaleString("mn-MN")} />
            <Row label="Татгалзсан" value={q.rejected.toLocaleString("mn-MN")} muted />
            <Row label="Хэсэгчлэн батласан" value={q.partial.toLocaleString("mn-MN")} muted />
            <div className="border-t pt-2" />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Татгалзлын хувь</span>
              {/* Шалгалтгүй бол «0%» гэж бичих нь худал — хараахан
                  шалгаагүй байгаа нь чанар сайн гэсэн үг биш. */}
              {q.rejectionRate == null ? (
                <span className="text-muted-foreground">— (шалгалт алга)</span>
              ) : (
                <ToneBadge tone={q.rejectionRate > 10 ? "red" : q.rejectionRate > 3 ? "amber" : "green"}>
                  {q.rejectionRate}%
                </ToneBadge>
              )}
            </div>
            <Row label="Нээлттэй саатал" value={String(q.openIssues)} muted />
            <Row label="Шийдэгдсэн саатал" value={String(q.resolvedIssues)} muted />
          </CardContent>
        </Card>
      </div>

      {/* --- Материал --- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Материал</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mat.budgetedItems === 0 ? (
            <p className="text-muted-foreground text-sm">
              Материалын төсөв оруулаагүй байна.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Amount label="Бодит үнээр" value={mat.actualAmount} hint="Төсөвт батлагдсан" />
                <Amount
                  label="Зах зээлийн үнээр"
                  value={mat.marketAmount}
                  hint="Өнөөдрийн худалдан авах"
                  variance={mat.marketVariancePercent}
                  varianceLabel="бодитоос"
                />
                <div>
                  <div className="text-muted-foreground text-xs">Захиалга</div>
                  <div className="mt-1 text-sm">
                    {mat.concreteOrders} бетон · {mat.materialOrders} материал
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Нийлүүлэгдсэн бетон {mat.concreteDelivered.toLocaleString("mn-MN")} м³
                  </div>
                </div>
              </div>

              {mat.marketVariancePercent != null && mat.marketVariancePercent > 5 && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" />
                  Зах зээлийн үнэ төсвөөс {mat.marketVariancePercent}% өндөр —{" "}
                  {formatMoney(mat.marketAmount - mat.actualAmount)} зөрүү.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* --- Ажлын бүлгээр --- */}
      <Card className="p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Ажлын бүлгээр</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Бүлэг</TableHead>
              <TableHead className="text-right">Ажил</TableHead>
              <TableHead className="text-right">Дууссан</TableHead>
              <TableHead className="w-48">Гүйцэтгэл</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.byGroup.map((g) => (
              <TableRow key={g.name}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell className="text-right tabular-nums">{g.items}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {g.completed}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={g.percentage} className="flex-1" />
                    <span className="w-10 text-right text-xs tabular-nums">{g.percentage}%</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Amount({
  label,
  value,
  hint,
  variance,
  varianceLabel,
}: {
  label: string;
  value: number;
  hint?: string;
  variance?: number | null;
  varianceLabel?: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-lg font-medium tabular-nums">{formatMoney(value)}</div>
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {hint}
        {variance != null && (
          <ToneBadge tone={variance > 10 ? "red" : variance > 0 ? "amber" : "green"}>
            {variance > 0 ? "+" : ""}
            {variance}% {varianceLabel}
          </ToneBadge>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "red" }) {
  return (
    <div>
      <div
        className={cn(
          "text-xl font-medium tabular-nums",
          tone === "green" && "text-green-600 dark:text-green-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "red" && "text-red-600 dark:text-red-400",
        )}
      >
        {value.toLocaleString("mn-MN")}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", muted && "text-muted-foreground")}>{value}</span>
    </div>
  );
}
