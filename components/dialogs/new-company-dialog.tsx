"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { companies, type CreateCompanyRequest } from "@/lib/api";

export function NewCompanyDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateCompanyRequest>({ name: "" });

  const mutation = useMutation({
    mutationFn: () =>
      companies.create({
        name: form.name.trim(),
        registrationNumber: form.registrationNumber?.trim() || undefined,
        address: form.address?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        email: form.email?.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Компани үүслээ");
      setOpen(false);
      setForm({ name: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof CreateCompanyRequest) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <Button onClick={() => setOpen(true)}>Шинэ компани</Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Шинэ компани"
        submitLabel="Үүсгэх"
        submitDisabled={!form.name.trim()}
        pending={mutation.isPending}
        onSubmit={() => mutation.mutate()}
      >
        <FormField label="Нэр" required>
          <Input value={form.name} onChange={set("name")} autoFocus />
        </FormField>
        <FormField label="Регистрийн дугаар">
          <Input value={form.registrationNumber ?? ""} onChange={set("registrationNumber")} />
        </FormField>
        <FormField label="Хаяг">
          <Input value={form.address ?? ""} onChange={set("address")} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Утас">
            <Input value={form.phone ?? ""} onChange={set("phone")} />
          </FormField>
          <FormField label="Имэйл">
            <Input value={form.email ?? ""} onChange={set("email")} type="email" />
          </FormField>
        </div>
      </FormDialog>
    </>
  );
}
