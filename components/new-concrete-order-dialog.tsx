"use client";

/**
 * Шинэ бетон захиалга.
 *
 * ҮЛДЭГДЭЛ НЬ ХЭЛБЭРИЙН ТӨВД. Инженер давхраа сонгоход тэр давхрын
 * төсөв, өмнө нь захиалсан, үлдэгдэл нь ТЭР ДОР НЬ гарна. Хэмжээ
 * бичихэд нь үлдэгдэл хасагдаж, хэтэрвэл улаан болно.
 *
 * ХЭТРЭЛТИЙГ ХОРИГЛОХГҮЙ. Бодит амьдралд нэмэлт ажил гардаг — системийн
 * үүрэг нь зогсоох биш, ХАРУУЛАХ.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { concreteOrders } from "@/lib/api/v2/endpoints";
import type { Block } from "@/lib/api/v2/types";
import { formatQty } from "@/lib/domain";
import { cn } from "@/lib/utils";

/** Бланк дээрх «Бетон анги» — ердийн сонголтууд. */
const CLASSES = ["B15", "B20", "B22.5", "B25", "B30", "B35"];

export function NewConcreteOrderDialog({
  open,
  onOpenChange,
  blocks,
  defaultBlockId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blocks: Block[];
  defaultBlockId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {/*
          Маягтыг нээгдэх үед л МОНТЛОНО.
          Ингэснээр өмнөх захиалгын утга үлдэхгүй бөгөөд `useEffect`-ээр
          төлөв цэвэрлэх шаардлагагүй — цэвэрлэгээ нь монтлолт өөрөө.
        */}
        {open && <OrderForm blocks={blocks} defaultBlockId={defaultBlockId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function OrderForm({
  blocks,
  defaultBlockId,
  onDone,
}: {
  blocks: Block[];
  defaultBlockId?: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();

  const [blockId, setBlockId] = useState(defaultBlockId ?? "");
  const [key, setKey] = useState(""); // «locationId|materialId»
  const [pourDate, setPourDate] = useState("");
  const [pourHalf, setPourHalf] = useState<"am" | "pm">("am");
  const [pourTime, setPourTime] = useState("08:00");
  const [structure, setStructure] = useState("");
  const [concreteClass, setConcreteClass] = useState("");
  const [slumpCm, setSlumpCm] = useState("");
  const [quantity, setQuantity] = useState("");
  const [needsPump, setNeedsPump] = useState(false);
  const [notes, setNotes] = useState("");

  /*
   * «3 хоногийн өмнө» гэсэн хилийн ОГНОО — монтлох үед НЭГ удаа.
   *
   * `Date.now()` -ийг render дотор дуудвал функц цэвэр биш болно.
   * Огноог мөрөөр нь харьцуулах нь цэвэр үйлдэл бөгөөд диалог нээгдэх
   * болгонд шинэчлэгддэг тул хангалттай нарийвчлалтай.
   */
  const [rushCutoff] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);

    return d.toISOString().slice(0, 10);
  });

  const balance = useQuery({
    queryKey: ["v2-concrete-balance", blockId],
    queryFn: () => concreteOrders.balance(blockId).then((r) => r.data),
    enabled: Boolean(blockId),
  });

  const rows = useMemo(() => balance.data ?? [], [balance.data]);
  const chosen = rows.find((r) => `${r.locationId}|${r.materialId}` === key);

  /*
   * `Select.Value` нь УТГЫГ харуулдаг, шошгыг БИШ. UUID эсвэл «am»
   * гэсэн түлхүүр товчин дээр шууд гарахаас сэргийлж хүснэгт өгнө.
   */
  const blockLabels = useMemo(
    () => Object.fromEntries(blocks.map((b) => [b.id, b.name])),
    [blocks],
  );

  const rowLabels = useMemo(
    () =>
      Object.fromEntries(
        rows.map((r) => [
          `${r.locationId}|${r.materialId}`,
          `${r.locationName} · ${r.materialName} (${formatQty(r.remaining, r.unit)} үлдсэн)`,
        ]),
      ),
    [rows],
  );

  const qty = Number(quantity) || 0;
  const after = chosen ? Math.round((chosen.remaining - qty) * 1000) / 1000 : null;

  /*
   * 3 хоногийн хугацаа — бланк дээрх анхааруулга.
   *
   * Хориглохгүй, зөвхөн харуулна: яаралтай цутгалт бодитоор гардаг.
   */
  const isRush = pourDate !== "" && pourDate < rushCutoff;

  const create = useMutation({
    mutationFn: () =>
      concreteOrders.create(blockId, {
        locationId: chosen!.locationId,
        materialId: chosen!.materialId,
        pourDate,
        pourHalf,
        pourTime: pourTime || null,
        structure,
        concreteClass: concreteClass || null,
        slumpCm: slumpCm ? Number(slumpCm) : null,
        quantity: qty,
        needsPump,
        notes: notes || null,
      }),
    onSuccess: (order) => {
      toast.success(`${order.number} драфт үүслээ — илгээх хүртэл төсөв иддэггүй.`);
      qc.invalidateQueries({ queryKey: ["v2-concrete-orders"] });
      qc.invalidateQueries({ queryKey: ["v2-concrete-balance"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = Boolean(blockId && chosen && pourDate && structure.trim() && qty > 0);

  return (
    <>
        <DialogHeader>
          <DialogTitle>Шинэ бетон захиалга</DialogTitle>
          <DialogDescription>
            Бланк дээрх мөрүүд. Драфтаар хадгалагдах тул илгээх хүртэл төсөв иддэггүй.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Блок">
              <Select
                value={blockId}
                items={blockLabels}
                onValueChange={(v) => {
                  setBlockId(v ?? "");
                  setKey("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Сонгоно уу" />
                </SelectTrigger>
                <SelectContent>
                  {blocks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Давхар ба марк">
              <Select
                value={key}
                items={rowLabels}
                onValueChange={(v) => setKey(v ?? "")}
                disabled={!blockId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={blockId ? "Сонгоно уу" : "Эхлээд блок"} />
                </SelectTrigger>
                <SelectContent>
                  {rows.map((r) => (
                    <SelectItem
                      key={`${r.locationId}|${r.materialId}`}
                      value={`${r.locationId}|${r.materialId}`}
                    >
                      {r.locationName} · {r.materialName} ({formatQty(r.remaining, r.unit)} үлдсэн)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Үлдэгдлийн самбар — энэ хэлбэрийн гол зүйл. */}
          {chosen && (
            <div
              className={cn(
                "rounded-md border p-3 text-sm",
                after !== null && after < 0
                  ? "border-red-500/50 bg-red-500/5"
                  : "bg-muted/40",
              )}
            >
              <div className="grid grid-cols-3 gap-2 tabular-nums">
                <Mini label="Төсөв" value={formatQty(chosen.budget, chosen.unit)} />
                <Mini label="Өмнө захиалсан" value={formatQty(chosen.ordered, chosen.unit)} />
                <Mini
                  label="Энэ захиалгын дараа"
                  value={after === null ? "—" : formatQty(after, chosen.unit)}
                  tone={after !== null && after < 0 ? "red" : undefined}
                />
              </div>
              {after !== null && after < 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                  <AlertTriangle className="size-3.5" />
                  Төсвөөс {formatQty(Math.abs(after), chosen.unit)}-ээр хэтэрч байна. Хориглоогүй ч
                  баталгаажуулах шатанд харагдана.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Цутгалтын огноо">
              <Input type="date" value={pourDate} onChange={(e) => setPourDate(e.target.value)} />
            </Field>
            <Field label="Эхлэх цаг">
              <Select
                value={pourHalf}
                items={{ am: "Үдээс өмнө", pm: "Үдээс хойш" }}
                onValueChange={(v) => setPourHalf((v as "am" | "pm") ?? "am")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="am">Үдээс өмнө</SelectItem>
                  <SelectItem value="pm">Үдээс хойш</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Цаг">
              <Input type="time" value={pourTime} onChange={(e) => setPourTime(e.target.value)} />
            </Field>
          </div>

          {isRush && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <Clock className="size-3.5" />
              Бланк дээр «авахаас 3 хоногийн өмнө захиална» гэсэн. Үйлдвэр амжихгүй байж болно.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Хийц нэршил">
              <Input
                value={structure}
                onChange={(e) => setStructure(e.target.value)}
                placeholder="Хучилт, багана…"
              />
            </Field>
            <Field label="Бетон анги">
              <Select
                value={concreteClass}
                items={Object.fromEntries(CLASSES.map((c) => [c, c]))}
                onValueChange={(v) => setConcreteClass(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {CLASSES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Конусан суулт (см)">
              <Input
                type="number"
                min={0}
                max={30}
                value={slumpCm}
                onChange={(e) => setSlumpCm(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Захиалах хэмжээ (м³)">
              <Input
                type="number"
                min={0}
                step="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <Field label="Техник / помп">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={needsPump}
                  onChange={(e) => setNeedsPump(e.target.checked)}
                />
                Помп шаардлагатай
              </label>
            </Field>
          </div>

          <Field label="Тайлбар">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onDone}>
            Болих
          </Button>
          <Button onClick={() => create.mutate()} disabled={!ready || create.isPending}>
            {create.isPending ? "Хадгалж байна…" : "Драфт үүсгэх"}
          </Button>
        </DialogFooter>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className={cn(
          "font-medium",
          tone === "red" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}
