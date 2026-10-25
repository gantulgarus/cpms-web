"use client";

/**
 * Блокт ОРСОН төсөв.
 *
 * «Би юу оруулсан бэ» гэдэг нь системийн суурь асуулт. Импортын дараа
 * түүнийг харах газар байхгүй байв: ажлын үнэ зөвхөн тохиролцоо бичих
 * үед, материал зөвхөн үлдэгдэл хэлбэрээр харагддаг байсан.
 *
 * АЖЛЫН ТӨРЛӨӨР НЭГТГЭНЭ, ажил тус бүрээр биш: А1-д 1,991 ажил бий.
 * Тэднийг жагсаах нь төсөв биш, жагсаалт болно.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Fragment, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AddMaterialBudgetDialog } from "@/components/add-material-budget-dialog";
import { AddWorkTypeDialog } from "@/components/add-work-type-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { blocks, materialBudget } from "@/lib/api/v2/endpoints";
import { useMe } from "@/lib/api/v2/use-me";
import type { BudgetMaterialRow } from "@/lib/api/v2/types";
import { formatMoney, formatQty } from "@/lib/domain";
import { cn } from "@/lib/utils";

export default function BlockBudgetPage() {
  const { blockId } = useParams<{ blockId: string }>();
  const { me } = useMe();
  const [tab, setTab] = useState<"work" | "materials">("work");
  const [addingWork, setAddingWork] = useState(false);
  const [addingMaterial, setAddingMaterial] = useState(false);

  /*
   * ЗАСАХ эрх нь ХАРАХААС нарийн. Захирал, төслийн менежер төсөв
   * хардаг ч засдаггүй — засах нь импортлохтой ижил түвшний үйлдэл.
   */
  const canEdit = Boolean(me?.canManageReferenceData);

  const blockQuery = useQuery({
    queryKey: ["v2-block", blockId],
    queryFn: () => blocks.get(blockId),
  });

  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["v2-block-budget", blockId],
    queryFn: () => blocks.budget(blockId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["v2-block-budget", blockId] });
    // Төсвийн үнэ өөрчлөгдвөл блокийн тайлан, тохиролцооны жишиг үнэ
    // хоёулаа хуучирна.
    qc.invalidateQueries({ queryKey: ["v2-block-report", blockId] });
  };

  const setWorkPrice = useMutation({
    mutationFn: ({ workTypeId, price }: { workTypeId: string; price: number | null }) =>
      blocks.setWorkPrice(blockId, workTypeId, price),
    onSuccess: (res) => {
      toast.success(`${res.updated} ажлын үнэ шинэчлэгдлээ.`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) return <LoadingRows rows={8} />;
  if (query.error) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />;
  }

  const b = query.data!;
  const workTotal = b.work.reduce((n, r) => n + r.amount, 0);
  const materialTotal = b.materials.reduce((n, r) => n + (r.actualAmount ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Орсон төсөв"
        crumbs={[
          { label: "Блокууд", href: "/blocks" },
          { label: blockQuery.data?.name ?? "Блок", href: `/blocks/${blockId}` },
          { label: "Төсөв" },
        ]}
        description="Импортоор орсон ажлын хөлс ба материалын төсөв."
        actions={
          /*
           * Нэмэх товч нь ИДЭВХТЭЙ ТАБААС хамаарна. Хоёуланг нь зэрэг
           * харуулбал аль төсөвт нэмэгдэхийг хүн таамаглах болно.
           *
           * Импорт алдаатай ажлыг УНАГААДАГ (А1-д 14 ажил, 109 эвдэрсэн
           * нүд). Тэднийг нөхөх цорын ганц зам нь энэ — бүх төсвийг
           * дахин оруулах нь хэт том алхам.
           */
          canEdit ? (
            tab === "work" ? (
              <Button onClick={() => setAddingWork(true)}>
                <Plus className="size-4" /> Ажил нэмэх
              </Button>
            ) : (
              <Button onClick={() => setAddingMaterial(true)}>
                <Plus className="size-4" /> Материал нэмэх
              </Button>
            )
          ) : null
        }
      />

      <AddWorkTypeDialog
        blockId={blockId}
        open={addingWork}
        onOpenChange={setAddingWork}
        onDone={refresh}
      />
      <AddMaterialBudgetDialog
        blockId={blockId}
        open={addingMaterial}
        onOpenChange={setAddingMaterial}
        onDone={refresh}
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["work", `Ажлын хөлс (${b.work.length})`],
            ["materials", `Материал (${b.materials.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              tab === value
                ? "bg-primary text-primary-foreground border-transparent"
                : "hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "work" ? (
        b.work.length === 0 ? (
          <EmptyState
            title="Ажлын төсөв алга"
            description="Энэ блокт ажлын хөлсний төсөв оруулаагүй байна."
          />
        ) : (
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Код</TableHead>
                  <TableHead>Ажлын төрөл</TableHead>
                  <TableHead className="text-right">Ажил</TableHead>
                  <TableHead className="text-right">Тоо хэмжээ</TableHead>
                  <TableHead className="text-right">Нэгж үнэ</TableHead>
                  <TableHead className="text-right">Дүн</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {b.work.map((r) => (
                  <TableRow key={r.workTypeId}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {r.code ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-muted-foreground text-xs">{r.groupName}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {r.works}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(r.plannedQty, r.unit)}
                    </TableCell>
                    <TableCell className="text-right">
                      <PriceCell
                        value={r.unitPrice}
                        canEdit={canEdit}
                        onSave={(v) => setWorkPrice.mutateAsync({ workTypeId: r.workTypeId, price: v })}
                      />
                      {r.priceConflict && (
                        <div
                          className="flex items-center justify-end gap-1 text-xs text-red-600 dark:text-red-400"
                          title="Нэг төрөлд хоёр өөр үнэ орсон"
                        >
                          <AlertTriangle className="size-3" /> хоёр үнэ
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(r.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={5} className="font-medium">
                    Нийт
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(workTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        )
      ) : b.materials.length === 0 ? (
        <EmptyState
          title="Материалын төсөв алга"
          description="Энэ блокт материалын төсөв оруулаагүй байна."
        />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="w-20">Код</TableHead>
                <TableHead>Материал</TableHead>
                <TableHead className="text-right">Тоо хэмжээ</TableHead>
                <TableHead className="text-right">Бодит үнэ</TableHead>
                <TableHead className="text-right">Зах зээл</TableHead>
                <TableHead className="text-right">Дүн</TableHead>
                {canEdit && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.materials.map((r) => (
                <MaterialRow key={r.id} row={r} canEdit={canEdit} onSaved={refresh} />
              ))}
              <TableRow className="bg-muted/40">
                <TableCell colSpan={6} className="font-medium">
                  Нийт (бодит үнээр)
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatMoney(materialTotal)}
                </TableCell>
                {canEdit && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

/**
 * Үнийн нүд — дарахад ЯГ ТЭНД засагдана.
 *
 * ЯАГААД ЦОНХ БИШ ВЭ: А1-д 68 ажилд үнэ тавигдаагүй. Цонх нээх,
 * бөглөх, хаах гэсэн гурван алхмыг 68 удаа давтах нь ажил болно.
 * Нүдэн дотор засвал гараараа л үргэлжлүүлнэ.
 *
 * ХООСОН ҮЛДЭЭВЭЛ ҮНЭ АРИЛНА. «Үнэгүй ажил» ба «үнэ нь мэдэгдэхгүй»
 * хоёр өөр зүйл тул 0 бичихийг сервер татгалздаг — арилгах цорын
 * гагц зам нь хоосон үлдээх.
 */
function PriceCell({
  value,
  canEdit,
  onSave,
}: {
  value: number | null;
  canEdit: boolean;
  onSave: (value: number | null) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  if (!editing) {
    const body =
      value == null ? (
        /* Үнэгүй ажил нь дүнд 0-оор ордог — нуувал нийт төсөв
           бодитоос бага харагдана. */
        <ToneBadge tone="amber">үнэгүй</ToneBadge>
      ) : (
        <span className="tabular-nums">{formatMoney(value)}</span>
      );

    if (!canEdit) return body;

    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value == null ? "" : String(value));
          setEditing(true);
        }}
        className="hover:bg-accent group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5"
        title="Үнэ засах"
      >
        {body}
        <Pencil className="text-muted-foreground size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  const commit = async () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed);

    if (next !== null && !(next > 0)) {
      toast.error("Нэгж үнэ 0-ээс их байх ёстой. Арилгах бол хоосон үлдээнэ үү.");

      return;
    }

    setBusy(true);

    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center justify-end gap-1">
      <Input
        autoFocus
        type="number"
        min={0}
        step="0.01"
        className="h-8 w-28 text-right"
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter → хадгална, Esc → болино. Хулганаар явах шаардлагагүй.
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void commit()} aria-label="Хадгалах">
        <Check className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setEditing(false)}
        aria-label="Болих"
      >
        <X className="size-4" />
      </Button>
    </span>
  );
}

/**
 * Материалын мөр — дарахад БАЙРШЛЫН задаргаа задарна.
 *
 * Задаргаа нь материалын төсвийн онцлог: инженер аль хэдийн давхраар
 * бодсон байдаг. Нийт дүнг л харуулбал тэр ажил алдагдана.
 */
function MaterialRow({
  row,
  canEdit,
  onSaved,
}: {
  row: BudgetMaterialRow;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const hasBreakdown = row.locations.length > 0;

  /*
   * Устгахыг ХОЁР ДАРААЛТААР баталгаажуулна.
   *
   * Цонх нээхгүй: мөр их байх тул цонх нь хэт хүнд. Гэхдээ нэг
   * дарахад л устгах нь аюултай — тиймээс товч эхлээд «Устгах уу?»
   * болж хувирна.
   *
   * Захиалгатай материалыг сервер устгуулахгүй — түүхийг таслахгүйн
   * тулд. Энэ шалгалтыг UI давхардуулахгүй, серверийн хариуг л
   * харуулна.
   */
  const remove = useMutation({
    mutationFn: () => materialBudget.destroy(row.id),
    onSuccess: () => {
      toast.success(`«${row.name}» төсвөөс хасагдлаа.`);
      onSaved();
    },
    onError: (e: Error) => {
      setConfirming(false);
      toast.error(e.message);
    },
  });

  const save = useMutation({
    mutationFn: (prices: { actualUnitPrice?: number | null; marketUnitPrice?: number | null }) =>
      materialBudget.setPrice(row.id, prices),
    onSuccess: () => {
      toast.success("Үнэ шинэчлэгдлээ.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Fragment>
      <TableRow
        className={cn(hasBreakdown && "cursor-pointer")}
        onClick={hasBreakdown ? () => setOpen((v) => !v) : undefined}
      >
        <TableCell>
          {hasBreakdown &&
            (open ? (
              <ChevronDown className="text-muted-foreground size-4" />
            ) : (
              <ChevronRight className="text-muted-foreground size-4" />
            ))}
        </TableCell>
        <TableCell className="text-muted-foreground tabular-nums">{row.code ?? "—"}</TableCell>
        <TableCell>
          <div className="font-medium">
            {row.name}
            {row.grade && <span className="text-muted-foreground"> · {row.grade}</span>}
          </div>
          {row.workLabel && (
            <div className="text-muted-foreground text-xs">{row.workLabel}</div>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {formatQty(row.totalQty, row.unit)}
        </TableCell>
        {/* Нүдэн дотор засна — мөр задлахгүй, цонх нээхгүй. */}
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <PriceCell
            value={row.actualUnitPrice}
            canEdit={canEdit}
            onSave={(v) => save.mutateAsync({ actualUnitPrice: v })}
          />
        </TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <PriceCell
            value={row.marketUnitPrice}
            canEdit={canEdit}
            onSave={(v) => save.mutateAsync({ marketUnitPrice: v })}
          />
          {row.variancePercent != null && row.variancePercent !== 0 && (
            <div className="mt-0.5">
              <ToneBadge tone={row.variancePercent > 5 ? "red" : "amber"}>
                {row.variancePercent > 0 ? "+" : ""}
                {row.variancePercent}%
              </ToneBadge>
            </div>
          )}
        </TableCell>
        <TableCell className="text-right font-medium tabular-nums">
          {row.actualAmount == null ? "—" : formatMoney(row.actualAmount)}
        </TableCell>
        {canEdit && (
          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
            {confirming ? (
              <span className="flex items-center justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 dark:text-red-400"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Устгах уу?
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Болих"
                  disabled={remove.isPending}
                  onClick={() => setConfirming(false)}
                >
                  <X className="size-4" />
                </Button>
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Төсвөөс хасах"
                title="Төсвөөс хасах"
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="text-muted-foreground size-4" />
              </Button>
            )}
          </TableCell>
        )}
      </TableRow>

      {open && (
        <TableRow>
          <TableCell colSpan={canEdit ? 8 : 7} className="bg-muted/30">
            <div className="flex flex-wrap gap-x-6 gap-y-1 py-1 text-xs">
              {row.locations.map((l) => (
                <span key={l.name}>
                  <span className="text-muted-foreground">{l.name}</span>{" "}
                  <span className="tabular-nums">{formatQty(l.qty, row.unit)}</span>
                </span>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
