"use client";

/**
 * Ажлын төрөл засах.
 *
 * ЯАГААД ХЭРЭГТЭЙ ВЭ: урьд нь үүсгэх, устгах л боломжтой байв. Гэтэл
 * АШИГЛАГДАЖ ЭХЭЛСЭН төрлийг устгах боломжгүй — тэр нь зөв дүрэм. Үр дүнд нь
 * нэр буруу бичигдсэн төрөл мөнхөд буруу хэвээр үлддэг байсан: устгаж ч
 * болохгүй, засаж ч болохгүй.
 *
 * НЭГЖ ба ТҮВШИН нь өөр асуудал. Тэдгээр нь аль хэдийн үүссэн ажлын мөрүүдэд
 * шингэсэн байдаг: «м²» гэж бүртгэсэн 3,290 мөрийг «ш» болгон дахин
 * тайлбарлах боломжгүй. Тиймээс ашиглагдаж эхэлсэн төрөлд эдгээрийг
 * серверээс түгждэг — энд зөвхөн урьдчилж хэлнэ.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { Input } from "@/components/ui/input";
import { referenceData } from "@/lib/api/v2/endpoints";
import type { LocationLevel, WorkType } from "@/lib/api/v2/types";

/** Байршлын түвшний монгол нэр — «нэг юун дээр үүсэх вэ». */
const LEVELS: { value: LocationLevel; label: string }[] = [
  { value: "block", label: "Барилга — нэг удаа" },
  { value: "floor", label: "Давхар — давхар бүрд" },
  { value: "unit", label: "Айл — айл бүрд" },
  { value: "common", label: "Нийтийн талбай" },
];

export function EditWorkTypeDialog({
  workType,
  inUse,
  open,
  onOpenChange,
}: {
  workType: WorkType;
  /** Энэ төрлөөр ажлын мөр үүссэн эсэх — нэгж, түвшин түгжигдэнэ. */
  inUse: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(workType.name);
  const [groupId, setGroupId] = useState(workType.groupId);
  const [code, setCode] = useState(workType.code ?? "");
  const [codePart, setCodePart] = useState(workType.codePart ?? "");
  const [unit, setUnit] = useState(workType.unit);
  const [level, setLevel] = useState<LocationLevel>(workType.level);

  const groups = useQuery({ queryKey: ["v2-wt-groups"], queryFn: referenceData.groups });

  const save = useMutation({
    mutationFn: () =>
      referenceData.updateType(workType.id, {
        name: name.trim(),
        groupId,
        /*
         * Код нь АШИГЛАГДСАН ч засагдана.
         *
         * Нэгж, түвшнээс ялгаатай нь код нь үүссэн ажлын мөрүүдэд
         * шингэдэггүй — зөвхөн ДАРААГИЙН импортод хэрэглэгдэнэ.
         * Буруу код тогтоогдвол тэр төрөл рүү дахиж импорт орохгүй
         * болох тул засах боломж зайлшгүй.
         */
        code: code.trim(),
        codePart: codePart.trim(),
        // Түгжигдсэн бол огт илгээхгүй — сервер 409 буцаана.
        ...(inUse ? {} : { unit: unit.trim(), level }),
      }),
    onSuccess: (updated) => {
      toast.success(`«${updated.name}» шинэчлэгдлээ`);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["v2-work-types"] });
      qc.invalidateQueries({ queryKey: ["v2-wt-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changed =
    name.trim() !== workType.name ||
    groupId !== workType.groupId ||
    code.trim() !== (workType.code ?? "") ||
    codePart.trim() !== (workType.codePart ?? "") ||
    (!inUse && (unit.trim() !== workType.unit || level !== workType.level));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ажлын төрөл засах"
      submitLabel="Хадгалах"
      submitDisabled={!name.trim() || !unit.trim() || !changed}
      pending={save.isPending}
      onSubmit={() => save.mutate()}
    >
      <FormField label="Нэр" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </FormField>

      <FormField label="Бүлэг" required hint="Бүлэг нь ажлын дарааллыг тодорхойлно.">
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          {(groups.data?.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Төсвийн код"
          hint="Импорт ажлыг НЭРЭЭР биш энэ кодоор таньдаг."
        >
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="4.1.7" />
        </FormField>

        <FormField label="Бүрдэл" hint="Нэг код олон ажилтай бол ялгана.">
          <Input
            value={codePart}
            onChange={(e) => setCodePart(e.target.value)}
            placeholder="Айлын тагт"
          />
        </FormField>
      </div>

      {/* Кодгүй төрөл рүү импортоор ажил ОРОХГҮЙ — зөвхөн гараар. */}
      {!code.trim() && (
        <p className="text-muted-foreground text-xs">
          Код хоосон байвал энэ төрөл рүү төсвөөс ажил үүсэхгүй — зөвхөн гараар нэмж болно.
        </p>
      )}

      {inUse && (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          Энэ төрлөөр ажил үүссэн тул <strong>нэгж ба түвшин түгжигдсэн</strong>. Тэдгээр нь
          бүртгэгдсэн тоо хэмжээнд шингэсэн — солих шаардлагатай бол шинэ төрөл үүсгэнэ үү.
        </p>
      )}

      <FormField label="Хэмжих нэгж" required>
        <Input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          disabled={inUse}
          placeholder="м2"
        />
      </FormField>

      <FormField label="Аль түвшинд үүсэх вэ" required>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as LocationLevel)}
          disabled={inUse}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm disabled:opacity-60"
        >
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </FormField>
    </FormDialog>
  );
}
