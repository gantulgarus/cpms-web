"use client";

/**
 * Тоо хэмжээ нь бүртгэгдээгүй ажлын төрлүүдийг нөхөх.
 *
 * ЯАГААД ХЭРЭГТЭЙ ВЭ: хавсралт-2-ын 47 ажлын төрлөөс 30-д нь найдвартай тоо
 * хэмжээ байгаагүй тул `null` гэж хадгалагдсан. Үр дүнд нь нэг блокийн 3,290
 * мөрийн ~1,900 нь `planned_qty = 0` болж үүсдэг. Тэдгээр мөрд:
 *
 *   - гүйцэтгэл ОРУУЛАХ БОЛОМЖГҮЙ (үлдэгдэл 0 тул няцаагдана),
 *   - хувь бодогдохгүй (хэмжих зүйлгүй).
 *
 * Сервер дээр нөхөх эндпойнт бэлэн байсан ч дуудах дэлгэц байгаагүй тул
 * ажлын тал нь чимээгүй мухардмал байв.
 *
 * НЭГ УДАА бөглөхөд тухайн блокийн БҮХ мөрөнд тарна (144 айлын хаалгыг 144
 * удаа бичих шаардлагагүй), мөн ЗАГВАРТ бичигдэнэ — дараагийн блок ижил
 * нүхтэй үүсэхгүй.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { plan } from "@/lib/api/v2/endpoints";
import type { Uuid } from "@/lib/api/v2/types";

/** Байршлын түвшний монгол нэр — «нэг юун дээр» гэдгийг тодруулна. */
const LEVEL_LABEL: Record<string, string> = {
  block: "барилгад",
  entrance: "орцод",
  floor: "давхарт",
  unit: "айлд",
  room: "өрөөнд",
  common: "нийтийн талбайд",
};

export function MissingQuantitiesDialog({
  blockId,
  open,
  onOpenChange,
}: {
  blockId: Uuid;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: ["v2-missing-quantities", blockId],
    queryFn: () => plan.missingQuantities(blockId),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: ({ workTypeId, qty }: { workTypeId: Uuid; qty: number }) =>
      plan.setQuantityForBlock(blockId, { workTypeId, plannedQty: qty }),
    onSuccess: (res, { workTypeId }) => {
      toast.success(
        res.designUpdated
          ? `${res.affected} ажилд оруулав. Загварт мөн хадгаллаа.`
          : `${res.affected} ажилд оруулав.`,
      );
      setDrafts((d) => {
        const next = { ...d };
        delete next[workTypeId];

        return next;
      });
      // Тоо хэмжээ өөрчлөгдвөл хувь, төлөв, нэгтгэл бүгд хуучирна.
      qc.invalidateQueries({ queryKey: ["v2-missing-quantities", blockId] });
      qc.invalidateQueries({ queryKey: ["v2-block-summary"] });
      qc.invalidateQueries({ queryKey: ["v2-work-items"] });
      qc.invalidateQueries({ queryKey: ["v2-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data ?? [];
  const totalItems = rows.reduce((s, r) => s + r.workItems, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Тоо хэмжээ нөхөх</DialogTitle>
          <DialogDescription>
            Эдгээр ажилд төлөвлөгөөт тоо хэмжээ бүртгэгдээгүй тул гүйцэтгэл оруулах боломжгүй байна.
            Нэг удаа бичихэд блокийн бүх мөрөнд тарна.
          </DialogDescription>
        </DialogHeader>

        {list.isLoading ? (
          <LoadingRows rows={5} />
        ) : list.error ? (
          <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Бүгд бүртгэгдсэн"
            description="Энэ блокийн бүх ажил төлөвлөгөөт тоо хэмжээтэй байна."
          />
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              {rows.length} ажлын төрөл · нийт {totalItems.toLocaleString("mn-MN")} мөр
            </p>

            <div className="max-h-96 space-y-1 overflow-y-auto">
              {rows.map((r) => {
                const draft = drafts[r.workTypeId] ?? "";
                const qty = Number(draft);
                const valid = draft.trim() !== "" && Number.isFinite(qty) && qty > 0;
                const pending = save.isPending && save.variables?.workTypeId === r.workTypeId;

                return (
                  <div
                    key={r.workTypeId}
                    className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.name}</div>
                      {/* «Нэг юун дээр хэд вэ» гэдгийг тодруулна — 144 айлын
                          НИЙТ тоог бичвэл 144 дахин их болно. */}
                      <div className="text-muted-foreground text-xs">
                        нэг {LEVEL_LABEL[r.level] ?? r.level} хэдэн {r.unit} вэ ·{" "}
                        {r.workItems.toLocaleString("mn-MN")} мөр
                      </div>
                    </div>

                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.001"
                      className="h-9 w-28"
                      placeholder={r.unit}
                      value={draft}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.workTypeId]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      disabled={!valid || save.isPending}
                      onClick={() => save.mutate({ workTypeId: r.workTypeId, qty })}
                    >
                      <Check className="size-3.5" />
                      {pending ? "…" : "Хадгалах"}
                    </Button>
                  </div>
                );
              })}
            </div>

            <p className="text-muted-foreground text-xs">
              Оруулсан тоо <strong>загварт мөн хадгалагдана</strong> — энэ загвараар үүсэх дараагийн
              барилга ижил нүхтэй гарахгүй.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
