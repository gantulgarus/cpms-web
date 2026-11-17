"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { referenceData, type LocationLevel, type WorkCatalogEntry } from "@/lib/api/endpoints";
import { FormDialog, FormField } from "@/components/form-dialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inferWorkLocation } from "@/lib/reference/infer-work-location";

const LEVEL_LABELS: Partial<Record<LocationLevel, string>> = { block: "Барилга бүхэлдээ", floor: "Давхар бүрт", unit: "Айл бүрт" };

export function WorkCatalog({ canManage }: { canManage: boolean }) {
  const query = useQuery({ queryKey: ["work-catalog"], queryFn: referenceData.catalog });
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [locationMissingOnly, setLocationMissingOnly] = useState(false);
  const [editing, setEditing] = useState<WorkCatalogEntry | null>(null);
  const [deleting, setDeleting] = useState<WorkCatalogEntry | null>(null);
  const entries = query.data?.data ?? [];
  const groups = [...new Set(entries.map((entry) => entry.groupName))];
  const term = search.trim().toLocaleLowerCase();
  const visible = entries.filter((entry) =>
    (!group || entry.groupName === group)
    && (!missingOnly || !entry.unit)
    && (!locationMissingOnly || !entry.level)
    && (!term || [entry.systemCode, entry.name, entry.typeName, entry.subgroupNumber, entry.groupName]
      .some((value) => value.toLocaleLowerCase().includes(term))),
  );

  if (query.isLoading) return <LoadingRows rows={8} />;
  if (query.error) return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Хийгдэх ажил хайх" placeholder="Код, нэр, дэд бүлгээр хайх…" className="max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Бүлэг" className="border-input bg-background h-9 max-w-full rounded-md border px-3 text-sm" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">Бүх бүлэг</option>
          {groups.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
          Нэгж дутуу ({entries.filter((entry) => !entry.unit).length})
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={locationMissingOnly} onChange={(event) => setLocationMissingOnly(event.target.checked)} />
          Байршил тодруулах ({entries.filter((entry) => !entry.level).length})
        </label>
      </div>
      <p className="text-muted-foreground text-xs" aria-live="polite">{visible.length} ажил</p>
      {visible.length === 0 ? <EmptyState title="Ажил олдсонгүй" description="Хайлт болон бүлгийн шүүлтүүрээ шалгана уу." /> : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ажлын код</TableHead><TableHead>Бүлэг</TableHead><TableHead>Дэд бүлэг</TableHead>
              <TableHead>Ажлын төрөл</TableHead><TableHead>Хийгдэх ажлын нэр</TableHead><TableHead>Нэгж</TableHead>
              <TableHead>Байршил / Давхар</TableHead>
              {canManage && <TableHead><span className="sr-only">Үйлдэл</span></TableHead>}
            </TableRow></TableHeader>
            <TableBody>{visible.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="align-top font-mono text-xs">{entry.systemCode}</TableCell>
                <TableCell className="align-top">{entry.groupName}</TableCell>
                <TableCell className="align-top tabular-nums">{entry.subgroupNumber}</TableCell>
                <TableCell className="max-w-64 whitespace-normal align-top">{entry.typeName}</TableCell>
                <TableCell className="min-w-64 max-w-lg whitespace-normal align-top">
                  <div className="font-medium">{entry.name}</div>
                  {entry.description && <p className="text-muted-foreground text-xs">{entry.description}</p>}
                </TableCell>
                <TableCell className="align-top">{entry.unit || <span className="text-amber-700 dark:text-amber-400">Тодруулах</span>}</TableCell>
                <TableCell className="max-w-48 whitespace-normal align-top text-xs">
                  <div>{entry.locationDescription || "—"}</div><div className="text-muted-foreground">{entry.floorDescription || "—"}</div>
                  {!entry.level && <div className="mt-1 text-amber-700 dark:text-amber-400">Байршил тодруулах</div>}
                  {entry.locationLevelOverride && <div className="mt-1 text-muted-foreground">Тодруулсан: {LEVEL_LABELS[entry.locationLevelOverride]}</div>}
                </TableCell>
                {canManage && <TableCell className="align-top"><div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" aria-label={`${entry.systemCode} засах`} onClick={() => setEditing(entry)}><Pencil className="size-3.5" /></Button>
                  <Button variant="ghost" size="sm" className="text-destructive" aria-label={`${entry.systemCode} устгах`} title={entry.inUse ? "Төлөвлөгөөнд ашиглагдсан тул устгах боломжгүй" : "Устгах"} disabled={entry.inUse} onClick={() => setDeleting(entry)}><Trash2 className="size-3.5" /></Button>
                </div></TableCell>}
              </TableRow>
            ))}</TableBody>
          </Table>
        </Card>
      )}
      {editing && <EditCatalog key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteCatalog entry={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function DeleteCatalog({ entry, onClose }: { entry: WorkCatalogEntry; onClose: () => void }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => referenceData.deleteCatalog(entry.id),
    onSuccess: () => {
      for (const key of ["work-catalog", "work-types", "wt-groups", "block-designs"]) qc.invalidateQueries({ queryKey: [key] });
      toast.success("Ажил устгагдлаа");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return <FormDialog open onOpenChange={(open) => { if (!open && !remove.isPending) onClose(); }} title="Ажил устгах" submitLabel="Устгах" pending={remove.isPending} onSubmit={() => remove.mutate()}>
    <p className="text-sm"><strong>{entry.systemCode} · {entry.name}</strong> ажлыг лавлахын жагсаалтаас устгах уу?</p>
  </FormDialog>;
}

function EditCatalog({ entry, onClose }: { entry: WorkCatalogEntry; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(entry.name);
  const [unit, setUnit] = useState(entry.unit ?? "");
  const [description, setDescription] = useState(entry.description ?? "");
  const needsClarification = !inferWorkLocation({ ...entry, name }) || Boolean(entry.locationLevelOverride);
  const [level, setLevel] = useState<LocationLevel | "">(entry.locationLevelOverride ?? "");
  const save = useMutation({
    mutationFn: () => referenceData.updateCatalog(entry.id, { name: name.trim(), unit: unit.trim() || null, description: description.trim() || null, ...(needsClarification ? { level: level || null } : {}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-catalog"] }); qc.invalidateQueries({ queryKey: ["work-types"] }); qc.invalidateQueries({ queryKey: ["wt-groups"] }); toast.success("Ажлын мэдээлэл шинэчлэгдлээ"); onClose(); },
    onError: (error: Error) => toast.error(error.message),
  });
  return <FormDialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }} title={`Ажил засах · ${entry.systemCode}`} submitLabel="Хадгалах" submitDisabled={!name.trim() || Boolean(entry.workTypeId && !unit.trim()) || Boolean(entry.workTypeId && needsClarification && !level)} pending={save.isPending} onSubmit={() => save.mutate()}>
    <FormField label="Хийгдэх ажлын нэр" required><Input value={name} maxLength={255} onChange={(e) => setName(e.target.value)} /></FormField>
    <FormField label="Хэмжих нэгж" hint={entry.inUse ? "Төлөвлөгөөнд ашигласан тул нэгж өөрчлөх боломжгүй." : "Тодорхойгүй бол хоосон үлдээнэ."}><Input value={unit} disabled={entry.inUse} maxLength={20} onChange={(e) => setUnit(e.target.value)} /></FormField>
    {needsClarification && <FormField label="Байршил тодруулах" hint={entry.inUse ? "Төлөвлөгөөнд ашигласан тул байршлын түвшин өөрчлөх боломжгүй." : "Эх мэдээлэл тодорхойгүй тул нэг удаа тодруулна уу."}>
      <select aria-label="Байршил тодруулах" value={level} disabled={entry.inUse} onChange={(event) => setLevel(event.target.value as LocationLevel | "")} className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
        {!entry.workTypeId && <option value="">Сонгоно уу</option>}
        {Object.entries(LEVEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </FormField>}
    <FormField label="Тодорхойлолт"><Input value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} /></FormField>
  </FormDialog>;
}
