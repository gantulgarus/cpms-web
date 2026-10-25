"use client";

/**
 * Тохиролцооны дэлгэрэнгүй — батлах, татах.
 *
 * БАТЛАГДСАНЫ ДАРАА МӨР ТҮГЖИГДЭНЭ: акт нь эдгээр үнэ дээр тогтдог тул үнэ
 * хойшоо хөдөлвөл гарсан акт бүр худал болно. Дэлгэц түүнийг нуухгүй,
 * ТОДОРХОЙ хэлнэ.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Check, Download, Lock } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
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
import { agreements } from "@/lib/api/v2/endpoints";
import { useMe } from "@/lib/api/v2/use-me";
import { formatDate, formatMoney, formatQty } from "@/lib/domain";

export default function AgreementPage() {
  const { agreementId } = useParams<{ agreementId: string }>();
  const { me } = useMe();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["v2-agreement", agreementId],
    queryFn: () => agreements.get(agreementId),
  });

  const download = useMutation({
    mutationFn: () => agreements.sheet(agreementId, query.data?.number ?? "tohirolcoo"),
    onSuccess: () => toast.success("Хуудас татагдлаа"),
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: () => agreements.approve(agreementId),
    onSuccess: (a) => {
      toast.success(`${a.number} хүчин төгөлдөр болов`);
      qc.invalidateQueries({ queryKey: ["v2-agreement", agreementId] });
      qc.invalidateQueries({ queryKey: ["v2-agreements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) return <LoadingRows rows={6} />;
  if (query.error) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />;
  }

  const a = query.data!;
  const variance = a.variancePercent;

  return (
    <div className="space-y-4">
      <PageHeader
        title={a.number}
        description={`${a.contractorName} · ${a.blockName}${a.scope ? ` · ${a.scope}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {/* Драфт ч татагдана — гарын үсэг зурахаас өмнө хэвлээд
                уншуулах нь бодит практик. */}
            <Button
              variant="outline"
              onClick={() => download.mutate()}
              disabled={download.isPending}
            >
              <Download className="size-4" />
              {download.isPending ? "Бэлтгэж байна…" : "Хуудас татах"}
            </Button>
            {a.status === "draft" && me?.canApproveExtensions && (
              <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
                <Check className="size-4" /> Батлах
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ToneBadge tone={a.status === "active" ? "green" : a.status === "draft" ? "amber" : "gray"}>
          {a.statusLabel}
        </ToneBadge>
        {!a.isEditable && (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Lock className="size-3" /> Мөр түгжигдсэн — акт эдгээр үнэ дээр тогтоно
          </span>
        )}
        {a.approvedBy && (
          <span className="text-muted-foreground text-xs">
            {a.approvedBy} · {formatDate(a.approvedAt?.slice(0, 10))}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Ажлын гүйцэтгэл</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ажлын нэр</TableHead>
                  <TableHead className="text-right">Тоо хэмжээ</TableHead>
                  <TableHead className="text-right">Нэгж үнэ</TableHead>
                  <TableHead className="text-right">Төсвийн үнэ</TableHead>
                  <TableHead className="text-right">Дүн</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(a.lines ?? []).map((l) => (
                  <TableRow key={l.id ?? l.workTypeId}>
                    <TableCell>
                      {l.label}
                      {l.isExtra && <ToneBadge tone="blue">нэмэлт</ToneBadge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(l.quantity, l.unit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(l.unitPrice)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {l.budgetUnitPrice != null ? formatMoney(l.budgetUnitPrice) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(l.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Төлбөрийн нөхцөл</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Нийт үнийн дүн" value={formatMoney(a.totalAmount)} strong />
              <Row label="Төсвийн дүн" value={formatMoney(a.budgetAmount)} muted />
              {variance != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Зөрүү</span>
                  {/* Зөрүүг нуувал 14.4 саяын ажил 16.2 саяар гэрээлэгдээд
                      хэн ч мэдэхгүй. */}
                  <ToneBadge tone={variance > 10 ? "red" : variance > 0 ? "amber" : "green"}>
                    {variance > 0 ? "+" : ""}
                    {variance}%
                  </ToneBadge>
                </div>
              )}
              <div className="border-t pt-2" />
              <Row label={`Барьцаа ${a.retentionPercent}%`} value={formatMoney(a.retentionAmount)} />
              <Row label="Бартер" value={`${a.barterPercent}%`} />
              <Row label="Бэлэн мөнгө" value={`${a.cashPercent}%`} />
              {a.barterNote && <Row label="Бартерын нэр" value={a.barterNote} muted />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Нөхцөл</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Эхлэх" value={formatDate(a.startDate)} />
              <Row label="Хүлээлгэн өгөх" value={formatDate(a.endDate)} />
              <Row label="Баталгаат хугацаа" value={`${a.warrantyYears} жил`} />
              <Row label="Засвар үйлчилгээ" value={`${a.maintenanceMonths} сар`} />
              <Row
                label="Ажлын хоног"
                value={a.workDaysPerWeek ? `7 хоногт ${a.workDaysPerWeek} өдөр` : "—"}
              />
              <Row label="Амрах гариг" value={a.restDay ?? "—"} />
              <Row label="Хүн хүч" value={a.headcount ? `${a.headcount} хүн` : "—"} />
              <Row label="РД" value={a.contractorRegistrationNo ?? "—"} muted />
            </CardContent>
          </Card>
        </div>
      </div>

      {a.notes && (
        <Card>
          <CardContent className="text-muted-foreground pt-6 text-sm">{a.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          strong
            ? "text-base font-medium tabular-nums"
            : muted
              ? "text-muted-foreground tabular-nums"
              : "tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
