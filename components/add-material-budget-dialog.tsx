"use client";

/**
 * Төсөвт БАЙХГҮЙ материалыг гараар нэмэх.
 *
 * ЯАГААД ХЭРЭГТЭЙ ВЭ: төсвийн файлын 109 мөр эвдэрсэн, 14 мөр
 * таараагүй. Тэднийг оруулахын тулд бүх төсвийг дахин импортлох нь
 * хэт том алхам.
 *
 * ТОО ХЭМЖЭЭГ БАЙРШЛААР өгнө. Нийт дүн задаргаанаас бодогдоно —
 * хоёрыг тусад нь авбал зөрөх эрсдэлтэй. Бүхэл барилгад хамаарах
 * материалыг блокийн үндэс байршилд бичнэ.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { blocks, materialBudget } from "@/lib/api/endpoints";
import { MATERIAL_UNITS } from "@/lib/domain";

interface QtyRow {
  key: number;
  locationId: string;
  quantity: string;
}

export function AddMaterialBudgetDialog({
  open,
  onOpenChange,
  blockId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blockId: string;
  onDone: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {/* Нээгдэх үед л монтлоно — өмнөх утга үлдэхгүй. */}
        {open && (
          <Body blockId={blockId} onDone={onDone} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  blockId,
  onDone,
  onClose,
}: {
  blockId: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [unit, setUnit] = useState("ш");
  const [actual, setActual] = useState("");
  const [market, setMarket] = useState("");
  const [rows, setRows] = useState<QtyRow[]>([{ key: 0, locationId: "", quantity: "" }]);
  const [nextKey, setNextKey] = useState(1);

  /*
   * queryKey нь `AddWorkTypeDialog`-тай ИЖИЛ тул ижил хэлбэр буцаах
   * ёстой — энвелопыг задалбал кэш хоёр өөр хэлбэр барина
   * (verify-mock-ийн статик шалгалт үүнийг барина).
   */
  const locationsQuery = useQuery({
    queryKey: ["locations", blockId],
    queryFn: () => blocks.locations(blockId),
  });

  const locations = useMemo(() => locationsQuery.data?.data ?? [], [locationsQuery.data]);

  const locationLabels = useMemo(
    () => Object.fromEntries(locations.map((l) => [l.id, l.name])),
    [locations],
  );

  const filled = rows.filter((r) => r.locationId && Number(r.quantity) > 0);
  const total = filled.reduce((n, r) => n + Number(r.quantity), 0);

  const create = useMutation({
    mutationFn: () =>
      materialBudget.create(blockId, {
        code: code.trim(),
        name: name.trim(),
        grade: grade.trim() || null,
        unit,
        actualUnitPrice: actual ? Number(actual) : null,
        marketUnitPrice: market ? Number(market) : null,
        quantities: filled.map((r) => ({
          locationId: r.locationId,
          quantity: Number(r.quantity),
        })),
      }),
    onSuccess: () => {
      toast.success(`«${name.trim()}» төсөвт нэмэгдлээ.`);
      qc.invalidateQueries({ queryKey: ["block-budget", blockId] });
      qc.invalidateQueries({ queryKey: ["material-balance"] });
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = Boolean(code.trim() && name.trim() && filled.length > 0);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Материал нэмэх</DialogTitle>
        <DialogDescription>
          Төсвийн файлд ороогүй материалыг гараар бүртгэнэ. Тоо хэмжээг байршлаар өгнө.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Код">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="2.3.12"
            />
          </Field>
          <Field label="Нэр" className="sm:col-span-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Шатны тор"
            />
          </Field>
          <Field label="Марк / хэмжээс">
            <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="М250" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Хэмжих нэгж">
            <Select
              value={unit}
              items={Object.fromEntries(MATERIAL_UNITS.map((u) => [u, u]))}
              onValueChange={(v) => setUnit(v ?? "ш")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATERIAL_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Бодит нэгж үнэ">
            <Input
              type="number"
              min={0}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
          </Field>
          <Field label="Зах зээлийн нэгж үнэ">
            <Input
              type="number"
              min={0}
              value={market}
              onChange={(e) => setMarket(e.target.value)}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs">
            Тоо хэмжээ байршлаар
            <span className="ml-2 tabular-nums">
              нийт {total.toLocaleString("mn-MN")} {unit}
            </span>
          </Label>

          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={row.locationId}
                  items={locationLabels}
                  onValueChange={(v) =>
                    setRows((xs) =>
                      xs.map((r) => (r.key === row.key ? { ...r, locationId: v ?? "" } : r)),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Байршил сонгох" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Input
                type="number"
                min={0}
                step="0.001"
                className="w-32"
                placeholder={unit}
                value={row.quantity}
                onChange={(e) =>
                  setRows((xs) =>
                    xs.map((r) => (r.key === row.key ? { ...r, quantity: e.target.value } : r)),
                  )
                }
              />

              {rows.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Мөр хасах"
                  onClick={() => setRows((xs) => xs.filter((r) => r.key !== row.key))}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRows((xs) => [...xs, { key: nextKey, locationId: "", quantity: "" }]);
              setNextKey((n) => n + 1);
            }}
          >
            <Plus className="size-4" /> Байршил нэмэх
          </Button>

          {/* Бетон захиалгын үлдэгдэл ДАВХРААР бодогддог — задаргаагүй
              бетон тэнд харагдахгүй. */}
          <p className="text-muted-foreground text-xs">
            Бүхэл барилгад хамаарах материалыг блокийн нэр дээр бичнэ. Бетоныг давхар бүрээр
            задалж бичих нь зүйтэй — захиалгын үлдэгдэл давхраар бодогддог.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Болих
        </Button>
        <Button onClick={() => create.mutate()} disabled={!ready || create.isPending}>
          {create.isPending ? "Хадгалж байна…" : "Нэмэх"}
        </Button>
      </DialogFooter>
    </>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
