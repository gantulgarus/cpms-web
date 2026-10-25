"use client";

/**
 * Ажлын хяналт шалгалтыг хариуцах инженерийг солих.
 *
 * ЯАГААД ХЭРЭГТЭЙ ВЭ: хяналтын инженер нь ТӨСВӨӨС оногддог
 * (`cpms:import-quantities` нь «Хяналт шалгалт хийх инженер» баганыг уншина).
 * Гэвч Ланкастер А1 блокийн төсвийн 64 мөрийн 36-д тэр багана ХООСОН бөгөөд
 * дөрвөн нэрийн нэг нь ямар ч ажлын төрөлд хамаарахгүй байв. Өөрөөр хэлбэл
 * импортын дараа ч гараар нөхөх шаардлага ҮРГЭЛЖ гарна.
 *
 * ХЯЗГААРЛАЛТ: батлах эрхгүй хүнийг оноож болохгүй. Оноовол гүйцэтгэл
 * батлахыг хүлээсэн ажил эрхгүй хүн рүү явж мөнхөд гацна — шалтгаан нь
 * дэлгэц дээр хаана ч харагдахгүй. Серверийн дүрэм; энд зөвхөн сонголтоос
 * хасаад урьдчилж хэлнэ.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { assignments, users } from "@/lib/api/endpoints";
import type { WorkItem } from "@/lib/api/types";

export function AssignInspectorDialog({
  item,
  open,
  onOpenChange,
  onDone,
}: {
  item: WorkItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [inspectorId, setInspectorId] = useState(String(item.inspector?.id ?? ""));

  /*
   * Зөвхөн БАТЛАХ ЭРХТЭЙ, эрх нь хаагдаагүй хүнийг санал болгоно.
   *
   * `users.list()` БИШ: тэр эндпойнт зөвхөн админ, захиралд нээлттэй тул
   * ерөнхий инженер 403 аваад жагсаалт хоосон гарна. `users.inspectors()`
   * нь оноох эрхтэй бүх үүрэгт нээлттэй бөгөөд шүүлтийг СЕРВЕР хийдэг —
   * үүргийн жагсаалтыг энд хуулбарлавал backend-ийн `INSPECTOR_ROLES`
   * өөрчлөгдөхөд энэ файл чимээгүй хоцорно.
   */
  const list = useQuery({
    queryKey: ["inspectors"],
    queryFn: () => users.inspectors(),
    enabled: open,
  });

  const candidates = list.data ?? [];

  const save = useMutation({
    mutationFn: () => assignments.assignInspector(item.id, inspectorId || null),
    onSuccess: (updated) => {
      toast.success(
        updated.inspector
          ? `${updated.inspector.name} хяналт хариуцах боллоо`
          : "Хяналтын инженерийг авлаа",
      );
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["work-item", item.id] });
      qc.invalidateQueries({ queryKey: ["work-items"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Хяналтын инженер солих"
      submitLabel="Хадгалах"
      submitDisabled={inspectorId === String(item.inspector?.id ?? "")}
      pending={save.isPending}
      onSubmit={() => save.mutate()}
    >
      <div className="bg-muted/50 rounded-md px-3 py-2 text-sm">
        <div className="font-medium">{item.name}</div>
        <div className="text-muted-foreground text-xs">{item.location.path}</div>
      </div>

      <FormField
        label="Хяналт шалгалт хийх инженер"
        hint="Зөвхөн гүйцэтгэл батлах эрхтэй хүн жагсаана."
      >
        <select
          value={inspectorId}
          onChange={(e) => setInspectorId(e.target.value)}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          <option value="">— хариуцагчгүй —</option>
          {candidates.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.name}
              {u.position ? ` · ${u.position}` : ""}
            </option>
          ))}
        </select>
      </FormField>

      {list.isSuccess && candidates.length === 0 ? (
        <p className="text-destructive text-xs" role="alert">
          Батлах эрхтэй хэрэглэгч бүртгэгдээгүй байна. Хэрэглэгчийн хуудаснаас хяналтын инженер
          нэмэх шаардлагатай.
        </p>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Хяналтын инженер нь <strong>төсвөөс</strong> оногддог. Энд солиход зөвхөн энэ нэг мөр
        өөрчлөгдөнө — төсвийг дахин импортлоход дарагдана.
      </p>
    </FormDialog>
  );
}
