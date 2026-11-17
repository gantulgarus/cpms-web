"use client";

/**
 * Энэ БАРИЛГАД ажил төлөвлөх.
 *
 * ЛАВЛАХ САНГААС ЯЛГАА: лавлах сан нь "ийм ажил гэж байдаг" гэсэн компанийн
 * толь бичиг. Энэ дэлгэц нь "энэ барилгад тэр ажил хийгдэнэ" гэж төлөвлөнө.
 *
 * ЯАГААД ТҮВШНЭЭС ЭХЭЛДЭГ ВЭ: барилгын төлөвлөлт олон улсад БАЙРШЛААР явдаг
 * (location-based planning). Инженерийн бодох арга нь "нэг давхарт ямар
 * ажлууд хийгдэх вэ" — 47 ажлын төрлийн жагсаалтаас нэгийг хайх биш.
 * Тиймээс эхлээд түвшнээ сонгоод, тэр түвшний ажлуудаас БАГЦААР сонгоно.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { blocks as blocksApi, plan, referenceData } from "@/lib/api/endpoints";
import type { LocationLevel, Uuid } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { matchesCatalogFloor } from "@/lib/reference/infer-work-location";

const LEVELS: { value: LocationLevel; label: string; hint: string }[] = [
  {
    value: "block",
    label: "Барилга бүхэлдээ",
    hint: "Нэг удаа хийгдэх ажил — суурь, дээвэр, фасад",
  },
  {
    value: "floor",
    label: "Давхар бүрт",
    hint: "Давхар давтагдах ажил — угсралт, өрлөг, шугам сүлжээ",
  },
  { value: "unit", label: "Айл бүрт", hint: "Айл дотор хийгдэх ажил — шал, хаалга, дотор засал" },
];

export function AddWorkTypeDialog({
  blockId,
  open,
  onOpenChange,
  onDone,
}: {
  blockId: Uuid;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [level, setLevel] = useState<LocationLevel>("floor");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [locationSearch, setLocationSearch] = useState("");
  const [plannedQty, setPlannedQty] = useState("");

  const typesQuery = useQuery({
    queryKey: ["work-catalog"],
    queryFn: () => referenceData.catalog(),
    enabled: open,
  });
  const locationsQuery = useQuery({
    queryKey: ["locations", blockId],
    queryFn: () => blocksApi.locations(blockId),
    enabled: open,
  });

  /** Сонгосон түвшний ажлын төрлүүд, бүлгээр бүлэглэсэн. */
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (typesQuery.data?.data ?? [])
      .filter((t) => t.workTypeId && t.unit && t.level === level)
      .filter((t) => !q || `${t.systemCode} ${t.name} ${t.typeName} ${t.groupName}`.toLowerCase().includes(q))
      .map((t) => ({ ...t, id: t.workTypeId! }));

    const map = new Map<string, typeof rows>();
    for (const t of rows) {
      const key = t.groupName ?? "Бусад";
      map.set(key, [...(map.get(key) ?? []), t]);
    }

    return [...map.entries()];
  }, [typesQuery.data, level, search]);

  const reset = () => {
    setPicked(new Set());
    setSelectedLocations(new Set());
    setLocationSearch("");
    setSearch("");
    setPlannedQty("");
  };

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });

  const add = useMutation({
    mutationFn: () =>
      plan.addWorkType(blockId, {
        workTypeIds: [...picked],
        locationIds: [...selectedLocations],
        plannedQty: plannedQty ? Number(plannedQty) : undefined,
      }),
    onSuccess: (res) => {
      toast.success(
        `${res.created} ажил нэмэгдлээ` +
          (res.skipped?.length ? ` · ${res.skipped.length} алгасав` : ""),
      );
      onOpenChange(false);
      reset();
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["work-items"] });
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const locations = locationsQuery.data?.data ?? [];
  const availableLocations = locations.filter((location) => location.level === level);
  const visibleLocations = availableLocations.filter((location) => location.path.toLocaleLowerCase().includes(locationSearch.trim().toLocaleLowerCase()));
  const willCreate = (typesQuery.data?.data ?? []).filter((entry) => entry.workTypeId && picked.has(entry.workTypeId))
    .reduce((sum, entry) => sum + (locationsQuery.data?.data ?? []).filter((location) => location.level === entry.level && selectedLocations.has(location.id)
      && matchesCatalogFloor(entry, location, locationsQuery.data?.data ?? [])).length, 0);

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
      title="Энэ барилгад ажил нэмэх"
      className="sm:max-w-2xl"
      submitLabel={willCreate > 0 ? `${willCreate} ажил нэмэх` : "Нэмэх"}
      submitDisabled={picked.size === 0 || willCreate === 0 || locationsQuery.isLoading || typesQuery.isLoading}
      pending={add.isPending}
      onSubmit={() => add.mutate()}
    >
      {/* 1. Түвшин — «давхрын ажил нэмэх» гэдэг нь энэ. */}
      <FormField label="Ажил хаана хийгдэх вэ" required>
        <div className="grid gap-2 sm:grid-cols-3">
          {LEVELS.map((l) => {
            const n = (locationsQuery.data?.data ?? []).filter((x) => x.level === l.value).length;

            return (
              <button
                key={l.value}
                type="button"
                disabled={n === 0}
                onClick={() => {
                  setLevel(l.value);
                  setPicked(new Set());
                  setSelectedLocations(new Set());
                  setLocationSearch("");
                }}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  level === l.value ? "border-primary bg-accent" : "hover:bg-accent/40",
                  n === 0 && "cursor-not-allowed opacity-45",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{l.label}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {n === 0 ? "байхгүй" : `${n} байршил`}
                  </span>
                </div>
                <div className="text-muted-foreground text-xs">{l.hint}</div>
              </button>
            );
          })}
        </div>
      </FormField>

      <FormField label="Байршил сонгох" required>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedLocations(new Set(availableLocations.map((location) => location.id)))}>Бүгдийг сонгох</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedLocations(new Set())}>Сонголт цэвэрлэх</Button>
          <span className="text-muted-foreground text-xs">{selectedLocations.size} байршил сонгосон</span>
        </div>
        <Input aria-label="Байршил хайх" placeholder="Давхар, тоотоор хайх…" value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} className="mb-2" />
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
          {locationsQuery.isLoading ? <p className="text-sm">Байршил ачаалж байна…</p> : locationsQuery.error ? <p role="alert" className="text-destructive text-sm">Байршил ачаалсангүй. Цонхоо дахин нээнэ үү.</p> : visibleLocations.length === 0 ? <p className="text-muted-foreground text-sm">Байршил олдсонгүй.</p> : visibleLocations.map((location) => <label key={location.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/40">
            <input type="checkbox" checked={selectedLocations.has(location.id)} onChange={() => setSelectedLocations((previous) => { const next = new Set(previous); if (next.has(location.id)) next.delete(location.id); else next.add(location.id); return next; })} />
            <span>{location.path}</span>
          </label>)}
        </div>
      </FormField>

      {/* 2. Тэр түвшний ажлууд — бүлэглэсэн, хайлттай, олноор сонгоно. */}
      <FormField label="Ямар ажлууд хийгдэх вэ" required>
        <div className="relative mb-2">
          <Search className="text-muted-foreground absolute top-2.5 left-2 size-3.5" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ажлын нэрээр хайх…"
            className="h-8 pl-7"
          />
        </div>

        <div className="max-h-[35dvh] min-h-32 space-y-2 overflow-y-auto rounded-md border p-2">
          {grouped.length === 0 ? (
            <p className="text-muted-foreground p-2 text-sm">Энэ түвшинд ажлын төрөл олдсонгүй.</p>
          ) : (
            grouped.map(([groupName, rows]) => (
              <div key={groupName}>
                <div className="text-muted-foreground mb-1 px-1 text-xs font-medium">
                  {groupName}
                </div>
                <div className="space-y-0.5">
                  {rows.map((t) => {
                    const on = picked.has(t.id);

                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggle(t.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                          on ? "bg-accent" : "hover:bg-accent/40",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border",
                            on && "border-primary bg-primary text-primary-foreground",
                          )}
                        >
                          {on && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-normal break-words">{t.name}</span>
                        <span className="text-muted-foreground shrink-0 text-xs">{t.unit}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </FormField>

      <FormField label="Тоо хэмжээ (нэг байршилд)" hint="Хоосон бол дараа нь оруулж болно.">
        <Input
          type="number"
          min={0}
          step="0.001"
          value={plannedQty}
          onChange={(e) => setPlannedQty(e.target.value)}
        />
      </FormField>

      {/* Хэдэн мөр үүсэхийг дарахаас ӨМНӨ хэлнэ. */}
      <p className="text-muted-foreground text-xs">
        {picked.size === 0 ? (
          <>
            Хэрэгтэй ажил жагсаалтад байхгүй бол <strong>Лавлах сан → Ажлын жагсаалт</strong>{" "}
            хэсэгт тухайн ажлын дутуу нэгж эсвэл «Байршил тодруулах» мэдээллийг нөхнө үү.
          </>
        ) : (
          <>
            Сонгосон <strong>{picked.size} ажил</strong>-ыг сонгосон байршлуудад эх мэдээллийн давхрын хязгаарын дагуу нэмж,
            нийт <strong>{willCreate} мөр</strong> үүсгэнэ. Аль хэдийн нэмэгдсэн нь алгасагдана.
          </>
        )}
      </p>
    </FormDialog>
  );
}
