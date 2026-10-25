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
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
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
import { EditWorkTypeDialog } from "@/components/edit-work-type-dialog";
import { referenceData } from "@/lib/api/endpoints";
import type { LocationLevel, WorkType } from "@/lib/api/types";
import { useMe } from "@/lib/api/use-me";
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
  const [editing, setEditing] = useState<(WorkType & { inUse?: boolean }) | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [form, setForm] = useState({
    name: "",
    code: "",
    codePart: "",
    unit: "м2",
    level: "floor" as LocationLevel,
  });

  const groups = useQuery({ queryKey: ["wt-groups"], queryFn: referenceData.groups });
  const types = useQuery({
    queryKey: ["work-types", groupId],
    queryFn: () => referenceData.types(groupId ? { groupId } : undefined),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["work-types"] });
    qc.invalidateQueries({ queryKey: ["wt-groups"] });
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
        code: form.code.trim(),
        codePart: form.codePart.trim(),
        unit: form.unit.trim(),
        level: form.level,
      }),
    onSuccess: () => {
      toast.success("Ажлын төрөл нэмэгдлээ");
      setCreatingType(false);
      setForm({ name: "", code: "", codePart: "", unit: "м2", level: "floor" });
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
                    {/* Код нь импортын холбох түлхүүр — хамгийн түрүүнд. */}
                    <TableHead className="w-40">Төсвийн код</TableHead>
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
                      <TableCell>
                        {t.code ? (
                          <>
                            <span className="font-medium tabular-nums">{t.code}</span>
                            {t.codePart && (
                              <div className="text-muted-foreground text-xs">{t.codePart}</div>
                            )}
                          </>
                        ) : (
                          /*
                           * Кодгүй төрөл рүү импортоор ажил ОРОХГҮЙ.
                           * Зүгээр хоосон орхивол «бичигдээгүй юм байна»
                           * гэж ойлгогдоно — үр дагавраа хэлье.
                           */
                          <span title="Төсвөөс импортлох боломжгүй">
                            <ToneBadge tone="amber">кодгүй</ToneBadge>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.groupName}</TableCell>
                      <TableCell className="tabular-nums">{t.unit}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {LEVEL_LABEL[t.level] ?? t.level}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {/* Засах нь ҮРГЭЛЖ боломжтой: ашиглагдаж эхэлсэн
                                төрлийн НЭР, БҮЛГИЙГ засахад ажлууд
                                хөндөгдөхгүй. Нэгж, түвшин нь цонхон дотроо
                                түгжигдэнэ. */}
                            <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                              <Pencil className="size-3.5" />
                            </Button>

                            {t.inUse ? (
                              // Устгах товч зүгээр л алга болвол алдаа мэт
                              // харагдана — шалтгааныг нэрлэнэ.
                              <span
                                className="text-muted-foreground flex items-center gap-1 text-xs"
                                title="Энэ төрлөөр ажил үүссэн тул устгах боломжгүй"
                              >
                                <Lock className="size-3" /> Ашиглагдаж байна
                              </span>
                            ) : (
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
                            )}
                          </div>
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

        {/*
         * КОД нь төсвийн файлтай холбох цорын ганц түлхүүр.
         *
         * Хоосон орхивол энэ төрөл рүү импортоор ажил үүсэхгүй —
         * зөвхөн гараар нэмэгдэнэ. Заавал биш ч, үр дагаврыг нь
         * тэр дор нь хэлнэ.
         */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Төсвийн код" hint="Төсвийн файлын C баганад бичигддэг код.">
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="4.1.7"
            />
          </FormField>

          <FormField label="Бүрдэл" hint="Нэг код олон ажилтай үед ялгана.">
            <Input
              value={form.codePart}
              onChange={(e) => setForm((f) => ({ ...f, codePart: e.target.value }))}
              placeholder="Айлын тагт"
            />
          </FormField>
        </div>

        {!form.code.trim() && (
          <p className="text-muted-foreground text-xs">
            Код хоосон бол энэ төрөл рүү төсвөөс ажил үүсэхгүй — зөвхөн гараар нэмж болно.
          </p>
        )}
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
      {/* `key` нь чухал: өөр төрөл сонгоход цонх төлөвөө шинээр эхлүүлнэ. */}
      {editing && (
        <EditWorkTypeDialog
          key={editing.id}
          workType={editing}
          inUse={Boolean(editing.inUse)}
          open
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
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
