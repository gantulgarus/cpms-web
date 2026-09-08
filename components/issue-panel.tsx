"use client";

/**
 * Ажил саатсан шалтгааны бүртгэл.
 *
 * Захиалагчийн нэрлэсэн 7 ангилал. Яагаад чухал: "17 ажил хоцорсон" гэдэг
 * тоо ганцаараа ямар ч шийдвэр гаргуулахгүй. "Түүний 12 нь материал
 * дутсанаас" гэдэг нь шийдвэр гаргуулна.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertOctagon, Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToneBadge } from "@/components/tone-badge";
import { issues } from "@/lib/api/v2/endpoints";
import type { IssueCategory, Uuid } from "@/lib/api/v2/types";

/** Ангиллын монгол нэр — серверийн `CATEGORY_LABELS`-тай нэг мөр. */
export const ISSUE_CATEGORIES: { value: IssueCategory; label: string }[] = [
  { value: "no_contractor", label: "Гүйцэтгэгч ирээгүй" },
  { value: "contractor_late", label: "Гүйцэтгэгч хоцорсон" },
  { value: "equipment_failure", label: "Техник эвдэрсэн" },
  { value: "material_shortage", label: "Материал дутсан" },
  { value: "weather", label: "Цаг агаар" },
  { value: "complaint", label: "Гомдол" },
  { value: "accident", label: "Осол" },
];

const SEVERITIES = [
  { value: "low", label: "Бага" },
  { value: "medium", label: "Дунд" },
  { value: "high", label: "Өндөр" },
];

export function IssuePanel({ workItemId }: { workItemId: Uuid }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: "material_shortage" as IssueCategory,
    severity: "medium",
    description: "",
  });

  const list = useQuery({
    queryKey: ["v2-issues", workItemId],
    queryFn: () => issues.forWorkItem(workItemId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["v2-issues", workItemId] });
    // Төслийн dashboard дээрх "нээлттэй асуудал" тоо мөн өөрчлөгдөнө.
    qc.invalidateQueries({ queryKey: ["v2-dashboard"] });
  };

  const create = useMutation({
    mutationFn: () =>
      issues.create(workItemId, {
        category: form.category,
        severity: form.severity,
        description: form.description.trim(),
      }),
    onSuccess: () => {
      toast.success("Асуудал бүртгэгдлээ");
      setOpen(false);
      setForm({ category: "material_shortage", severity: "medium", description: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: (id: Uuid) => issues.resolve(id),
    onSuccess: () => {
      toast.success("Шийдвэрлэсэн гэж тэмдэглэлээ");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data?.data ?? [];
  const openCount = rows.filter((i) => i.status === "open").length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertOctagon className="size-4" /> Саатлын шалтгаан
          {openCount > 0 && <ToneBadge tone="red">{openCount}</ToneBadge>}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-3.5" /> Бүртгэх
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {open && (
          <div className="space-y-2 rounded-md border p-3">
            <select
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value as IssueCategory }))
              }
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  Хүндрэл: {s.label}
                </option>
              ))}
            </select>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Юу болсныг товч бичнэ үү"
            />
            <Button
              size="sm"
              className="w-full"
              disabled={!form.description.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              Бүртгэх
            </Button>
          </div>
        )}

        {list.isLoading ? (
          <p className="text-muted-foreground text-sm">Ачаалж байна…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Бүртгэгдсэн саатал алга.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((i) => (
              <li
                key={i.id}
                className="flex items-start justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="font-medium">{i.categoryLabel}</span>
                    {i.status === "resolved" ? (
                      <ToneBadge tone="green">Шийдэгдсэн</ToneBadge>
                    ) : i.severity === "high" ? (
                      <ToneBadge tone="red">Өндөр</ToneBadge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-xs break-words">{i.description}</p>
                  {i.reportedBy && (
                    <p className="text-muted-foreground text-xs">{i.reportedBy}</p>
                  )}
                </div>
                {i.status === "open" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate(i.id)}
                    title="Шийдвэрлэсэн"
                  >
                    <Check className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
