"use client";

/**
 * Материалын захиалга — үндсэн, туслах, модон, арматур.
 *
 * ДӨРВӨН БЛАНК НЭГ ДЭЛГЭЦЭД. Захиалагчийн дөрвөн хуудас багана
 * болгоноороо ижил — зөвхөн материалын жагсаалт нь өөр. Дөрвөн дэлгэц
 * барих нь ижил алдааг дөрвөн газар засах гэсэн үг.
 *
 * ТӨСВИЙН ҮЛДЭГДЭЛ нь бетонтой адил гол зүйл, гэхдээ БЛОКООР бодогдоно:
 * пум, хадаас нь тодорхой давхарт очдоггүй, агуулахад ирээд тарагддаг.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";

import { NewMaterialOrderDialog } from "@/components/new-material-order-dialog";
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
import { blocks as blocksApi, materialOrders } from "@/lib/api/v2/endpoints";
import type { MaterialOrderKind, MaterialOrderStatus } from "@/lib/api/v2/types";
import { useMe } from "@/lib/api/v2/use-me";
import { useProject } from "@/lib/api/v2/use-project";
import {
  formatDate,
  formatQty,
  MATERIAL_ORDER_KINDS,
  MATERIAL_ORDER_WRITER_ROLES,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<MaterialOrderStatus, "amber" | "blue" | "green" | "gray" | "red"> = {
  draft: "gray",
  submitted: "amber",
  confirmed: "blue",
  delivered: "green",
  cancelled: "red",
};

const KIND_TABS: { value: MaterialOrderKind | ""; label: string }[] = [
  { value: "", label: "Бүгд" },
  { value: "main", label: "Үндсэн" },
  { value: "aux", label: "Туслах" },
  { value: "timber", label: "Модон" },
  { value: "rebar", label: "Арматур" },
];

export default function MaterialOrdersPage() {
  const { me } = useMe();
  const { project } = useProject();

  const [view, setView] = useState<"orders" | "balance">("orders");
  const [kind, setKind] = useState<MaterialOrderKind | "">("");
  const [blockId, setBlockId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const blockList = useQuery({
    queryKey: ["v2-blocks", project?.id],
    queryFn: () => blocksApi.listForProject(project!.id),
    enabled: Boolean(project),
  });

  const blockOptions = blockList.data?.data ?? [];
  const blockLabels = Object.fromEntries(blockOptions.map((b) => [b.id, b.name]));

  const list = useQuery({
    queryKey: ["v2-material-orders", project?.id, kind, blockId],
    queryFn: () =>
      materialOrders
        .list(project!.id, {
          ...(kind ? { kind } : {}),
          ...(blockId ? { blockId } : {}),
        })
        .then((r) => r.data),
    enabled: Boolean(project),
    placeholderData: keepPreviousData,
  });

  const balance = useQuery({
    queryKey: ["v2-material-balance", blockId],
    queryFn: () => materialOrders.balance(blockId).then((r) => r.data),
    enabled: view === "balance" && Boolean(blockId),
  });

  const canWrite = me != null && MATERIAL_ORDER_WRITER_ROLES.includes(me.role);

  if (me?.role === "contractor") {
    return (
      <EmptyState
        title="Эрх хүрэхгүй"
        description="Материалын захиалгыг зөвхөн захиалагч талын инженерүүд хардаг."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Материалын захиалга"
        description="Үндсэн, туслах, модон материал ба арматур — төсвийн үлдэгдэлтэй тулгана."
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
          KIND_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setKind(t.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                kind === t.value
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
          <ErrorState message={(balance.error as Error).message} onRetry={() => balance.refetch()} />
        ) : (balance.data ?? []).length === 0 ? (
          <EmptyState
            title="Материалын төсөв алга"
            description="Энэ блокт материалын төсөв оруулаагүй байна."
          />
        ) : (
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Код</TableHead>
                  <TableHead>Материал</TableHead>
                  <TableHead className="text-right">Төсөв</TableHead>
                  <TableHead className="text-right">Захиалсан</TableHead>
                  <TableHead className="text-right">Үлдэгдэл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(balance.data ?? []).map((row) => (
                  <TableRow key={row.materialId}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {row.code ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(row.budget, row.unit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(row.ordered, row.unit)}
                    </TableCell>
                    <TableCell className="text-right">
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
          description="Бланкны төрлөө сонгоод материалын мөрүүдээ бичнэ."
        />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дугаар</TableHead>
                <TableHead>Төрөл</TableHead>
                <TableHead className="text-right">Мөр</TableHead>
                <TableHead>Шаардах</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">
                    <Link href={`/material-orders/${o.id}`}>{o.number}</Link>
                    <div className="text-muted-foreground text-xs">
                      {o.blockName}
                      {o.locationName ? ` · ${o.locationName}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {MATERIAL_ORDER_KINDS[o.kind] ?? o.kindLabel}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o.lineCount}
                    {/* Хэтэрсэн мөрийг ЖАГСААЛТ дээр хэлнэ — дэлгэрэнгүй рүү
                        орж байж мэддэг бол анзаарагдахгүй өнгөрнө. */}
                    {o.overLineCount > 0 && (
                      <div className="flex items-center justify-end gap-1 text-xs text-red-600 dark:text-red-400">
                        <AlertTriangle className="size-3" />
                        {o.overLineCount} хэтэрсэн
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {o.neededBy ? formatDate(o.neededBy) : "—"}
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={STATUS_TONE[o.status]}>{o.statusLabel}</ToneBadge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/material-orders/${o.id}`} aria-label={`${o.number} дэлгэрэнгүй`}>
                      <ChevronRight className="text-muted-foreground size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <NewMaterialOrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        blocks={blockOptions}
        defaultBlockId={blockId}
      />
    </div>
  );
}
