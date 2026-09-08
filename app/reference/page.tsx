"use client";

/**
 * Лавлах сан — ажлын төрөл ба бүлэг.
 *
 * Урьд нь 47 ажлын төрөл seed дотор хатуу бичигдсэн байсан тул шинэ төрөл
 * гарахад програмист хэрэгтэй болдог байв.
 *
 * Ашиглагдаж эхэлсэн төрлийн НЭГЖ ба ТҮВШИН цоожтой: нэгж солих нь м²-т
 * хэмжсэн бүх гүйцэтгэлийг утгагүй болгоно. Серверт мөн шалгагдана.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChecklistTemplates } from "@/components/checklist-templates";
import { referenceData } from "@/lib/api/v2/endpoints";
import type { LocationLevel } from "@/lib/api/v2/types";
import { useMe } from "@/lib/api/v2/use-me";
import { cn } from "@/lib/utils";

const LEVEL_LABEL: Record<string, string> = {
  block: "Барилга бүхэлдээ",
  floor: "Давхар бүрт",
  unit: "Айл бүрт",
};

const LEVELS: LocationLevel[] = ["block", "floor", "unit"];

export default function ReferenceDataPage() {
  const qc = useQueryClient();
  const { me } = useMe();
  const canManage = Boolean(me?.canManageReferenceData);

  const [tab, setTab] = useState<"types" | "checklists">("types");
  const [groupId, setGroupId] = useState<string>("");
  const [creatingType, setCreatingType] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [form, setForm] = useState({ name: "", unit: "м2", level: "floor" as LocationLevel });

  const groups = useQuery({ queryKey: ["v2-wt-groups"], queryFn: referenceData.groups });
  const types = useQuery({
    queryKey: ["v2-work-types", groupId],
    queryFn: () => referenceData.types(groupId ? { groupId } : undefined),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["v2-work-types"] });
    qc.invalidateQueries({ queryKey: ["v2-wt-groups"] });
  };

  const addGroup = useMutation({
    mutationFn: () => referenceData.createGroup({ name: groupName.trim() }),
    onSuccess: () => {
      toast.success("Бүлэг нэмэгдлээ");
      setCreatingGroup(false);
      setGroupName("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addType = useMutation({
    mutationFn: () =>
      referenceData.createType({
        groupId: groupId || groups.data!.data[0].id,
        name: form.name.trim(),
        unit: form.unit.trim(),
        level: form.level,
      }),
    onSuccess: () => {
      toast.success("Ажлын төрөл нэмэгдлээ");
      setCreatingType(false);
      setForm({ name: "", unit: "м2", level: "floor" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => referenceData.deleteType(id),
    onSuccess: () => {
      toast.success("Устгагдлаа");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Лавлах сан"
        description="Компанийн ажлын төрлийн толь бичиг — бүх барилгад нийтлэг. Барилгад ажил төлөвлөх нь блокийн хуудсанд."
        actions={
          canManage &&
          tab === "types" && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCreatingGroup(true)}>
                <Plus className="size-4" /> Бүлэг
              </Button>
              <Button
                onClick={() => setCreatingType(true)}
                disabled={(groups.data?.data.length ?? 0) === 0}
              >
                <Plus className="size-4" /> Ажлын төрөл
              </Button>
            </div>
          )
        }
      />

      {/* Хоёр хэсэг: юуг хэмжих (ажлын төрөл) ба юуг шалгах (чанарын хуудас) */}
      <div className="mb-4 flex gap-1">
        {(
          [
            ["types", "Ажлын төрөл"],
            ["checklists", "Чанарын хуудас"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === value
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "checklists" ? (
        <ChecklistTemplates canManage={canManage} />
      ) : (
        <>
          {/* Бүлгийн шүүлтүүр */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <FilterChip active={groupId === ""} onClick={() => setGroupId("")}>
              Бүгд
            </FilterChip>
            {(groups.data?.data ?? []).map((g) => (
              <FilterChip key={g.id} active={groupId === g.id} onClick={() => setGroupId(g.id)}>
                {g.name}
              </FilterChip>
            ))}
          </div>

          {types.isLoading ? (
            <LoadingRows rows={6} />
          ) : types.error ? (
            <ErrorState message={(types.error as Error).message} onRetry={() => types.refetch()} />
          ) : (types.data?.data.length ?? 0) === 0 ? (
            <EmptyState title="Ажлын төрөл алга" description="Эхний төрлөө нэмнэ үү." />
          ) : (
            <Card className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Нэр</TableHead>
                    <TableHead>Бүлэг</TableHead>
                    <TableHead>Нэгж</TableHead>
                    <TableHead>Хаана үүсэх</TableHead>
                    {canManage && <TableHead className="w-28" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(types.data?.data ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.groupName}</TableCell>
                      <TableCell className="tabular-nums">{t.unit}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {LEVEL_LABEL[t.level] ?? t.level}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          {t.inUse ? (
                            // Ашиглагдаж байгаа шалтгааныг тайлбарлана — товч
                            // зүгээр л алга болвол алдаа мэт харагдана.
                            <span
                              className="text-muted-foreground flex items-center justify-end gap-1 text-xs"
                              title="Энэ төрлөөр ажил үүссэн тул устгах боломжгүй"
                            >
                              <Lock className="size-3" /> Ашиглагдаж байна
                            </span>
                          ) : (
                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={remove.isPending}
                                onClick={() => {
                                  if (confirm(`«${t.name}» төрлийг устгах уу?`))
                                    remove.mutate(t.id);
                                }}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      <FormDialog
        open={creatingGroup}
        onOpenChange={setCreatingGroup}
        title="Шинэ бүлэг"
        submitLabel="Нэмэх"
        submitDisabled={!groupName.trim()}
        pending={addGroup.isPending}
        onSubmit={() => addGroup.mutate()}
      >
        <FormField label="Бүлгийн нэр" required>
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Дулаалга"
            autoFocus
          />
        </FormField>
      </FormDialog>

      <FormDialog
        open={creatingType}
        onOpenChange={setCreatingType}
        title="Шинэ ажлын төрөл (толь бичигт)"
        submitLabel="Нэмэх"
        submitDisabled={!form.name.trim() || !form.unit.trim()}
        pending={addType.isPending}
        onSubmit={() => addType.mutate()}
      >
        <FormField label="Бүлэг" required>
          <select
            value={groupId || groups.data?.data[0]?.id || ""}
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
        <FormField label="Нэр" required>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Хөвөн дулаалга суурилуулах"
            autoFocus
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Хэмжих нэгж" required>
            <Input
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="м2"
            />
          </FormField>
          <FormField label="Хаана үүсэх" required>
            <select
              value={form.level}
              onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as LocationLevel }))}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <p className="text-muted-foreground text-xs">
          «Хаана үүсэх» нь энэ ажил барилгад буухдаа хэдэн мөр болохыг тодорхойлно: айл бүрт гэвэл
          16 давхрын барилгад 144 мөр үүснэ. Ажил үүссэний дараа өөрчлөх боломжгүй.
          <br />
          Энд бүртгэх нь ямар нэг барилгад ажил үүсгэхгүй — блокийн хуудсанд «Ажил нэмэх» дарж
          буулгана.
        </p>
      </FormDialog>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
