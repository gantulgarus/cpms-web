"use client";

/**
 * Шинэ төсөл үүсгэх.
 *
 * Хоосон серверт (demo өгөгдөл цэвэрлэсний дараа) компани ч байхгүй байж
 * болно — тэр үед компанийн нэрийг энд оруулж, хоёуланг нь нэг алхмаар
 * үүсгэнэ. Урьд нь төслийг зөвхөн серверт tinker-ээр үүсгэх боломжтой байв.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { Input } from "@/components/ui/input";
import { projects } from "@/lib/api/endpoints";
import type { ProjectSummary } from "@/lib/api/use-project";

/** Компанийн сонголтод «шинэ компани» гэсэн утга. */
const NEW_COMPANY = "__new__";

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: ProjectSummary) => void;
}) {
  const qc = useQueryClient();

  const companiesQuery = useQuery({
    queryKey: ["companies"],
    queryFn: () => projects.companies(),
    enabled: open,
  });
  const companies = companiesQuery.data ?? [];

  const [form, setForm] = useState({
    name: "",
    companyId: "",
    companyName: "",
    code: "",
    location: "",
    startDate: "",
    endDate: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Сонгоогүй бол эхний компани; компани огт байхгүй бол шинээр үүсгэнэ.
  const companyId = form.companyId || companies[0]?.id || NEW_COMPANY;
  const isNewCompany = companyId === NEW_COMPANY;

  const datesInvalid = Boolean(form.startDate && form.endDate && form.endDate < form.startDate);

  const create = useMutation({
    mutationFn: () =>
      projects.create({
        name: form.name.trim(),
        companyId: isNewCompany ? undefined : companyId,
        companyName: isNewCompany ? form.companyName.trim() : undefined,
        code: form.code.trim() || undefined,
        location: form.location.trim() || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      }),
    onSuccess: (project) => {
      toast.success(`${project.name} үүслээ`);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      onOpenChange(false);
      onCreated?.(project);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Шинэ төсөл"
      submitLabel="Үүсгэх"
      submitDisabled={
        !form.name.trim() ||
        (isNewCompany && !form.companyName.trim()) ||
        datesInvalid ||
        companiesQuery.isLoading
      }
      pending={create.isPending}
      onSubmit={() => create.mutate()}
    >
      <FormField label="Төслийн нэр" required>
        <Input
          value={form.name}
          onChange={(e) => set("name")(e.target.value)}
          placeholder="75 барилгын цогцолбор"
        />
      </FormField>

      <FormField label="Захиалагч компани" required>
        <select
          value={companyId}
          onChange={(e) => set("companyId")(e.target.value)}
          disabled={companiesQuery.isLoading}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW_COMPANY}>+ Шинэ компани</option>
        </select>
      </FormField>

      {isNewCompany && (
        <FormField label="Компанийн нэр" required>
          <Input
            value={form.companyName}
            onChange={(e) => set("companyName")(e.target.value)}
            placeholder="Инэл ХХК"
          />
        </FormField>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Код">
          <Input value={form.code} onChange={(e) => set("code")(e.target.value)} />
        </FormField>
        <FormField label="Байршил">
          <Input value={form.location} onChange={(e) => set("location")(e.target.value)} />
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Эхлэх огноо">
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => set("startDate")(e.target.value)}
          />
        </FormField>
        <FormField label="Дуусах огноо">
          <Input
            type="date"
            value={form.endDate}
            onChange={(e) => set("endDate")(e.target.value)}
            aria-invalid={datesInvalid || undefined}
          />
        </FormField>
      </div>

      {datesInvalid && (
        <p className="text-destructive text-xs" role="alert">
          Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.
        </p>
      )}
    </FormDialog>
  );
}
