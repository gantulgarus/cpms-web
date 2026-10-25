"use client";

/**
 * Өөрийн профайл.
 *
 * ЗӨВХӨН ХАРАХ. Нэр, үүрэг, хамрах хүрээг хэрэглэгч ӨӨРӨӨ засаж
 * болохгүй: үүрэг нь эрх, хамрах хүрээ нь хэн юу харахыг тодорхойлдог.
 * Өөрийгөө ерөнхий инженер болгох боломжтой систем нь эрхийн хяналтгүй
 * системтэй адил.
 *
 * ЭНЭ ХУУДАС ЮУНД ХЭРЭГТЭЙ ВЭ: «би яагаад энэ товчийг харахгүй байна»
 * гэсэн асуултын хариу. Эрх бүрийг тийм/үгүйгээр жагсаана — эс бөгөөс
 * хэрэглэгч систем эвдэрсэн гэж бодно.
 */
import { useQuery } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingRows } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { blocks as blocksApi } from "@/lib/api/endpoints";
import { type Me, useMe } from "@/lib/api/use-me";
import { useProject } from "@/lib/api/use-project";
import { clearSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** Эрх бүрийн ЭНГИЙН тайлбар — талбар нэрээр биш, хийж чадах зүйлээр. */
const PERMISSIONS: { key: keyof Me; label: string; hint: string }[] = [
  {
    key: "canReportProgress",
    label: "Гүйцэтгэл мэдээлэх",
    hint: "Хийсэн ажлынхаа тоо хэмжээг бүртгэх.",
  },
  {
    key: "canCheck",
    label: "1-р шат — шалгах",
    hint: "Мэдээлсэн ажлыг газар дээр нь шалгах.",
  },
  {
    key: "canInspect",
    label: "2-р шат — батлах",
    hint: "Эцсийн батлалт. Зөвхөн энэ шат актад орно.",
  },
  {
    key: "canEditPlan",
    label: "Төлөвлөгөө засах",
    hint: "Тоо хэмжээ, хугацаа өөрчлөх.",
  },
  {
    key: "canManageContractors",
    label: "Гүйцэтгэгч удирдах",
    hint: "Бүртгэх, нэвтрэх код олгох, тохиролцоо бичих.",
  },
  {
    key: "canAssignInspectors",
    label: "Хяналтын инженер оноох",
    hint: "Ажил бүрийн хариуцагчийг тогтоох.",
  },
  {
    key: "canApproveExtensions",
    label: "Хугацаа сунгалт батлах",
    hint: "Хуваарийн гулсалтыг зөвшөөрөх.",
  },
  {
    key: "canManageReferenceData",
    label: "Төсөв оруулах, лавлах засах",
    hint: "Ажлын төрөл, төсвийн импорт.",
  },
  {
    key: "canManageUsers",
    label: "Хэрэглэгч удирдах",
    hint: "Бүртгэх, үүрэг оноох, идэвхгүй болгох.",
  },
];

export default function ProfilePage() {
  const { me, isLoading } = useMe();
  const { project } = useProject();

  const blocksQuery = useQuery({
    queryKey: ["blocks", project?.id],
    queryFn: () => blocksApi.listForProject(project!.id),
    enabled: Boolean(project) && (me?.scopeBlockIds.length ?? 0) > 0,
  });

  if (isLoading || !me) return <LoadingRows rows={6} />;

  const scopeNames = (blocksQuery.data?.data ?? [])
    .filter((b) => me.scopeBlockIds.includes(b.id))
    .map((b) => b.name);

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Профайл" description="Таны бүртгэл ба системийн эрх." />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Бүртгэл</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Нэр" value={me.name} strong />
          <Row label="Имэйл" value={me.email} />
          {/* Албан тушаал ба үүрэг нь ӨӨР зүйл — хоёуланг нь тусад нь. */}
          <Row label="Албан тушаал" value={me.position ?? "—"} />
          <Row label="Системийн үүрэг" value={me.roleLabel} />
          <Row
            label="Хамрах хүрээ"
            value={
              me.scopeBlockIds.length === 0
                ? "Бүх барилга"
                : scopeNames.length > 0
                  ? scopeNames.join(", ")
                  : `${me.scopeBlockIds.length} барилга`
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Эрх</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {PERMISSIONS.map((p) => {
            const on = Boolean(me[p.key]);

            return (
              <div key={p.key} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                    on
                      ? "bg-green-600/15 text-green-700 dark:text-green-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {on ? <Check className="size-3" /> : <Minus className="size-3" />}
                </span>
                <div className="min-w-0 text-sm">
                  <div className={cn(!on && "text-muted-foreground")}>{p.label}</div>
                  <div className="text-muted-foreground text-xs">{p.hint}</div>
                </div>
              </div>
            );
          })}

          <p className="text-muted-foreground border-t pt-3 text-xs">
            Эрхийг үүрэг тодорхойлно. Өөрчлөх шаардлагатай бол админд хандана уу — өөрийн
            эрхээ өөрөө нэмэх боломжгүй.
          </p>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        onClick={() => {
          clearSession();
          window.location.href = "/";
        }}
      >
        Системээс гарах
      </Button>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right", strong && "font-medium")}>{value}</span>
    </div>
  );
}
