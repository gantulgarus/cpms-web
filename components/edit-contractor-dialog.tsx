"use client";

/**
 * Гүйцэтгэгчийн гэрээний профайл засах.
 *
 * ЯАГААД ХЭРЭГТЭЙ ВЭ: «Ажил гүйцэтгэх тохиролцооны хуудас» нь РД, дансны
 * дугаар, банкийг шаарддаг. Эдгээр мэдээлэл нь гүйцэтгэгчийг бүртгэх үед
 * бус ХОЖИМ ирдэг — хуваарийн файлд нэр ба чиглэл л байсан.
 *
 * Засах зам байхгүй бол шинэ бүртгэл үүсгэхээс өөр арга үлдэхгүй; тэгвэл
 * нэг компани хоёр мөр болж, акт, барьцаа, торгууль хуваагдана.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { Input } from "@/components/ui/input";
import { contractorsV2 } from "@/lib/api/v2/endpoints";
import type { Contractor } from "@/lib/api/v2/types";
import { CONTRACTOR_CATEGORIES, CONTRACTOR_STATUSES } from "@/lib/domain";

export function EditContractorDialog({
  contractor,
  open,
  onOpenChange,
  onDone,
}: {
  contractor: Contractor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: contractor.name,
    registrationNo: contractor.registrationNo ?? "",
    tradeSpecialty: contractor.tradeSpecialty ?? "",
    category: contractor.category ?? "",
    status: contractor.status ?? "active",
    contactPerson: contractor.contactPerson ?? "",
    phone: contractor.phone ?? "",
    email: contractor.email ?? "",
    bankName: contractor.bankName ?? "",
    bankAccount: contractor.bankAccount ?? "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  // РД нь 7 орон — серверийн дүрэм, энд урьдчилж хэлнэ.
  const regInvalid = form.registrationNo !== "" && !/^\d{7}$/.test(form.registrationNo);

  const save = useMutation({
    mutationFn: () =>
      contractorsV2.update(contractor.id, {
        name: form.name.trim(),
        registrationNo: form.registrationNo.trim() || null,
        tradeSpecialty: form.tradeSpecialty.trim() || null,
        category: form.category || null,
        status: form.status as Contractor["status"],
        contactPerson: form.contactPerson.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        bankName: form.bankName.trim() || null,
        bankAccount: form.bankAccount.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Хадгалагдлаа");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["v2-contractors"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Гүйцэтгэгчийн мэдээлэл"
      submitLabel="Хадгалах"
      submitDisabled={!form.name.trim() || regInvalid}
      pending={save.isPending}
      onSubmit={() => save.mutate()}
    >
      <FormField label="Нэр" required>
        <Input value={form.name} onChange={(e) => set("name")(e.target.value)} />
      </FormField>

      <FormField
        label="Регистрийн дугаар"
        hint="7 орон. Гүйцэтгэгчийг таних цорын гагц тэмдэг — давхардахгүй."
      >
        <Input
          value={form.registrationNo}
          onChange={(e) => set("registrationNo")(e.target.value.replace(/\D/g, "").slice(0, 7))}
          inputMode="numeric"
          aria-invalid={regInvalid || undefined}
        />
      </FormField>

      {regInvalid && (
        <p className="text-destructive text-xs" role="alert">
          Регистрийн дугаар 7 орон байх ёстой.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Ажлын ангилал">
          <select
            value={form.category}
            onChange={(e) => set("category")(e.target.value)}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">— сонгоогүй —</option>
            {Object.entries(CONTRACTOR_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>

        {/* Устгахын оронд ХААНА: акт, барьцаа, торгууль нь түүхэнд үлдэх ёстой. */}
        <FormField label="Төлөв" hint="Цуцлагдсанд шинэ ажил оноогдохгүй.">
          <select
            value={form.status}
            onChange={(e) => set("status")(e.target.value)}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {Object.entries(CONTRACTOR_STATUSES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label="Чиглэл" hint="Чөлөөт тайлбар: «Гипсэн хана, тааз, MDF, нерж»">
        <Input
          value={form.tradeSpecialty}
          onChange={(e) => set("tradeSpecialty")(e.target.value)}
        />
      </FormField>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Холбоо барих хүн">
          <Input
            value={form.contactPerson}
            onChange={(e) => set("contactPerson")(e.target.value)}
          />
        </FormField>
        <FormField label="Утас">
          <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} />
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Банк">
          <Input value={form.bankName} onChange={(e) => set("bankName")(e.target.value)} />
        </FormField>
        <FormField label="Дансны дугаар">
          <Input value={form.bankAccount} onChange={(e) => set("bankAccount")(e.target.value)} />
        </FormField>
      </div>

      <p className="text-muted-foreground text-xs">
        РД, данс, банк, утас нь <strong>ажил гүйцэтгэх тохиролцооны хуудсанд</strong> шаардагдана.
        Дутуу байвал тохиролцоо бичигдэхгүй.
      </p>
    </FormDialog>
  );
}
