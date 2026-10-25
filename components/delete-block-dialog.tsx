"use client";

/**
 * Блок устгах — ХОЁР ТҮГЖЭЭТЭЙ.
 *
 * 1. Юу алга болохыг ТООГООР харуулна. «Устгах уу?» гэсэн асуулт
 *    тоогүйгээр утгагүй: хүн юу алдаж байгаагаа мэдэхгүй байж «тийм»
 *    гэж хариулна.
 * 2. Блокийн нэрийг бичүүлнэ. Санамсаргүй дарах боломжийг бүрэн хаана.
 *
 * Энэ нь чирэгдэл биш: 1,991 ажлын мөр, бүх гүйцэтгэл, акт нэг
 * товчоор алга болно. Буцаах арга байхгүй.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { blocks } from "@/lib/api/endpoints";

export function DeleteBlockDialog({
  open,
  onOpenChange,
  blockId,
  blockName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blockId: string;
  blockName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <Body blockId={blockId} blockName={blockName} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  blockId,
  blockName,
  onDone,
}: {
  blockId: string;
  blockName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");

  const impact = useQuery({
    queryKey: ["block-deletion-impact", blockId],
    queryFn: () => blocks.deletionImpact(blockId),
  });

  const remove = useMutation({
    mutationFn: () => blocks.destroy(blockId, typed.trim()),
    onSuccess: (res) => {
      toast.success(`«${res.name}» устлаа.`);
      onDone();
      /*
       * Блокийн хуудас дээр үлдэх боломжгүй — тэр блок байхгүй болсон.
       * Жагсаалт руу БҮРЭН дахин ачаална: кэш дээр устсан блок үлдвэл
       * дарахад 404 гарна.
       */
      router.replace("/blocks");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const matches = typed.trim() === blockName;
  const d = impact.data;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-destructive">«{blockName}» блокийг устгах</DialogTitle>
        <DialogDescription>
          Энэ үйлдлийг буцаах арга БАЙХГҮЙ. Блокт хамаарах бүх өгөгдөл хамт устана.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {impact.isLoading ? (
          <p className="text-muted-foreground text-sm">Тоолж байна…</p>
        ) : impact.error ? (
          <p className="text-destructive text-sm">{(impact.error as Error).message}</p>
        ) : d ? (
          <>
            <div className="bg-muted/40 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md p-3 text-sm">
              <Row label="Байршил" value={d.locations} />
              <Row label="Ажил" value={d.workItems} />
              <Row label="Явцын бичлэг" value={d.progressEntries} />
              <Row label="Шалгалт" value={d.inspections} />
              <Row label="Зураг" value={d.photos} />
              <Row label="Тохиролцоо" value={d.agreements} />
              <Row label="Бетон захиалга" value={d.concreteOrders} />
              <Row label="Материалын захиалга" value={d.materialOrders} />
              <Row label="Импортын түүх" value={d.budgetImports} />
            </div>

            {/* БАТАЛГААЖСАН ажил нь актад орсон байж болзошгүй — мөнгөний
                баримт. Энэ сануулга бусдаас ТОМ байх ёстой. */}
            {d.acceptedInspections > 0 && (
              <div className="flex gap-2.5 rounded-md border border-red-500/50 bg-red-500/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-medium">
                    {d.acceptedInspections.toLocaleString("mn-MN")} баталгаажсан шалгалт устана
                  </p>
                  <p className="text-muted-foreground">
                    Эдгээр нь актад орж, төлбөр хийгдсэн байж болзошгүй. Устгавал тэр баримт
                    системд үлдэхгүй.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : null}

        <div className="space-y-1.5">
          <Label className="text-sm">
            Баталгаажуулахын тулд <span className="font-medium">{blockName}</span> гэж бичнэ үү
          </Label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={blockName}
            autoComplete="off"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Болих
        </Button>
        <Button
          variant="destructive"
          onClick={() => remove.mutate()}
          disabled={!matches || remove.isPending}
        >
          {remove.isPending ? "Устгаж байна…" : "Бүрмөсөн устгах"}
        </Button>
      </DialogFooter>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value.toLocaleString("mn-MN")}</span>
    </div>
  );
}
