"use client";

/**
 * Материалын захиалгын дэлгэрэнгүй.
 *
 * БАТАЛГААЖУУЛАХ нь мөр бүрийн ЗӨВШӨӨРСӨН тоог тогтооно. Бланк дээр
 * «Захиалгын тоо хэмжээ» ба «Зөвшөөрсөн тоо хэмжээ» гэсэн хоёр багана
 * тусдаа байгаа нь санамсаргүй биш: баталгаажуулагч 300 хүссэнийг 180
 * болгон бууруулдаг. Төсвөөс хасагдах нь ЗӨВШӨӨРСӨН тоо.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, Download, Send, Truck, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { materialOrders } from "@/lib/api/endpoints";
import { useMe } from "@/lib/api/use-me";
import {
  formatDate,
  formatQty,
  MATERIAL_ORDER_CONFIRMER_ROLES,
  MATERIAL_ORDER_WRITER_ROLES,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export default function MaterialOrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { me } = useMe();
  const qc = useQueryClient();

  /** Мөрийн id → гараар оруулсан тоо (батлах эсвэл хүлээж авах). */
  const [edits, setEdits] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["material-order", orderId],
    queryFn: () => materialOrders.get(orderId),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["material-order", orderId] });
    qc.invalidateQueries({ queryKey: ["material-orders"] });
    qc.invalidateQueries({ queryKey: ["material-balance"] });
    setEdits({});
  }

  const numbers = () =>
    Object.fromEntries(
      Object.entries(edits)
        .filter(([, v]) => v !== "" && !Number.isNaN(Number(v)))
        .map(([k, v]) => [k, Number(v)]),
    );

  const act = (fn: () => Promise<unknown>, message: string) => ({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(message);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation(
    act(() => materialOrders.submit(orderId), "Илгээгдлээ — төсвөөс хасагдав."),
  );
  const confirm = useMutation(
    act(() => materialOrders.confirm(orderId, numbers()), "Баталгаажлаа."),
  );
  const deliver = useMutation(
    act(() => materialOrders.deliver(orderId, numbers()), "Нийлүүлэлт бүртгэгдлээ."),
  );
  const cancel = useMutation({
    mutationFn: (reason: string) => materialOrders.cancel(orderId, reason),
    onSuccess: () => {
      toast.success("Цуцлагдлаа — төсөв суллагдав.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const download = useMutation({
    mutationFn: () => materialOrders.sheet(orderId, query.data?.number ?? "zahialga"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) return <LoadingRows rows={6} />;
  if (query.error) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />;
  }

  const o = query.data!;
  const canWrite = me != null && MATERIAL_ORDER_WRITER_ROLES.includes(me.role);
  const canConfirm = me != null && MATERIAL_ORDER_CONFIRMER_ROLES.includes(me.role);

  const confirming = o.status === "submitted" && canConfirm;
  const delivering = (o.status === "submitted" || o.status === "confirmed") && canWrite;

  return (
    <div className="space-y-4">
      <PageHeader
        title={o.number}
        description={`${o.kindLabel} · ${o.blockName}${o.locationName ? ` · ${o.locationName}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => download.mutate()} disabled={download.isPending}>
              <Download className="size-4" />
              {download.isPending ? "Бэлтгэж байна…" : "Хуудас татах"}
            </Button>

            {o.status === "draft" && canWrite && (
              <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
                <Send className="size-4" /> Илгээх
              </Button>
            )}

            {confirming && (
              <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                <Check className="size-4" /> Баталгаажуулах
              </Button>
            )}

            {delivering && (
              <Button
                variant="outline"
                onClick={() => deliver.mutate()}
                disabled={deliver.isPending || Object.keys(numbers()).length === 0}
              >
                <Truck className="size-4" /> Хүлээж авсан
              </Button>
            )}

            {o.status !== "delivered" && o.status !== "cancelled" && canWrite && (
              <Button
                variant="ghost"
                onClick={() => {
                  const reason = window.prompt("Цуцлах шалтгаан:");
                  if (reason && reason.trim().length >= 5) cancel.mutate(reason.trim());
                  else if (reason !== null) toast.error("Шалтгаан хэт богино байна.");
                }}
                disabled={cancel.isPending}
              >
                <X className="size-4" /> Цуцлах
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <ToneBadge
          tone={
            o.status === "delivered"
              ? "green"
              : o.status === "confirmed"
                ? "blue"
                : o.status === "submitted"
                  ? "amber"
                  : o.status === "cancelled"
                    ? "red"
                    : "gray"
          }
        >
          {o.statusLabel}
        </ToneBadge>

        {o.status === "draft" && (
          <span className="text-muted-foreground text-xs">
            Драфт нь төсөв иддэггүй — илгээснээр хасагдана.
          </span>
        )}

        {o.neededBy && (
          <span className="text-muted-foreground text-xs">
            Шаардах огноо: {formatDate(o.neededBy)}
          </span>
        )}

        {confirming && (
          <span className="text-muted-foreground text-xs">
            Зөвшөөрөх тоог мөр бүрт засаж болно — хоосон үлдээвэл захиалсанаар батална.
          </span>
        )}
      </div>

      {o.overLineCount > 0 && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="flex gap-3 pt-6 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-medium">{o.overLineCount} мөр төсвөөс хэтэрсэн</p>
              <p className="text-muted-foreground">
                Доорх хүснэгтэд улаанаар тэмдэглэгдсэн. Хориглоогүй — шийдвэрийг
                баталгаажуулагч гаргана.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">№</TableHead>
              <TableHead>Материал</TableHead>
              <TableHead className="text-right">Агуулахад</TableHead>
              <TableHead className="text-right">Захиалсан</TableHead>
              <TableHead className="text-right">Зөвшөөрсөн</TableHead>
              {o.isRebar && <TableHead className="text-right">Нийт жин</TableHead>}
              <TableHead className="text-right">Ирсэн</TableHead>
              <TableHead className="text-right">Төсвийн үлдэгдэл</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {o.lines.map((l, i) => (
              <TableRow key={l.id} className={cn(l.overBy > 0 && "bg-red-500/5")}>
                <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell className="font-medium">
                  {l.name}
                  {l.materialId === null && (
                    <div className="text-muted-foreground text-xs">төсөвт байхгүй</div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {l.stockQty == null ? "—" : formatQty(l.stockQty, l.unit)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatQty(l.quantity, l.unit)}
                </TableCell>
                <TableCell className="text-right">
                  {confirming ? (
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      className="ml-auto w-24 text-right"
                      placeholder={String(l.quantity)}
                      value={edits[l.id] ?? ""}
                      onChange={(e) => setEdits((x) => ({ ...x, [l.id]: e.target.value }))}
                    />
                  ) : (
                    <span className="tabular-nums">
                      {l.approvedQty == null ? "—" : formatQty(l.approvedQty, l.unit)}
                    </span>
                  )}
                </TableCell>
                {o.isRebar && (
                  <TableCell className="text-right tabular-nums">
                    {l.totalWeightKg == null ? "—" : `${l.totalWeightKg.toLocaleString("mn-MN")} кг`}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  {delivering ? (
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      className="ml-auto w-24 text-right"
                      placeholder={String(l.approvedQty ?? l.quantity)}
                      value={edits[l.id] ?? ""}
                      onChange={(e) => setEdits((x) => ({ ...x, [l.id]: e.target.value }))}
                    />
                  ) : (
                    <span className="tabular-nums">
                      {l.deliveredQty == null ? "—" : formatQty(l.deliveredQty, l.unit)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {l.remainingQty == null ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : l.overBy > 0 ? (
                    <ToneBadge tone="red">+{formatQty(l.overBy, l.unit)}</ToneBadge>
                  ) : (
                    <span className="text-muted-foreground tabular-nums">
                      {formatQty(l.remainingQty, l.unit)}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Гарын үсэг</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Захиалга өгсөн" value={o.requestedBy ?? "—"} />
            <Row label="Захиалга авсан" value={o.receivedBy ?? "—"} />
            <Row label="Баталгаажуулсан" value={o.confirmedBy ?? "—"} />
            {o.confirmedAt && (
              <Row label="Батлагдсан" value={formatDate(o.confirmedAt.slice(0, 10))} />
            )}
          </CardContent>
        </Card>

        {o.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Тайлбар</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm whitespace-pre-line">
              {o.notes}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
