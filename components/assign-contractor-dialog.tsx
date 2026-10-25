"use client";

/**
 * Ганц ажлын мөрийн хариуцагчийг солих.
 *
 * ЯАГААД ХЭРЭГТЭЙ ВЭ: оноолт нь ажлын БҮЛГЭЭР хийгддэг — «А блокийн бүх
 * заслыг Гоо Засал». Бодит амьдрал дээр үүнээс гажих тохиолдол байнга
 * гардаг: нэг давхрын хэдэн айлыг өөр компани авсан, эсвэл бүлгээр оноохдоо
 * андуурсан.
 *
 * Тэр үед бүлгээ бүхэлд нь дахин оноох нь 1,889 мөрийг хөдөлгөнө — хэт том
 * алх. Сервер дээр ганц мөр солих эндпойнт бэлэн байсан ч дуудах цонх
 * байгаагүй.
 *
 * ХЯЗГААРЛАЛТ: гүйцэтгэл орсон ажлын хариуцагчийг сольж болохгүй — хийсэн
 * ажил өөр компанийн нэр дээр шилжиж, актын түүх эвдэрнэ. Серверийн дүрэм,
 * энд зөвхөн урьдчилж хэлнэ.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { assignments, contractors } from "@/lib/api/endpoints";
import type { WorkItem } from "@/lib/api/types";
import { formatQty } from "@/lib/domain";

export function AssignContractorDialog({
  item,
  open,
  onOpenChange,
  onDone,
}: {
  item: WorkItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [contractorId, setContractorId] = useState(item.contractor?.id ?? "");

  const list = useQuery({
    queryKey: ["contractors"],
    queryFn: () => contractors.list(),
    enabled: open,
  });

  // Гүйцэтгэл орсон бол сольж болохгүй — серверийн дүрмийг урьдчилж хэлнэ.
  const locked = item.reportedQty > 0 && Boolean(item.contractor);

  const save = useMutation({
    mutationFn: () => assignments.assignOne(item.id, contractorId || null),
    onSuccess: (updated) => {
      toast.success(
        updated.contractor ? `${updated.contractor.name} хариуцах боллоо` : "Хариуцагчийг авлаа",
      );
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["work-item", item.id] });
      qc.invalidateQueries({ queryKey: ["work-items"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Хариуцагч солих"
      submitLabel="Хадгалах"
      submitDisabled={locked || contractorId === (item.contractor?.id ?? "")}
      pending={save.isPending}
      onSubmit={() => save.mutate()}
    >
      <div className="bg-muted/50 rounded-md px-3 py-2 text-sm">
        <div className="font-medium">{item.name}</div>
        <div className="text-muted-foreground text-xs">{item.location.path}</div>
      </div>

      {locked ? (
        <p className="text-destructive text-xs" role="alert">
          Энэ ажилд {formatQty(item.reportedQty, item.unit)} гүйцэтгэл бүртгэгдсэн байна.
          Хариуцагчийг солих боломжгүй — хийсэн ажил өөр компанийн нэр дээр шилжинэ.
        </p>
      ) : (
        <FormField label="Гүйцэтгэгч" hint="Хоосон сонгвол хариуцагчгүй болно.">
          <select
            value={contractorId}
            onChange={(e) => setContractorId(e.target.value)}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">— хариуцагчгүй —</option>
            {(list.data?.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <p className="text-muted-foreground text-xs">
        Энэ нь <strong>зөвхөн энэ нэг мөрөнд</strong> нөлөөлнө. Бүлгээр оноох бол блокийн хуудасны
        «Хариуцагч оноох» хэсгийг ашиглана уу.
      </p>
    </FormDialog>
  );
}
