"use client";

/**
 * Шинэ материалын захиалга — олон мөртэй.
 *
 * МӨР БҮРТ ҮЛДЭГДЭЛ ХАРАГДАНА. Материал сонгомогц «төсөвт 508, өмнө нь
 * 300 захиалсан, 208 үлдсэн» гэж гарч, тоо бичихэд хасагдана. Хэтэрвэл
 * мөр улаан болно — хориглохгүй, харуулна.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
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
import { materialOrders } from "@/lib/api/endpoints";
import type { Block, MaterialBalanceRow, MaterialOrderKind } from "@/lib/api/types";
import { formatQty, MATERIAL_ORDER_KINDS } from "@/lib/domain";
import { cn } from "@/lib/utils";

interface Draft {
  key: number;
  materialId: string;
  quantity: string;
  stockQty: string;
  unitWeightKg: string;
}

const blank = (key: number): Draft => ({
  key,
  materialId: "",
  quantity: "",
  stockQty: "",
  unitWeightKg: "",
});

export function NewMaterialOrderDialog({
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {/* Нээгдэх үед л монтлоно — өмнөх захиалгын утга үлдэхгүй. */}
        {open && (
          <OrderForm
            blocks={blocks}
            defaultBlockId={defaultBlockId}
            onDone={() => onOpenChange(false)}
          />
        )}
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
  const [kind, setKind] = useState<MaterialOrderKind>("main");
  const [neededBy, setNeededBy] = useState("");
  const [lines, setLines] = useState<Draft[]>([blank(0)]);
  const [nextKey, setNextKey] = useState(1);

  const balance = useQuery({
    queryKey: ["material-balance", blockId],
    queryFn: () => materialOrders.balance(blockId).then((r) => r.data),
    enabled: Boolean(blockId),
  });

  const rows = useMemo(() => balance.data ?? [], [balance.data]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.materialId, r])), [rows]);

  const blockLabels = useMemo(
    () => Object.fromEntries(blocks.map((b) => [b.id, b.name])),
    [blocks],
  );

  const materialLabels = useMemo(
    () =>
      Object.fromEntries(
        rows.map((r) => [r.materialId, `${r.name} (${formatQty(r.remaining, r.unit)} үлдсэн)`]),
      ),
    [rows],
  );

  const filled = lines.filter((l) => l.materialId && Number(l.quantity) > 0);

  const create = useMutation({
    mutationFn: () =>
      materialOrders.create(blockId, {
        kind,
        neededBy: neededBy || null,
        lines: filled.map((l) => ({
          materialId: l.materialId,
          quantity: Number(l.quantity),
          stockQty: l.stockQty ? Number(l.stockQty) : null,
          unitWeightKg: kind === "rebar" && l.unitWeightKg ? Number(l.unitWeightKg) : null,
        })),
      }),
    onSuccess: (order) => {
      toast.success(`${order.number} драфт үүслээ — илгээх хүртэл төсөв иддэггүй.`);
      qc.invalidateQueries({ queryKey: ["material-orders"] });
      qc.invalidateQueries({ queryKey: ["material-balance"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function patch(key: number, change: Partial<Draft>) {
    setLines((xs) => xs.map((l) => (l.key === key ? { ...l, ...change } : l)));
  }

  function addLine() {
    setLines((xs) => [...xs, blank(nextKey)]);
    setNextKey((n) => n + 1);
  }

  const ready = Boolean(blockId) && filled.length > 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Шинэ материалын захиалга</DialogTitle>
        <DialogDescription>
          Драфтаар хадгалагдана — илгээх хүртэл төсвийн үлдэгдлээс хасагдахгүй.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Блок">
            <Select
              value={blockId}
              items={blockLabels}
              onValueChange={(v) => {
                setBlockId(v ?? "");
                setLines([blank(nextKey)]);
                setNextKey((n) => n + 1);
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

          <Field label="Бланкны төрөл">
            <Select
              value={kind}
              items={MATERIAL_ORDER_KINDS}
              onValueChange={(v) => setKind((v as MaterialOrderKind) ?? "main")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MATERIAL_ORDER_KINDS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Шаардах огноо">
            <Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
          </Field>
        </div>

        <div className="space-y-2">
          {lines.map((line) => (
            <LineRow
              key={line.key}
              line={line}
              rows={rows}
              labels={materialLabels}
              balance={byId.get(line.materialId)}
              rebar={kind === "rebar"}
              disabled={!blockId}
              onChange={(c) => patch(line.key, c)}
              onRemove={
                lines.length > 1
                  ? () => setLines((xs) => xs.filter((l) => l.key !== line.key))
                  : undefined
              }
            />
          ))}

          <Button variant="outline" size="sm" onClick={addLine} disabled={!blockId}>
            <Plus className="size-4" /> Мөр нэмэх
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Болих
        </Button>
        <Button onClick={() => create.mutate()} disabled={!ready || create.isPending}>
          {create.isPending ? "Хадгалж байна…" : `Драфт үүсгэх · ${filled.length} мөр`}
        </Button>
      </DialogFooter>
    </>
  );
}

function LineRow({
  line,
  rows,
  labels,
  balance,
  rebar,
  disabled,
  onChange,
  onRemove,
}: {
  line: Draft;
  rows: MaterialBalanceRow[];
  labels: Record<string, string>;
  balance?: MaterialBalanceRow;
  rebar: boolean;
  disabled: boolean;
  onChange: (c: Partial<Draft>) => void;
  onRemove?: () => void;
}) {
  const qty = Number(line.quantity) || 0;
  const after = balance ? Math.round((balance.remaining - qty) * 1000) / 1000 : null;
  const over = after !== null && after < 0;

  return (
    <div
      className={cn(
        "rounded-md border p-2",
        over && "border-red-500/50 bg-red-500/5",
      )}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Select
            value={line.materialId}
            items={labels}
            onValueChange={(v) => onChange({ materialId: v ?? "" })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={disabled ? "Эхлээд блок" : "Материал сонгох"} />
            </SelectTrigger>
            <SelectContent>
              {rows.map((r) => (
                <SelectItem key={r.materialId} value={r.materialId}>
                  {r.name} ({formatQty(r.remaining, r.unit)} үлдсэн)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Input
          type="number"
          min={0}
          step="0.001"
          className="w-28"
          placeholder="Агуулахад"
          value={line.stockQty}
          onChange={(e) => onChange({ stockQty: e.target.value })}
        />

        <Input
          type="number"
          min={0}
          step="0.001"
          className="w-28"
          placeholder={balance ? `Захиалах ${balance.unit}` : "Захиалах"}
          value={line.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
        />

        {/* Арматурт нэгж жин — үйлдвэр ширхгээр биш тоннооор нийлүүлдэг. */}
        {rebar && (
          <Input
            type="number"
            min={0}
            step="0.001"
            className="w-28"
            placeholder="Нэгж жин кг"
            value={line.unitWeightKg}
            onChange={(e) => onChange({ unitWeightKg: e.target.value })}
          />
        )}

        {onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Мөр хасах">
            <X className="size-4" />
          </Button>
        )}
      </div>

      {balance && (
        <p
          className={cn(
            "mt-1.5 text-xs",
            over ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
          )}
        >
          {over && <AlertTriangle className="mr-1 inline size-3" />}
          Төсөв {formatQty(balance.budget, balance.unit)} · захиалсан{" "}
          {formatQty(balance.ordered, balance.unit)} · энэ захиалгын дараа{" "}
          {after === null ? "—" : formatQty(after, balance.unit)}
        </p>
      )}
    </div>
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
