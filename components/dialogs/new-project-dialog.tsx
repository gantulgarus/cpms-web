"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { EnumSelect } from "@/components/enum-select";
import { FormDialog, FormField } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { projects, type CreateProjectRequest, type ProjectStatus } from "@/lib/api";
import { PROJECT_STATUS, PROJECT_STATUS_OPTIONS } from "@/lib/domain";

export function NewProjectDialog({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateProjectRequest>({ name: "", status: "planned" });
  const [wps, setWps] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      const wpNames = wps
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      return projects.create(companyId, {
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        location: form.location?.trim() || undefined,
        description: form.description?.trim() || undefined,
        startDate: form.startDate?.trim() || undefined,
        endDate: form.endDate?.trim() || undefined,
        status: form.status,
        workPackages: wpNames.length ? wpNames.map((name, i) => ({ name, sequenceNumber: i + 1 })) : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", companyId] });
      toast.success("Төсөл үүслээ");
      setOpen(false);
      setForm({ name: "", status: "planned" });
      setWps("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setText =
    (k: keyof CreateProjectRequest) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <Button onClick={() => setOpen(true)}>Шинэ төсөл</Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Шинэ төсөл"
        submitLabel="Үүсгэх"
        submitDisabled={!form.name.trim()}
        pending={mutation.isPending}
        onSubmit={() => mutation.mutate()}
      >
        <FormField label="Нэр" required>
          <Input value={form.name} onChange={setText("name")} autoFocus />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Код">
            <Input value={form.code ?? ""} onChange={setText("code")} />
          </FormField>
          <FormField label="Байршил">
            <Input value={form.location ?? ""} onChange={setText("location")} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Эхлэх огноо">
            <Input value={form.startDate ?? ""} onChange={setText("startDate")} placeholder="YYYY-MM-DD" />
          </FormField>
          <FormField label="Дуусах огноо">
            <Input value={form.endDate ?? ""} onChange={setText("endDate")} placeholder="YYYY-MM-DD" />
          </FormField>
        </div>
        <FormField label="Төлөв">
          <EnumSelect
            value={form.status ?? "planned"}
            onChange={(v: ProjectStatus) => setForm((f) => ({ ...f, status: v }))}
            options={PROJECT_STATUS_OPTIONS.map((v) => ({ value: v, label: PROJECT_STATUS[v].label }))}
          />
        </FormField>
        <FormField label="Тайлбар">
          <Textarea value={form.description ?? ""} onChange={setText("description")} rows={2} />
        </FormField>
        <FormField label="Анхны ажлын багцууд" hint="Мөр бүрт нэг нэр — төсөлтэй хамт нэг гүйлгээгээр үүснэ.">
          <Textarea value={wps} onChange={(e) => setWps(e.target.value)} rows={3} placeholder="Гадна засал&#10;Дотор засал" />
        </FormField>
      </FormDialog>
    </>
  );
}
