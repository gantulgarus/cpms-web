"use client";

/**
 * Хугацаа сунгах цонх.
 *
 * ЯАГААД ШАЛТГААН ЗААВАЛ ВЭ: огноог чимээгүй хойшлуулж болдог бол «хугацаа
 * хэтэрсэн» гэсэн тоо утгагүй болно — хэн ч хэзээ ч хоцрохгүй. Шалтгаан нь
 * мөн статистик болж хуримтлагдана: «17 ажил хоцорсон, түүний 12 нь материал
 * дутсанаас» гэдэг нь шийдвэр гаргуулдаг, «17 хоцорсон» гэдэг нь гаргуулдаггүй.
 *
 * Шалтгааныг асуудлын бүртгэлд хадгална — хоцролтын статистик нэг дороос
 * гарна.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { ISSUE_CATEGORIES } from "@/components/issue-panel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { schedule } from "@/lib/api/v2/endpoints";
import type { IssueCategory, Uuid } from "@/lib/api/v2/types";
import { formatDate, todayInProjectZone } from "@/lib/domain";

/** Хугацаа хэтэрсэн ажилд хамгийн түгээмэл сунгалт — долоо хоног. */
const DEFAULT_EXTENSION_DAYS = 7;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);

  return d.toISOString().slice(0, 10);
}

export function ExtendDeadlineDialog({
  workItemId,
  workItemName,
  currentEndDate,
  overdueDays,
  open,
  onOpenChange,
  onDone,
}: {
  workItemId: Uuid;
  workItemName: string;
  currentEndDate?: string | null;
  overdueDays?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();

  // Анхдагч нь ӨНӨӨДРӨӨС хойш долоо хоног — хугацаа нь аль хэдийн өнгөрсөн
  // тул хуучин огноон дээр нэмэх нь дахин хоцорсон огноо өгнө.
  const [endDate, setEndDate] = useState(() =>
    addDays(todayInProjectZone(), DEFAULT_EXTENSION_DAYS),
  );
  const [category, setCategory] = useState<IssueCategory>("material_shortage");
  const [reason, setReason] = useState("");

  const valid = Boolean(endDate) && reason.trim().length > 0;
  const later = !currentEndDate || endDate > currentEndDate;

  const extend = useMutation({
    mutationFn: () =>
      schedule.extend(workItemId, {
        plannedEndDate: endDate,
        category,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success("Хугацаа сунгагдлаа");
      onOpenChange(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["v2-queue"] });
      qc.invalidateQueries({ queryKey: ["v2-queue-counts"] });
      qc.invalidateQueries({ queryKey: ["v2-work-item", workItemId] });
      qc.invalidateQueries({ queryKey: ["v2-work-items"] });
      qc.invalidateQueries({ queryKey: ["v2-issues"] });
      qc.invalidateQueries({ queryKey: ["v2-dashboard"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Хугацаа сунгах"
      submitLabel="Сунгах"
      submitDisabled={!valid || !later}
      pending={extend.isPending}
      onSubmit={() => extend.mutate()}
    >
      <div className="bg-muted/50 rounded-md px-3 py-2 text-sm">
        <div className="font-medium">{workItemName}</div>
        <div className="text-muted-foreground text-xs">
          Одоогийн хугацаа: {formatDate(currentEndDate)}
          {overdueDays && overdueDays > 0 ? ` · ${overdueDays} хоног хэтэрсэн` : ""}
        </div>
      </div>

      <FormField label="Шинэ дуусах огноо" required>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          aria-invalid={!later || undefined}
        />
      </FormField>

      {!later && (
        <p className="text-destructive text-xs" role="alert">
          Шинэ огноо одоогийнхоос хойш байх ёстой. Огноог урагш татах нь хоцролтыг хиймлээр
          үүсгэнэ.
        </p>
      )}

      <FormField label="Саатлын шалтгаан" required>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as IssueCategory)}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          {ISSUE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Тайлбар" required hint="Юу болсон, хэзээ шийдэгдэх вэ.">
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Цонхны хүргэлт 2 долоо хоногоор хоцорсон. Ханган нийлүүлэгч 9/20-нд өгнө гэсэн."
        />
      </FormField>

      <p className="text-muted-foreground text-xs">
        Шалтгаан нь <strong>асуудлын бүртгэлд</strong> хадгалагдана. Хуучин огноо тайлбарт
        үлдэх тул хэдэн хоногоор сунгасныг хожим тоолж болно.
      </p>
    </FormDialog>
  );
}
