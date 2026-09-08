"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contractors, type CreateContractorRequest } from "@/lib/api";

export function NewContractorDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateContractorRequest>({ name: "" });

  const mutation = useMutation({
    mutationFn: () =>
      contractors.create({
        name: form.name.trim(),
        companyName: form.companyName?.trim() || undefined,
        tradeSpecialty: form.tradeSpecialty?.trim() || undefined,
        contactPerson: form.contactPerson?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        email: form.email?.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contractors"] });
      toast.success("Гүйцэтгэгч үүслээ");
      setOpen(false);
      setForm({ name: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof CreateContractorRequest) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <Button onClick={() => setOpen(true)}>Шинэ гүйцэтгэгч</Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Шинэ гүйцэтгэгч"
        submitLabel="Үүсгэх"
        submitDisabled={!form.name.trim()}
        pending={mutation.isPending}
        onSubmit={() => mutation.mutate()}
      >
        <FormField label="Нэр" required>
          <Input value={form.name} onChange={set("name")} autoFocus />
        </FormField>
        <FormField label="Компанийн нэр">
          <Input value={form.companyName ?? ""} onChange={set("companyName")} />
        </FormField>
        <FormField label="Мэргэжил / чиглэл">
          <Input value={form.tradeSpecialty ?? ""} onChange={set("tradeSpecialty")} />
        </FormField>
        <FormField label="Холбоо барих хүн">
          <Input value={form.contactPerson ?? ""} onChange={set("contactPerson")} />
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
