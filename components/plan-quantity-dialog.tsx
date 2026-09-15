"use client";

/**
 * Төлөвлөгөөт тоо хэмжээ оруулах.
 *
 * Захиалагчийн Хавсралт-2-т ~30 ажлын төрлийн тоо хэмжээ хоосон байсан тул
 * тэдгээр ажилд үлдэгдэл 0 болж, гүйцэтгэл ОГТ оруулах боломжгүй болдог.
 *
 * Гол шийдэл: асуудалтай тааралдсан ЯГ ТЭР ГАЗРААС засах боломж. Дээрээс нь
 * "энэ төрлийн бүх ажилд мөн адил" сонголт — айлын түвшний нэг ажлын төрөл
 * 16 давхрын барилгад 144 мөр үүсгэдэг тул нэг нэгээр нь бөглөх нь бодит
 * ажлын урсгалд боломжгүй.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { Input } from "@/components/ui/input";
import { plan } from "@/lib/api/v2/endpoints";
import type { WorkItem } from "@/lib/api/v2/types";
import { formatQty } from "@/lib/domain";

export function PlanQuantityDialog({
  item,
  open,
  onOpenChange,
  onDone,
}: {
  item: WorkItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(item.plannedQty ? String(item.plannedQty) : "");
  const [applyToAll, setApplyToAll] = useState(item.plannedQty === 0);

  const value = Number(qty);
  const valid = Number.isFinite(value) && value > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (applyToAll) {
        return plan.setQuantityForBlock(item.blockId, {
          workTypeId: item.workTypeId,
          plannedQty: value,
          // Аль хэдийн бөглөсөн мөрийг дарж бичихгүй — засах гэж байгаад
          // зөв өгөгдлийг устгах нь хамгийн муу үр дүн.
          overwriteExisting: false,
        });
      }

      await plan.updateWorkItem(item.id, { plannedQty: value });

      return { affected: 1, designUpdated: false };
    },
    onSuccess: (res) => {
      toast.success(
        res.affected > 1
          ? `${res.affected} ажилд ${formatQty(value, item.unit)} оруулав.` +
              (res.designUpdated ? " Загварт мөн хадгаллаа." : "")
          : "Тоо хэмжээ хадгалагдлаа.",
      );
      onOpenChange(false);
      // Тоо хэмжээ өөрчлөгдвөл хувь, төлөв, нэгтгэл бүгд хуучирна.
      qc.invalidateQueries({ queryKey: ["v2-work-item"] });
      qc.invalidateQueries({ queryKey: ["v2-work-items"] });
      qc.invalidateQueries({ queryKey: ["v2-summary"] });
      qc.invalidateQueries({ queryKey: ["v2-dashboard"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Төлөвлөгөөт тоо хэмжээ"
      submitLabel="Хадгалах"
      submitDisabled={!valid}
      pending={save.isPending}
      onSubmit={() => save.mutate()}
    >
      <p className="text-muted-foreground text-sm">
        {item.workType.name} · {item.location.path}
      </p>

      <FormField label={`Тоо хэмжээ (${item.unit})`} required>
        <Input
          type="number"
          min={0}
          step="0.001"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          autoFocus
        />
      </FormField>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={applyToAll}
          onChange={(e) => setApplyToAll(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Энэ барилгын «{item.workType.name}» бүх ажилд мөн адил оруулах
          <span className="text-muted-foreground block text-xs">
            Аль хэдийн тоо хэмжээтэй мөрүүд хэвээр үлдэнэ. Блокийн загварт мөн хадгалагдана —
            дараагийн барилга зөв үүснэ.
          </span>
        </span>
      </label>
    </FormDialog>
  );
}
