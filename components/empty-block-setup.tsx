"use client";

/**
 * Ажилгүй блокийн тохиргоо.
 *
 * Загваргүй үүсгэсэн блок нь давхар, айлтай ч ажилгүй байна. Энэ бол
 * МУХАРДМАЛ ТӨЛӨВ биш байх ёстой — хоёр гарц тэр дор нь харагдана:
 *
 *   1. Стандарт загвар буулгах — олон зуун ажил нэг дор үүснэ
 *   2. Ажил гараар нэмэх — лавлах сангаас төрөл сонгож энэ блокт буулгана
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LayoutTemplate, Plus } from "lucide-react";
import { toast } from "sonner";

import { AddWorkTypeDialog } from "@/components/add-work-type-dialog";
import { FormDialog, FormField } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { blockDesigns, jobs } from "@/lib/api/v2/endpoints";
import type { Uuid } from "@/lib/api/v2/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function EmptyBlockSetup({
  blockId,
  startDate,
  canEdit,
}: {
  blockId: Uuid;
  startDate?: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [applying, setApplying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [designId, setDesignId] = useState("");

  const designsQuery = useQuery({ queryKey: ["v2-designs"], queryFn: () => blockDesigns.list() });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["v2-summary"] });
    qc.invalidateQueries({ queryKey: ["v2-work-items"] });
    qc.invalidateQueries({ queryKey: ["v2-assignments"] });
    qc.invalidateQueries({ queryKey: ["v2-block", blockId] });
  };

  const apply = useMutation({
    mutationFn: async () => {
      let job = await blockDesigns.apply(designId, { blockId, startDate });

      // Хэдэн мянган мөр үүсэх тул дуустал нь хүлээнэ.
      while (job.status === "queued" || job.status === "running") {
        await sleep(400);
        job = await jobs.get(job.id);
      }
      if (job.status === "failed") throw new Error(job.error ?? "Загвар буулгах амжилтгүй.");

      return job;
    },
    onSuccess: (job) => {
      toast.success(`${job.total.toLocaleString("mn-MN")} ажил үүслээ`);
      setApplying(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="font-medium">Энэ блокт ажил үүсээгүй байна</h2>
            <p className="text-muted-foreground text-sm">
              Давхар, айл нь бэлэн. Одоо ажлаа үүсгэнэ үү — эс бөгөөс гүйцэтгэл бүртгэх зүйл
              байхгүй.
            </p>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setApplying(true)}
                disabled={(designsQuery.data?.data.length ?? 0) === 0}
              >
                <LayoutTemplate className="size-4" /> Стандарт загвар буулгах
              </Button>
              <Button variant="outline" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Ажил нэмэх
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={applying}
        onOpenChange={setApplying}
        title="Стандарт загвар буулгах"
        submitLabel="Буулгах"
        submitDisabled={!designId}
        pending={apply.isPending}
        onSubmit={() => apply.mutate()}
      >
        <FormField label="Загвар" required>
          <select
            value={designId}
            onChange={(e) => setDesignId(e.target.value)}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Сонгох…</option>
            {(designsQuery.data?.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.estimatedItems.toLocaleString("mn-MN")} ажил
              </option>
            ))}
          </select>
        </FormField>
        <p className="text-muted-foreground text-xs">
          Давхар, айл нь аль хэдийн үүссэн тул дахин үүсэхгүй — зөвхөн ажил нэмэгдэнэ.
        </p>
      </FormDialog>

      <AddWorkTypeDialog
        blockId={blockId}
        open={adding}
        onOpenChange={setAdding}
        onDone={refresh}
      />
    </>
  );
}
