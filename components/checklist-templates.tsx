"use client";

/**
 * Чанарын шалгах хуудасны загварууд (лавлах сан).
 *
 * Захиалагчийн дүрэм: «Ажил тус бүрийн checklist өөр байж болно». Тиймээс
 * ерөнхий инженер энд ажлын бүлэг эсвэл төрөлд зориулсан хуудас үүсгэнэ.
 *
 * ЧУХАЛ: загвар үүсгэсэн бүлгийн ажлууд тэр дороо ХААЛТТАЙ болно — хуудсыг
 * бөглөхгүйгээр батлах боломжгүй. Тиймээс дэлгэц дээр үүнийг тодорхой
 * бичсэн, эс бөгөөс инженерүүд яагаад батлаж чадахгүй байгаагаа мэдэхгүй.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { checklists, referenceData } from "@/lib/api/v2/endpoints";
import type { Uuid } from "@/lib/api/v2/types";

export function ChecklistTemplates({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", groupId: "", items: "" });

  const groups = useQuery({ queryKey: ["v2-wt-groups"], queryFn: referenceData.groups });
  const list = useQuery({ queryKey: ["v2-checklist-templates"], queryFn: () => checklists.templates() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["v2-checklist-templates"] });

  const create = useMutation({
    mutationFn: () =>
      checklists.create({
        name: form.name.trim(),
        groupId: form.groupId || groups.data?.data[0]?.id,
        // Мөр бүр = нэг шалгах зүйл. Эхлэхэд хамгийн хурдан арга.
        items: form.items
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((text, i) => ({ text, sequenceNumber: i, isRequired: true })),
      }),
    onSuccess: () => {
      toast.success("Чанарын хуудас үүслээ");
      setCreating(false);
      setForm({ name: "", groupId: "", items: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: (id: Uuid) => checklists.removeItem(id),
    onSuccess: () => {
      toast.success("Устгагдлаа");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTemplate = useMutation({
    mutationFn: (id: Uuid) => checklists.remove(id),
    onSuccess: () => {
      toast.success("Хуудас устгагдлаа");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Хуудас үүсгэсэн ажлын бүлгийн ажлууд <strong>хуудсыг бөглөхгүйгээр батлагдахгүй</strong>{" "}
          болно. Заавал зүйл «тэнцээгүй» бол батлах боломжгүй — татгалзана.
        </p>
        {canManage && (
          <Button onClick={() => setCreating(true)} disabled={(groups.data?.data.length ?? 0) === 0}>
            <Plus className="size-4" /> Шинэ хуудас
          </Button>
        )}
      </div>

      {list.isLoading ? (
        <LoadingRows rows={3} />
      ) : list.error ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Чанарын хуудас алга"
          description="Хуудас үүсгэх хүртэл ажил зөвхөн зураг, тоо хэмжээгээр батлагдана."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-2 pt-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <ClipboardCheck className="size-4" />
                      {t.name}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t.workTypeName ?? t.groupName ?? "—"}
                      {!t.isActive && " · идэвхгүй"}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={removeTemplate.isPending}
                      onClick={() => {
                        if (confirm(`«${t.name}» хуудсыг устгах уу?`)) removeTemplate.mutate(t.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>

                <ul className="space-y-1">
                  {t.items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {i.text}
                        {!i.isRequired && (
                          <span className="ml-1">
                            <ToneBadge tone="gray">заавал бус</ToneBadge>
                          </span>
                        )}
                      </span>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => removeItem.mutate(i.id)}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          aria-label="Устгах"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Шинэ чанарын хуудас"
        submitLabel="Үүсгэх"
        submitDisabled={!form.name.trim() || !form.items.trim()}
        pending={create.isPending}
        onSubmit={() => create.mutate()}
      >
        <FormField label="Ажлын бүлэг" required>
          <select
            value={form.groupId || groups.data?.data[0]?.id || ""}
            onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value }))}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {(groups.data?.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Хуудасны нэр" required>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Угсралт — чанарын шалгалт"
            autoFocus
          />
        </FormField>

        <FormField label="Шалгах зүйлс" required>
          <textarea
            value={form.items}
            onChange={(e) => setForm((f) => ({ ...f, items: e.target.value }))}
            rows={6}
            placeholder={"Арматурын диаметр зурагтай тохирч байна\nХэвний бэхэлгээ бат бөх\nХамгаалалтын давхарга хангасан"}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Мөр тутамд нэг зүйл. Бүгд «заавал» болно — дараа нь тус бүрээр өөрчилж болно.
          </p>
        </FormField>
      </FormDialog>
    </div>
  );
}
