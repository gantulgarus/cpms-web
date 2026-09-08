"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { EnumSelect } from "@/components/enum-select";
import { FormDialog, FormField } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { workPackages, type CreateWorkPackageRequest, type WorkStatus } from "@/lib/api";
import { WORK_STATUS, WORK_STATUS_OPTIONS } from "@/lib/domain";

export function NewWorkPackageDialog({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateWorkPackageRequest>({ name: "", status: "not_started" });

  const mutation = useMutation({
    mutationFn: () =>
      workPackages.create(projectId, {
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        description: form.description?.trim() || undefined,
        sequenceNumber: form.sequenceNumber,
        status: form.status,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workPackages", projectId] });
      toast.success("Ажлын багц үүслээ");
      setOpen(false);
      setForm({ name: "", status: "not_started" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>Шинэ ажлын багц</Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Шинэ ажлын багц"
        submitLabel="Үүсгэх"
        submitDisabled={!form.name.trim()}
        pending={mutation.isPending}
        onSubmit={() => mutation.mutate()}
      >
        <FormField label="Нэр" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Код">
            <Input value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </FormField>
          <FormField label="Дараалал">
            <Input
              type="number"
              value={form.sequenceNumber ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, sequenceNumber: e.target.value ? Number(e.target.value) : undefined }))
              }
            />
          </FormField>
        </div>
        <FormField label="Төлөв">
          <EnumSelect
            value={form.status ?? "not_started"}
            onChange={(v: WorkStatus) => setForm((f) => ({ ...f, status: v }))}
            options={WORK_STATUS_OPTIONS.map((v) => ({ value: v, label: WORK_STATUS[v].label }))}
          />
        </FormField>
        <FormField label="Тайлбар">
          <Textarea
            value={form.description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
        </FormField>
      </FormDialog>
    </>
  );
}
