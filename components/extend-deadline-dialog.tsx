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
import { schedule } from "@/lib/api/endpoints";
import { useMe } from "@/lib/api/use-me";
import type { IssueCategory, Uuid } from "@/lib/api/types";
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
  const { me } = useMe();
  const [category, setCategory] = useState<IssueCategory>("material_shortage");
  const [reason, setReason] = useState("");

  /*
   * Тайлбар нь дор хаяж 10 тэмдэгт — серверийн дүрэм.
   *
   * Урьд нь зөвхөн «хоосон биш» гэж шалгадаг байсан тул «х» гэж бичээд
   * өнгөрдөг байв. Тэр нь шалтгаан биш, зүгээр л хоригийг тойрсон хэлбэр.
   */
  const valid = Boolean(endDate) && reason.trim().length >= 10;
  const later = !currentEndDate || endDate > currentEndDate;

  const extend = useMutation({
    mutationFn: () =>
      schedule.extend(workItemId, {
        plannedEndDate: endDate,
        category,
        reason: reason.trim(),
      }),
    onSuccess: (res) => {
      /*
       * Батлагдсан ба хүлээгдэж байгааг ЯЛГАЖ хэлнэ.
       *
       * Нэг мессеж харуулбал хүсэлт гаргасан хүн хуваариа өөрчлөгдсөн гэж
       * бодоод явна — дараа нь хоцролт хэвээр байхад яагаад гэдгийг
       * ойлгохгүй.
       */
      toast.success(
        res.meta.applied
          ? "Хугацаа сунгагдлаа"
          : "Хүсэлт илгээгдлээ — ерөнхий инженер батлахыг хүлээж байна",
      );
      qc.invalidateQueries({ queryKey: ["extensions"] });
      onOpenChange(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["queue-counts"] });
      qc.invalidateQueries({ queryKey: ["work-item", workItemId] });
      qc.invalidateQueries({ queryKey: ["work-items"] });
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onDone?.();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      // Another device may have submitted a request while this dialog was open.
      qc.invalidateQueries({ queryKey: ["extensions"] });
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={me?.canApproveExtensions ? "Хугацаа сунгах" : "Хугацаа сунгах хүсэлт"}
      submitLabel={me?.canApproveExtensions ? "Сунгах" : "Хүсэлт илгээх"}
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

      {/* Хэрэглэгч товч дарахаас ӨМНӨ юу болохыг мэдэх ёстой: огноо
          хөдлөх үү, эсвэл хүсэлт хүлээх үү. */}
      <p className="text-muted-foreground text-xs">
        {me?.canApproveExtensions ? (
          <>
            Та батлах эрхтэй тул хугацаа <strong>тэр дор нь</strong> хойшилно.
          </>
        ) : (
          <>
            Энэ нь <strong>хүсэлт</strong>. Ерөнхий инженер батлах хүртэл хугацаа хөдлөхгүй.
          </>
        )}{" "}
        Шалтгаан нь <strong>асуудлын бүртгэлд</strong> хадгалагдана.{" "}
        <strong>Үндсэн төлөвлөгөө</strong> хөндөгдөхгүй — хуваарийн гулсалт тайланд үлдэнэ.
      </p>
    </FormDialog>
  );
}
