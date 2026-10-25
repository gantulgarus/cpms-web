"use client";

/**
 * Бетон зуурмагийн захиалга.
 *
 * ХОЁР ТАБ: захиалгын жагсаалт ба ТӨСВИЙН ҮЛДЭГДЭЛ. Сүүлийнх нь энэ
 * дэлгэцийг цаасан бланкаас ялгах цорын гагц зүйл — «5-р давхарт
 * төсвөөр 240, захиалсан 180, үлдэгдэл 60». Хэтрүүлэн захиалсан бетоныг
 * буцаах аргагүй, хатна.
 *
 * ХЭТРЭЛТ БА ЯАРАЛТАЙГ ЖАГСААЛТ ДЭЭР ХАРУУЛНА. Дэлгэрэнгүй рүү орж байж
 * мэддэг бол тэдгээр нь анзаарагдахгүй өнгөрнө.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ChevronRight, Clock, Plus } from "lucide-react";

import { NewConcreteOrderDialog } from "@/components/new-concrete-order-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { blocks as blocksApi, concreteOrders } from "@/lib/api/endpoints";
import type { ConcreteOrderStatus } from "@/lib/api/types";
import { useMe } from "@/lib/api/use-me";
import { useProject } from "@/lib/api/use-project";
import { CONCRETE_ORDER_WRITER_ROLES, formatDate, formatQty } from "@/lib/domain";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ConcreteOrderStatus, "amber" | "blue" | "green" | "gray" | "red"> = {
  draft: "gray",
  submitted: "amber",
  confirmed: "blue",
  delivered: "green",
  cancelled: "red",
};

const TABS: { value: ConcreteOrderStatus | ""; label: string }[] = [
  { value: "", label: "Бүгд" },
  { value: "draft", label: "Драфт" },
  { value: "submitted", label: "Илгээсэн" },
  { value: "confirmed", label: "Баталгаажсан" },
  { value: "delivered", label: "Нийлүүлэгдсэн" },
];

export default function ConcreteOrdersPage() {
  const { me } = useMe();
  const { project } = useProject();

  const [view, setView] = useState<"orders" | "balance">("orders");
  const [status, setStatus] = useState<ConcreteOrderStatus | "">("");
  const [blockId, setBlockId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const blockList = useQuery({
    queryKey: ["blocks", project?.id],
    queryFn: () => blocksApi.listForProject(project!.id),
    enabled: Boolean(project),
  });

  const blockOptions = blockList.data?.data ?? [];

  // `Select.Value` нь УТГЫГ харуулдаг — UUID → нэр хүснэгт заавал.
  const blockLabels = Object.fromEntries(blockOptions.map((b) => [b.id, b.name]));

  const list = useQuery({
    queryKey: ["concrete-orders", project?.id, status, blockId],
    queryFn: () =>
      concreteOrders
        .list(project!.id, {
          ...(status ? { status } : {}),
          ...(blockId ? { blockId } : {}),
        })
        .then((r) => r.data),
    enabled: Boolean(project),
    placeholderData: keepPreviousData,
  });

  const balance = useQuery({
    queryKey: ["concrete-balance", blockId],
    queryFn: () => concreteOrders.balance(blockId).then((r) => r.data),
    enabled: view === "balance" && Boolean(blockId),
  });

  const canWrite = me != null && CONCRETE_ORDER_WRITER_ROLES.includes(me.role);

  /*
   * Шууд хаягаар орж ирсэн гүйцэтгэгчид ОЙЛГОМЖТОЙ мессеж.
   *
   * Цэснээс нуусан ч хаяг нь хэвээр ажиллана. Түүхий 403 алдаа
   * харуулбал хэрэглэгч систем эвдэрсэн гэж бодно.
   */
  if (me?.role === "contractor") {
    return (
      <EmptyState
        title="Эрх хүрэхгүй"
        description="Бетон бол захиалагчийн зардал — захиалгыг зөвхөн захиалагч талын инженерүүд хардаг."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Бетон захиалга"
        description="Төсвийн үлдэгдэлтэй тулгаж захиална — хэтрүүлж ирсэн бетоныг буцаах аргагүй."
        actions={
          canWrite && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" /> Шинэ захиалга
            </Button>
          )
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(
            [
              ["orders", "Захиалга"],
              ["balance", "Төсвийн үлдэгдэл"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                view === value
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "hover:bg-accent",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="w-44">
          <Select value={blockId} items={blockLabels} onValueChange={(v) => setBlockId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Бүх блок" />
            </SelectTrigger>
            <SelectContent>
              {blockOptions.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {view === "orders" &&
          TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setStatus(t.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                status === t.value
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "hover:bg-accent",
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      {view === "balance" ? (
        !blockId ? (
          <EmptyState
            title="Блокоо сонгоно уу"
            description="Төсвийн үлдэгдэл нь блок тус бүрээр бодогдоно."
          />
        ) : balance.isLoading ? (
          <LoadingRows rows={6} />
        ) : balance.error ? (
          <ErrorState
            message={(balance.error as Error).message}
            onRetry={() => balance.refetch()}
          />
        ) : (balance.data ?? []).length === 0 ? (
          <EmptyState
            title="Бетоны төсөв алга"
            description="Энэ блокт материалын төсөв оруулаагүй, эсвэл бетоны мөр байхгүй байна."
          />
        ) : (
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Байршил</TableHead>
                  <TableHead>Марк</TableHead>
                  <TableHead className="text-right">Төсөв</TableHead>
                  <TableHead className="text-right">Захиалсан</TableHead>
                  <TableHead className="text-right">Үлдэгдэл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(balance.data ?? []).map((row) => (
                  <TableRow key={`${row.locationId}-${row.materialId}`}>
                    <TableCell className="font-medium">{row.locationName}</TableCell>
                    <TableCell className="text-muted-foreground">{row.materialName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(row.budget, row.unit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(row.ordered, row.unit)}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Хэтрэлт нь улаанаар — энэ багана бол хуудасны
                          бүхий л утга учир. */}
                      <ToneBadge
                        tone={
                          row.overBy > 0
                            ? "red"
                            : row.remaining < row.budget * 0.1
                              ? "amber"
                              : "green"
                        }
                      >
                        {formatQty(row.remaining, row.unit)}
                      </ToneBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )
      ) : list.isLoading ? (
        <LoadingRows rows={5} />
      ) : list.error ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          title="Захиалга алга"
          description="Цутгалтын өдөр, давхар, маркаа сонгоод захиалга бичнэ."
        />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дугаар</TableHead>
                <TableHead>Байршил</TableHead>
                <TableHead>Цутгалт</TableHead>
                <TableHead className="text-right">Хэмжээ</TableHead>
                <TableHead className="text-right">Үлдэгдэл</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">
                    <Link href={`/concrete-orders/${o.id}`}>{o.number}</Link>
                    <div className="text-muted-foreground text-xs">{o.structure}</div>
                  </TableCell>
                  <TableCell>
                    {o.locationName}
                    <div className="text-muted-foreground text-xs">
                      {o.blockName} · {o.grade ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {formatDate(o.pourDate)}
                      {o.isRush && (
                        <span title="3 хоногийн хугацаанаас хожуу захиалга">
                          <Clock className="size-3.5 text-amber-600 dark:text-amber-400" />
                        </span>
                      )}
                    </span>
                    <div className="text-muted-foreground text-xs">
                      {o.pourHalf === "am" ? "Үдээс өмнө" : o.pourHalf === "pm" ? "Үдээс хойш" : ""}{" "}
                      {o.pourTime ?? ""}
                      {o.needsPump && " · помп"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatQty(o.quantity, "м3")}
                    {o.deliveredQty != null && o.deliveredQty !== o.quantity && (
                      <div className="text-muted-foreground text-xs">
                        ирсэн {formatQty(o.deliveredQty, "м3")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {o.overBy > 0 ? (
                      <ToneBadge tone="red">
                        <AlertTriangle className="size-3" /> +{formatQty(o.overBy, "м3")}
                      </ToneBadge>
                    ) : (
                      <span className="text-muted-foreground tabular-nums">
                        {formatQty(o.remainingQty, "м3")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={STATUS_TONE[o.status]}>{o.statusLabel}</ToneBadge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/concrete-orders/${o.id}`} aria-label={`${o.number} дэлгэрэнгүй`}>
                      <ChevronRight className="text-muted-foreground size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <NewConcreteOrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        blocks={blockOptions}
        defaultBlockId={blockId}
      />
    </div>
  );
}
