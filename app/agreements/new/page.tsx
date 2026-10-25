"use client";

/**
 * Шинэ тохиролцоо бичих.
 *
 * ГОЛ САНАА: ажлын мөрүүд ТӨСВӨӨС татагдана. Гэрээний мэргэжилтэн 64 мөрийг
 * гараар бичих нь алдаа гаргах цорын гагц зам — тоо хэмжээ төсөвтэй зөрвөл
 * акт, төлбөр бүхэлдээ буруу болно. Хүн зөвхөн НЭГЖ ҮНЭ тавина.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormField } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { agreements, blocks, contractors, referenceData } from "@/lib/api/endpoints";
import type { AgreementDraftLine } from "@/lib/api/types";
import { useProject } from "@/lib/api/use-project";
import { formatMoney, formatQty } from "@/lib/domain";

interface Row extends AgreementDraftLine {
  unitPrice: string;
  include: boolean;
}

export default function NewAgreementPage() {
  const router = useRouter();
  const { project } = useProject();

  const [blockId, setBlockId] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);

  const [form, setForm] = useState({
    scope: "",
    startDate: "",
    endDate: "",
    retentionPercent: "5",
    barterPercent: "0",
    cashPercent: "100",
    barterAmount: "",
    barterNote: "",
    warrantyYears: "3",
    maintenanceMonths: "36",
    workDaysPerWeek: "6",
    restDay: "Ням",
    headcount: "",
    notes: "",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const blockList = useQuery({
    queryKey: ["blocks", project?.id],
    queryFn: () => blocks.listForProject(project!.id),
    enabled: Boolean(project),
  });

  const contractorList = useQuery({
    queryKey: ["contractors"],
    queryFn: () => contractors.list(),
  });

  const groupList = useQuery({
    queryKey: ["work-type-groups"],
    queryFn: () => referenceData.groups(),
  });

  const contractor = (contractorList.data?.data ?? []).find((c) => c.id === contractorId);
  const blocked = contractor?.missingContractFields ?? [];

  const draft = useMutation({
    mutationFn: () => agreements.draftLines(blockId, groupIds),
    onSuccess: (res) => {
      setRows(
        res.data.map((l) => ({
          ...l,
          // Төсвийн үнийг АНХДАГЧ болгоно — хэлэлцээрийн дүнд засна.
          unitPrice: l.budgetUnitPrice != null ? String(l.budgetUnitPrice) : "",
          include: true,
        })),
      );

      if (res.meta.withoutPrice > 0) {
        toast.warning(`${res.meta.withoutPrice} мөрд төсвийн үнэ алга — гараар тавина уу.`);
      }
      if (res.meta.priceConflicts > 0) {
        toast.warning(`${res.meta.priceConflicts} мөрд төсөвт хоёр өөр үнэ байна — шалгана уу.`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chosen = (rows ?? []).filter((r) => r.include && Number(r.unitPrice) > 0);
  const total = chosen.reduce((s, r) => s + r.quantity * Number(r.unitPrice), 0);
  const budget = chosen.reduce((s, r) => s + r.quantity * (r.budgetUnitPrice ?? 0), 0);
  const variance = budget > 0 ? Math.round(((total - budget) / budget) * 1000) / 10 : null;

  const percentsOk =
    Math.abs(Number(form.barterPercent) + Number(form.cashPercent) - 100) < 0.01;

  const save = useMutation({
    mutationFn: () =>
      agreements.create(blockId, {
        contractorId,
        scope: form.scope.trim() || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        retentionPercent: Number(form.retentionPercent || 0),
        barterPercent: Number(form.barterPercent || 0),
        cashPercent: Number(form.cashPercent || 0),
        barterAmount: form.barterAmount ? Number(form.barterAmount) : null,
        barterNote: form.barterNote.trim() || null,
        warrantyYears: Number(form.warrantyYears || 3),
        maintenanceMonths: Number(form.maintenanceMonths || 36),
        workDaysPerWeek: form.workDaysPerWeek ? Number(form.workDaysPerWeek) : null,
        restDay: form.restDay.trim() || null,
        headcount: form.headcount ? Number(form.headcount) : null,
        notes: form.notes.trim() || null,
        lines: chosen.map((r) => ({
          workTypeId: r.workTypeId,
          label: r.label,
          unit: r.unit,
          quantity: r.quantity,
          unitPrice: Number(r.unitPrice),
          budgetUnitPrice: r.budgetUnitPrice,
        })),
      }),
    onSuccess: (a) => {
      toast.success(`${a.number} драфт болж хадгалагдлаа`);
      router.push(`/agreements/${a.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (blockList.error) {
    return <ErrorState message={(blockList.error as Error).message} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Шинэ тохиролцоо"
        description="Ажлууд төсвөөс татагдана — та нэгж үнээ тавина."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">1. Хэнтэй, юунд</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Блок" required>
              <select
                value={blockId}
                onChange={(e) => {
                  setBlockId(e.target.value);
                  setRows(null);
                }}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">— сонгоно уу —</option>
                {(blockList.data?.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Гүйцэтгэгч" required>
              <select
                value={contractorId}
                onChange={(e) => setContractorId(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">— сонгоно уу —</option>
                {(contractorList.data?.data ?? [])
                  .filter((c) => c.canTakeWork !== false)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.categoryLabel ? ` · ${c.categoryLabel}` : ""}
                    </option>
                  ))}
              </select>
            </FormField>
          </div>

          {/* Профайл дутуу бол ТЭР ДОР НЬ хэлнэ — хуудас хэвлэх гэж байж
              «РД байхгүй» гэдгийг мэдэх нь оройтсон. */}
          {blocked.length > 0 && (
            <p className="text-destructive text-xs" role="alert">
              {contractor?.name}-ийн мэдээлэл дутуу: {blocked.join(", ")}. Гүйцэтгэгчийн хуудаснаас
              нөхсөний дараа тохиролцоо бичигдэнэ.
            </p>
          )}

          <FormField label="Ажлын нэр" hint="«Дотор засал», «Цахилгаан, холбоо»">
            <Input value={form.scope} onChange={(e) => set("scope")(e.target.value)} />
          </FormField>

          <FormField label="Ажлын бүлэг" hint="Хоосон бол блокийн бүх ажил татагдана.">
            <div className="flex flex-wrap gap-1.5">
              {(groupList.data?.data ?? []).map((g) => {
                const on = groupIds.includes(g.id);

                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() =>
                      setGroupIds((ids) =>
                        on ? ids.filter((x) => x !== g.id) : [...ids, g.id],
                      )
                    }
                    className={
                      on
                        ? "bg-primary text-primary-foreground rounded-full border border-transparent px-2.5 py-1 text-xs"
                        : "hover:bg-accent rounded-full border px-2.5 py-1 text-xs"
                    }
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </FormField>

          <Button
            onClick={() => draft.mutate()}
            disabled={!blockId || draft.isPending}
            variant="outline"
          >
            {draft.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Төсвөөс мөр татах
          </Button>
        </CardContent>
      </Card>

      {rows && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">2. Ажлын гүйцэтгэл, нэгж үнэ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Тоо хэмжээтэй ажил олдсонгүй. Блок эсвэл бүлгээ шалгана уу.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ажлын нэр</TableHead>
                        <TableHead className="text-right">Тоо хэмжээ</TableHead>
                        <TableHead className="text-right">Төсвийн үнэ</TableHead>
                        <TableHead className="w-36 text-right">Нэгж үнэ</TableHead>
                        <TableHead className="text-right">Дүн</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, i) => {
                        const price = Number(r.unitPrice);
                        const amount = r.quantity * (Number.isFinite(price) ? price : 0);

                        return (
                          <TableRow key={r.workTypeId} className={r.include ? "" : "opacity-40"}>
                            <TableCell>
                              {r.label}
                              <div className="text-muted-foreground text-xs">
                                {r.groupName}
                                {r.priceConflict && (
                                  <span className="text-amber-700 dark:text-amber-500">
                                    {" "}
                                    · төсөвт хоёр өөр үнэ
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatQty(r.quantity, r.unit)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right tabular-nums">
                              {r.budgetUnitPrice != null ? formatMoney(r.budgetUnitPrice) : "—"}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={r.unitPrice}
                                disabled={!r.include}
                                onChange={(e) =>
                                  setRows((prev) =>
                                    (prev ?? []).map((x, j) =>
                                      j === i ? { ...x, unitPrice: e.target.value } : x,
                                    ),
                                  )
                                }
                                className="text-right tabular-nums"
                              />
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatMoney(amount)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                title={r.include ? "Хасах" : "Буцаах"}
                                onClick={() =>
                                  setRows((prev) =>
                                    (prev ?? []).map((x, j) =>
                                      j === i ? { ...x, include: !x.include } : x,
                                    ),
                                  )
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-4 border-t pt-3 text-sm">
                  <span className="text-muted-foreground">
                    Төсөв: <strong className="text-foreground">{formatMoney(budget)}</strong>
                  </span>
                  {variance != null && (
                    <ToneBadge tone={variance > 10 ? "red" : variance > 0 ? "amber" : "green"}>
                      {variance > 0 ? "+" : ""}
                      {variance}%
                    </ToneBadge>
                  )}
                  <span className="text-base font-medium tabular-nums">
                    Нийт: {formatMoney(total)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">3. Хугацаа, төлбөрийн нөхцөл</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Ажил эхлэх">
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate")(e.target.value)}
                />
              </FormField>
              <FormField label="Хүлээлгэн өгөх">
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => set("endDate")(e.target.value)}
                />
              </FormField>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Барьцаа %">
                <Input
                  type="number"
                  value={form.retentionPercent}
                  onChange={(e) => set("retentionPercent")(e.target.value)}
                />
              </FormField>
              <FormField label="Бартер %">
                <Input
                  type="number"
                  value={form.barterPercent}
                  onChange={(e) => set("barterPercent")(e.target.value)}
                  aria-invalid={!percentsOk || undefined}
                />
              </FormField>
              <FormField label="Бэлэн мөнгө %">
                <Input
                  type="number"
                  value={form.cashPercent}
                  onChange={(e) => set("cashPercent")(e.target.value)}
                  aria-invalid={!percentsOk || undefined}
                />
              </FormField>
            </div>

            {/* Нийлбэр зөрвөл төлбөр тооцоо бүхэлдээ буруу болно: 60% бартер,
                50% бэлэн гэвэл 110% олгогдоно. */}
            {!percentsOk && (
              <p className="text-destructive text-xs" role="alert">
                Бартер ба бэлэн мөнгөний нийлбэр 100% байх ёстой — одоо{" "}
                {Number(form.barterPercent) + Number(form.cashPercent)}%.
              </p>
            )}

            {Number(form.barterPercent) > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Бартерын дүн">
                  <Input
                    type="number"
                    value={form.barterAmount}
                    onChange={(e) => set("barterAmount")(e.target.value)}
                  />
                </FormField>
                <FormField label="Бартерын нэр">
                  <Input
                    value={form.barterNote}
                    onChange={(e) => set("barterNote")(e.target.value)}
                    placeholder="Орон сууц, материал…"
                  />
                </FormField>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Баталгаат хугацаа (жил)">
                <Input
                  type="number"
                  value={form.warrantyYears}
                  onChange={(e) => set("warrantyYears")(e.target.value)}
                />
              </FormField>
              <FormField label="Засвар үйлчилгээ (сар)">
                <Input
                  type="number"
                  value={form.maintenanceMonths}
                  onChange={(e) => set("maintenanceMonths")(e.target.value)}
                />
              </FormField>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="7 хоногт ажиллах өдөр">
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={form.workDaysPerWeek}
                  onChange={(e) => set("workDaysPerWeek")(e.target.value)}
                />
              </FormField>
              <FormField label="Амрах гариг">
                <Input value={form.restDay} onChange={(e) => set("restDay")(e.target.value)} />
              </FormField>
              <FormField label="Талбайд ажиллах хүн">
                <Input
                  type="number"
                  value={form.headcount}
                  onChange={(e) => set("headcount")(e.target.value)}
                />
              </FormField>
            </div>

            <FormField label="Тэмдэглэл">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
              />
            </FormField>

            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <p className="text-muted-foreground text-xs">
                Хадгалахад <strong>драфт</strong> болно. Ерөнхий инженер баталсны дараа мөр
                түгжигдэнэ.
              </p>
              <Button
                onClick={() => save.mutate()}
                disabled={
                  save.isPending ||
                  !contractorId ||
                  blocked.length > 0 ||
                  chosen.length === 0 ||
                  !percentsOk
                }
              >
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                Драфт хадгалах
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
