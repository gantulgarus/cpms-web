"use client";

/**
 * Давхрын хугацаа — хуваарийг дахин татах.
 *
 * НЭР ТОМЬЁО: олон улсад үүнийг "takt" (герман: хэмнэл) гэдэг. Кодод
 * `takt` гэсэн нэр хэвээр — дэлгэц дээр «давхрын хугацаа» гэж бичнэ.
 *
 * ЯАГААД ХЭРЭГТЭЙ: энэ хугацаа бол ТААМАГ. «Давхар тутам 5 хоног» гэж эхэлсэн ч
 * эхний гурван давхар 8 хоног авсан бол үлдсэн хуваарь бүхэлдээ худал болно.
 * Олон улсад үүнийг re-baseline гэдэг — гүйцэтгэлээ хараад хэмнэлээ засаж,
 * хуваарийг дахин татдаг. Хуваарь засах зам байхгүй бол хүн хоцролтын
 * дугааруудыг зүгээр л үл тоомсорлож эхэлдэг.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { Input } from "@/components/ui/input";
import { plan } from "@/lib/api/v2/endpoints";
import type { Uuid } from "@/lib/api/v2/types";

export function FloorDurationDialog({
  blockId,
  open,
  onOpenChange,
  currentDays = 5,
  floors = 0,
  startDate,
}: {
  blockId: Uuid;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDays?: number;
  floors?: number;
  startDate?: string;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(String(currentDays));
  const [start, setStart] = useState(startDate ?? "");

  const days = Number(value);
  const valid = Number.isInteger(days) && days >= 1 && days <= 60;

  const run = useMutation({
    mutationFn: () => plan.reschedule(blockId, { taktDays: days, startDate: start || undefined }),
    onSuccess: (res) => {
      toast.success(
        `${res.updated} ажлын огноо шинэчлэгдлээ` +
          (res.frozen ? ` · ${res.frozen} батлагдсан ажил хэвээр` : ""),
      );
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["v2-work-items"] });
      qc.invalidateQueries({ queryKey: ["v2-summary"] });
      qc.invalidateQueries({ queryKey: ["v2-block", blockId] });
      qc.invalidateQueries({ queryKey: ["v2-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Ойролцоо үргэлжлэх хугацаа — ажлын өдрийг хуанлийн 7/5 харьцаагаар.
  const weeks = valid && floors > 0 ? Math.round((days * floors * 1.4) / 7) : null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Давхрын хугацаа"
      submitLabel="Хуваарь дахин татах"
      submitDisabled={!valid}
      pending={run.isPending}
      onSubmit={() => run.mutate()}
    >
      <FormField
        label="Нэг давхарт хэдэн ажлын өдөр вэ"
        required
        hint="Баг нэг давхарт төлөвлөгдсөн өдрөө ажиллаад дараагийн давхарт шилжинэ."
      >
        <Input
          type="number"
          min={1}
          max={60}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </FormField>

      <FormField label="Эхлэх огноо" hint="Хоосон бол блокийн одоогийн огноо хэвээр.">
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </FormField>

      {/* Юу болохыг дарахаас ӨМНӨ хэлнэ. */}
      <div className="text-muted-foreground space-y-1 text-xs">
        <p>
          Баг бүр давхар давхраар урсана: 1-р давхарт угсралт дуусмагц өрлөгийн баг ороод, угсралтын
          баг 2-р давхарт гарна.
          {weeks !== null && (
            <>
              {" "}
              {floors} давхарт нэг багийн явц ойролцоогоор <strong>{weeks} долоо хоног</strong>.
            </>
          )}
        </p>
        <p>Бямба, ням тооцоонд орохгүй.</p>
        <p>
          <strong>Батлагдсан ажлын огноо хөндөгдөхгүй</strong> — эс бөгөөс хуваарь татах бүрд
          хоцролт арилах болно.
        </p>
      </div>
    </FormDialog>
  );
}
