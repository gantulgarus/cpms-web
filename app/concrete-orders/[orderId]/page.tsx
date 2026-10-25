"use client";

/**
 * Бетон захиалгын дэлгэрэнгүй — илгээх, баталгаажуулах, хүлээж авах, татах.
 *
 * ХЭТРЭЛТ БА ЯАРАЛТАЙГ ДЭЭД ТАЛД. Баталгаажуулах товч дарах гэж байгаа
 * хүн тэдгээрийг хайж олох ёсгүй: бетон бол буцаагдахгүй зарлага.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, Clock, Download, Send, Truck, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { concreteOrders } from "@/lib/api/endpoints";
import { useMe } from "@/lib/api/use-me";
import {
  CONCRETE_ORDER_CONFIRMER_ROLES,
  CONCRETE_ORDER_WRITER_ROLES,
  formatDate,
  formatQty,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export default function ConcreteOrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { me } = useMe();
  const qc = useQueryClient();

  const [delivered, setDelivered] = useState("");

  const query = useQuery({
    queryKey: ["concrete-order", orderId],
    queryFn: () => concreteOrders.get(orderId),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["concrete-order", orderId] });
    qc.invalidateQueries({ queryKey: ["concrete-orders"] });
    qc.invalidateQueries({ queryKey: ["concrete-balance"] });
  }

  const act = (fn: () => Promise<unknown>, message: string) => ({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(message);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation(
    act(() => concreteOrders.submit(orderId), "Илгээгдлээ — төсвөөс хасагдав."),
  );
  const confirm = useMutation(
    act(() => concreteOrders.confirm(orderId), "Баталгаажлаа."),
  );
  const deliver = useMutation(
    act(() => concreteOrders.deliver(orderId, Number(delivered)), "Нийлүүлэлт бүртгэгдлээ."),
  );
  const cancel = useMutation({
    mutationFn: (reason: string) => concreteOrders.cancel(orderId, reason),
    onSuccess: () => {
      toast.success("Цуцлагдлаа — төсөв суллагдав.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const download = useMutation({
    mutationFn: () => concreteOrders.sheet(orderId, query.data?.number ?? "zahialga"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) return <LoadingRows rows={6} />;
  if (query.error) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />;
  }

  const o = query.data!;
  const canWrite = me != null && CONCRETE_ORDER_WRITER_ROLES.includes(me.role);
  const canConfirm = me != null && CONCRETE_ORDER_CONFIRMER_ROLES.includes(me.role);

  return (
    <div className="space-y-4">
      <PageHeader
        title={o.number}
        description={`${o.blockName} · ${o.locationName} · ${o.structure}`}
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

            {o.status === "submitted" && canConfirm && (
              <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                <Check className="size-4" /> Баталгаажуулах
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

      <div className="flex flex-wrap items-center gap-2">
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
      </div>

      {o.overBy > 0 && (
        <Alert tone="danger" icon={AlertTriangle} title={`Төсвөөс ${formatQty(o.overBy, "м3")}-ээр хэтэрсэн`}>
          Энэ байршил, маркийн төсөв {formatQty(o.budgetQty, "м3")}. Өмнө нь{" "}
          {formatQty(o.orderedQty, "м3")} захиалсан.
        </Alert>
      )}

      {o.isRush && o.status !== "delivered" && (
        <Alert tone="warn" icon={Clock} title="3 хоногийн хугацаанаас хожуу захиалга">
          Бланк дээр «бетон зуурмаг авахаас 3 хоногийн өмнө захиална» гэж заасан. Үйлдвэртэй
          утсаар баталгаажуулах нь зүйтэй.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Захиалга</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Цутгалтын огноо" value={formatDate(o.pourDate)} strong />
            <Row
              label="Эхлэх цаг"
              value={`${o.pourHalf === "am" ? "Үдээс өмнө" : o.pourHalf === "pm" ? "Үдээс хойш" : "—"} ${o.pourTime ?? ""}`}
            />
            <Row label="Блок / давхар" value={`${o.blockName} / ${o.locationName}`} />
            <Row label="Хийц нэршил" value={o.structure} />
            <Row label="Бетоны марк" value={o.grade ?? "—"} />
            <Row label="Бетон анги" value={o.concreteClass ?? "—"} />
            <Row label="Конусан суулт" value={o.slumpCm ? `${o.slumpCm} см` : "—"} />
            <Row label="Захиалах хэмжээ" value={formatQty(o.quantity, "м3")} strong />
            <Row label="Техник / помп" value={o.needsPump ? "Тийм" : "Үгүй"} />
            {o.deliveredQty != null && (
              <Row
                label="Ирсэн хэмжээ"
                value={`${formatQty(o.deliveredQty, "м3")} · ${formatDate(o.deliveredAt)}`}
                strong
              />
            )}
            {o.notes && <p className="text-muted-foreground pt-2 text-xs">{o.notes}</p>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Төсвийн үлдэгдэл</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Төсөвт" value={formatQty(o.budgetQty, "м3")} />
              <Row label="Өмнө захиалсан" value={formatQty(o.orderedQty, "м3")} muted />
              <Row label="Энэ захиалга" value={formatQty(o.quantity, "м3")} muted />
              <div className="border-t pt-2" />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Үлдэгдэл</span>
                <ToneBadge tone={o.remainingQty < 0 ? "red" : "green"}>
                  {formatQty(o.remainingQty, "м3")}
                </ToneBadge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Гарын үсэг</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Захиалга өгсөн" value={o.requestedBy ?? "—"} />
              <Row label="Захиалга авсан" value={o.receivedBy ?? "—"} muted />
              <Row label="Баталгаажуулсан" value={o.confirmedBy ?? "—"} muted />
              {o.confirmedAt && (
                <Row label="Батлагдсан" value={formatDate(o.confirmedAt.slice(0, 10))} muted />
              )}
            </CardContent>
          </Card>

          {/* Нийлүүлэлт бүртгэх — машин 7 м³-аар ирдэг тул бодит
              хэмжээг тусад нь бичнэ. */}
          {(o.status === "submitted" || o.status === "confirmed") && canWrite && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Нийлүүлэлт бүртгэх</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  placeholder={`Ирсэн хэмжээ (${o.quantity} захиалсан)`}
                  value={delivered}
                  onChange={(e) => setDelivered(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Машин 7 м³-аар ирдэг тул захиалснаас зөрөх нь хэвийн. Бодит хэмжээ нь төсвөөс
                  хасагдана.
                </p>
                <Button
                  className="w-full"
                  onClick={() => deliver.mutate()}
                  disabled={!(Number(delivered) > 0) || deliver.isPending}
                >
                  <Truck className="size-4" /> Хүлээж авсан
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Alert({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "danger" | "warn";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        tone === "danger" && "border-red-500/50 bg-red-500/5",
        tone === "warn" && "border-amber-500/50 bg-amber-500/5",
      )}
    >
      <CardContent className="flex gap-3 pt-6">
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            tone === "danger" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
          )}
        />
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground">{children}</p>
        </div>
      </CardContent>
    </Card>
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
        className={cn(
          "tabular-nums",
          strong && "font-medium",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}
