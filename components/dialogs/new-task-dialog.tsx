"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { EnumSelect } from "@/components/enum-select";
import { FormDialog, FormField } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { tasks, type CreateTaskRequest, type WorkStatus } from "@/lib/api";
import { WORK_STATUS, WORK_STATUS_OPTIONS } from "@/lib/domain";

export function NewTaskDialog({ activityId }: { activityId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateTaskRequest>({ name: "", status: "not_started" });

  const mutation = useMutation({
    mutationFn: () =>
      tasks.create(activityId, {
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        sequenceNumber: form.sequenceNumber,
        durationDays: form.durationDays,
        plannedStartDate: form.plannedStartDate?.trim() || undefined,
        plannedEndDate: form.plannedEndDate?.trim() || undefined,
        status: form.status,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", activityId] });
      toast.success("Даалгавар үүслээ");
      setOpen(false);
      setForm({ name: "", status: "not_started" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setText = (k: keyof CreateTaskRequest) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <Button onClick={() => setOpen(true)}>Шинэ даалгавар</Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Шинэ даалгавар"
        submitLabel="Үүсгэх"
        submitDisabled={!form.name.trim()}
        pending={mutation.isPending}
        onSubmit={() => mutation.mutate()}
      >
        <FormField label="Нэр" required>
          <Input value={form.name} onChange={setText("name")} autoFocus />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Үргэлжлэх (хоног)" hint="CPM хуваарьт ашиглагдана.">
            <Input
              type="number"
              value={form.durationDays ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, durationDays: e.target.value ? Number(e.target.value) : undefined }))
              }
            />
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
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Төлөвлөсөн эхлэл">
            <Input value={form.plannedStartDate ?? ""} onChange={setText("plannedStartDate")} placeholder="YYYY-MM-DD" />
          </FormField>
          <FormField label="Төлөвлөсөн төгсгөл">
            <Input value={form.plannedEndDate ?? ""} onChange={setText("plannedEndDate")} placeholder="YYYY-MM-DD" />
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
          <Textarea value={form.description ?? ""} onChange={setText("description")} rows={2} />
        </FormField>
      </FormDialog>
    </>
  );
}
