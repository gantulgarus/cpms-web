"use client";

/**
 * Туслан гүйцэтгэгч ба тэдний нэвтрэх эрх (API v2).
 *
 * Захиалагч: "Ажил гүйцэтгэх хугацаанд олгогдсон кодоор нэвтэрнэ",
 * "Туслан гүйцэтгэгчээс 1 хүн — талбай дээр ажил ахалж байгаа хүн".
 * Тиймээс нэг гүйцэтгэгчид нэг код, гэрээ дуусахад хаана.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Copy, KeyRound, Plus, ShieldOff } from "lucide-react";
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
import { request } from "@/lib/api/client";
import type { ListEnvelope, Uuid } from "@/lib/api/v2/types";
import { useMe } from "@/lib/api/v2/use-me";

interface ContractorRow {
  id: Uuid;
  name: string;
  companyName?: string | null;
  tradeSpecialty?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  /** Зөвхөн удирдах эрхтэйд ирнэ. */
  accessCode?: string | null;
  accessCodeExpiresAt?: string | null;
  hasValidAccessCode: boolean;
}

export default function ContractorsV2Page() {
  const qc = useQueryClient();
  const { me } = useMe();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", tradeSpecialty: "", contactPerson: "", phone: "" });

  const query = useQuery({
    queryKey: ["v2-contractors"],
    queryFn: () => request<ListEnvelope<ContractorRow>>("GET", "/contractors"),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["v2-contractors"] });

  /** "Хэдэн утаснаас гарлаа" — админ үйлдлийнхээ үр дагаврыг харах ёстой. */
  const signedOutNote = (n?: number) => (n && n > 0 ? ` ${n} төхөөрөмжөөс гарлаа.` : "");

  const issue = useMutation({
    mutationFn: (id: Uuid) =>
      request<{ data: ContractorRow; meta?: { signedOutDevices?: number } }>(
        "POST",
        `/contractors/${id}/access-code`,
      ),
    onSuccess: (res) => {
      toast.success(
        `Шинэ код: ${res.data.accessCode}.${signedOutNote(res.meta?.signedOutDevices)}`,
        { duration: 20000 },
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: Uuid) =>
      request<{ data: ContractorRow; meta?: { signedOutDevices?: number } }>(
        "DELETE",
        `/contractors/${id}/access-code`,
      ),
    onSuccess: (res) => {
      toast.success(`Хандалт хаагдлаа.${signedOutNote(res.meta?.signedOutDevices)}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: () =>
      request<{ data: ContractorRow }>("POST", "/contractors", {
        body: {
          name: form.name.trim(),
          tradeSpecialty: form.tradeSpecialty.trim() || undefined,
          contactPerson: form.contactPerson.trim() || undefined,
          phone: form.phone.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Гүйцэтгэгч бүртгэгдлээ");
      setCreating(false);
      setForm({ name: "", tradeSpecialty: "", contactPerson: "", phone: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canManage = Boolean(me?.canManageContractors);

  return (
    <div>
      <PageHeader
        title="Туслан гүйцэтгэгчид"
        description="Гэрээний хугацаанд олгогдсон кодоор системд нэвтэрч, ажлаа өөрсдөө бүртгэнэ."
        actions={
          canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Шинэ гүйцэтгэгч
            </Button>
          )
        }
      />

      {query.isLoading ? (
        <LoadingRows rows={4} />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (query.data?.data.length ?? 0) === 0 ? (
        <EmptyState title="Гүйцэтгэгч алга" description="Эхний туслан гүйцэтгэгчээ бүртгэнэ үү." />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Нэр</TableHead>
                <TableHead>Чиглэл</TableHead>
                <TableHead>Холбоо барих</TableHead>
                {canManage && <TableHead>Нэвтрэх код</TableHead>}
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data!.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.tradeSpecialty ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.contactPerson ?? "—"}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </TableCell>

                  {canManage && (
                    <TableCell>
                      {c.accessCode ? (
                        <AccessCode code={c.accessCode} expiresAt={c.accessCodeExpiresAt} />
                      ) : (
                        <ToneBadge tone="gray">Эрхгүй</ToneBadge>
                      )}
                    </TableCell>
                  )}

                  <TableCell>
                    {canManage && (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={issue.isPending}
                          onClick={() => {
                            // Код сэргээх нь хуучин утсыг ГАРГАНА — админ
                            // санамсаргүй дарж талбайн хүнийг таслах ёсгүй.
                            if (
                              !c.accessCode ||
                              confirm(
                                `${c.name}-д шинэ код олгох уу? Хуучин код хүчингүй болж, нэвтэрсэн утаснууд гарна.`,
                              )
                            ) {
                              issue.mutate(c.id);
                            }
                          }}
                        >
                          <KeyRound className="size-3.5" />
                          {c.accessCode ? "Код сэргээх" : "Код олгох"}
                        </Button>
                        {c.accessCode && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={revoke.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `${c.name}-ийн хандалтыг хаах уу? Нэвтэрсэн утаснууд шууд гарна.`,
                                )
                              ) {
                                revoke.mutate(c.id);
                              }
                            }}
                          >
                            <ShieldOff className="size-3.5" /> Хаах
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Шинэ туслан гүйцэтгэгч"
        submitLabel="Бүртгэх"
        submitDisabled={!form.name.trim()}
        pending={create.isPending}
        onSubmit={() => create.mutate()}
      >
        <FormField label="Компанийн нэр" required>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Гоо Засал ХХК"
            autoFocus
          />
        </FormField>
        <FormField label="Чиглэл">
          <Input
            value={form.tradeSpecialty}
            onChange={(e) => setForm((f) => ({ ...f, tradeSpecialty: e.target.value }))}
            placeholder="Дотор засал"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Холбоо барих хүн">
            <Input
              value={form.contactPerson}
              onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
            />
          </FormField>
          <FormField label="Утас">
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </FormField>
        </div>
        <p className="text-muted-foreground text-xs">
          Бүртгэсний дараа «Код олгох» дарж нэвтрэх эрх үүсгэнэ.
        </p>
      </FormDialog>
    </div>
  );
}

/** Кодыг хуулах — оффисын хүн утсаар уншиж дамжуулахад хэрэгтэй. */
function AccessCode({ code, expiresAt }: { code: string; expiresAt?: string | null }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(code).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => toast.error("Хуулж чадсангүй"),
          );
        }}
        className="hover:bg-accent flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-sm tracking-wider transition-colors"
        title="Хуулах"
      >
        {code}
        {copied ? (
          <Check className="size-3 text-emerald-600" />
        ) : (
          <Copy className="size-3 opacity-50" />
        )}
      </button>
      {expiresAt && <div className="text-muted-foreground px-1.5 text-xs">{expiresAt} хүртэл</div>}
    </div>
  );
}
