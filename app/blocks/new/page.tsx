"use client";

/**
 * Шинэ блок үүсгэх — загвараас хувилах дэлгэц (API v2).
 *
 * Хэрэглэгч гурван зүйл л оруулна: нэр, барилгын дугаар, эхлэх огноо. Үлдсэнийг
 * загвар хийнэ — 3,000 орчим ажлын нэгж автоматаар үүснэ. Захиалагчийн 49
 * орон сууцны барилга ердөө 9 загвартай тул энэ дэлгэц 49 удаа ажиллана.
 *
 * Үүсгэлт хоёр алхамтай: эхлээд блок (шуурхай), дараа нь загвар буулгах ажил
 * (удаан, `jobId`-аар хянагдана). Poll хийх зам жинхэнэ backend дээр ч ижил.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, Layers } from "lucide-react";
import { toast } from "sonner";

import { FormField } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { blockDesigns, blocks, jobs } from "@/lib/api/v2/endpoints";
import type { BlockDesign, Job } from "@/lib/api/v2/types";
import { todayInProjectZone } from "@/lib/domain";
import { useProject } from "@/lib/api/v2/use-project";
import { cn } from "@/lib/utils";

const today = todayInProjectZone;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/*
 * Загвар буулгах нь ДАРААЛАЛД (queue) явдаг ажил.
 *
 * Сервер дээр `php artisan queue:work` ажиллаагүй бол ажил «queued» төлөвт
 * мөнхөд үлдэнэ: блок үүснэ, харин байршил ч, ажлын мөр ч үүсэхгүй. Урьд нь
 * дэлгэц үүнийг хязгааргүй хүлээдэг байсан тул «3,290 ажил үүсэхгүй байна»
 * гэсэн шалтгаан нь мэдэгдэхгүй гэмтэл болж харагддаг байв.
 */
const QUEUE_STALL_MS = 12_000;

/** Ажиллаж эхэлсэн ажлын дээд хугацаа — 3,290 мөр секундын дотор бөглөгдөнө. */
const JOB_TIMEOUT_MS = 180_000;

export default function NewBlockPage() {
  const router = useRouter();
  const qc = useQueryClient();

  /** `""` = загваргүй (хоосон) блок. */
  const [designId, setDesignId] = useState<string>("");
  const [floors, setFloors] = useState("16");
  const [unitsPerFloor, setUnitsPerFloor] = useState("9");
  const [purpose, setPurpose] = useState("Орон сууцны бүс");
  const [name, setName] = useState("");
  const [buildingNo, setBuildingNo] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [job, setJob] = useState<Job | null>(null);
  /** Ажил эхлэхгүй удаж байна уу — дараалал боловсруулагчийн шинж. */
  const [stalled, setStalled] = useState(false);

  const { project } = useProject();

  const designsQuery = useQuery({ queryKey: ["v2-designs"], queryFn: () => blockDesigns.list() });
  const designs = designsQuery.data?.data ?? [];
  const selected = designs.find((d) => d.id === designId) ?? null;

  const create = useMutation({
    mutationFn: async () => {
      // 1. Блок үүснэ — шуурхай.
      if (!project) throw new Error("Төсөл олдсонгүй.");

      const block = await blocks.create(project.id, {
        name: name.trim(),
        buildingNo: buildingNo.trim(),
        // Загваргүй бол хэмжээг гараар авна — байршил тэр дор нь үүснэ.
        designId: designId || undefined,
        purpose: designId ? undefined : purpose.trim(),
        floors: designId ? undefined : Number(floors),
        unitsPerFloor: designId ? undefined : Number(unitsPerFloor),
        startDate,
      });

      // Загваргүй бол ажил үүсгэхгүй — блокийн хуудаснаас нэмнэ.
      if (!designId) return block;

      // 2. Загвар буулгах ажил эхэлнэ — дуустал нь хянана.
      let current = await blockDesigns.apply(designId, { blockId: block.id, startDate });
      setJob(current);
      setStalled(false);

      const startedAt = Date.now();
      while (current.status === "running" || current.status === "queued") {
        const waited = Date.now() - startedAt;

        // Хэзээ ч эхлээгүй ажил — дараалал боловсруулагч ажиллахгүй байна.
        if (current.status === "queued" && waited > QUEUE_STALL_MS) setStalled(true);

        if (waited > JOB_TIMEOUT_MS) {
          throw new Error(
            current.status === "queued"
              ? "Ажил дараалалд орсон ч эхлээгүй байна. Сервер дээр дараалал " +
                  "боловсруулагч (queue worker) ажиллаж байгаа эсэхийг шалгана уу."
              : "Үүсгэлт хэт удаж байна. Серверийн лог шалгана уу.",
          );
        }

        await sleep(400);
        current = await jobs.get(current.id);
        setJob(current);
      }
      if (current.status === "failed") throw new Error(current.error ?? "Үүсгэлт амжилтгүй.");
      return block;
    },
    onSuccess: (block) => {
      qc.invalidateQueries({ queryKey: ["v2-blocks"] });
      toast.success(`${block.name} үүслээ`);
      router.push(`/blocks/${block.id}`);
    },
    onError: (e: Error) => {
      setJob(null);
      setStalled(false);
      // Урт мессеж toast-д багтахгүй тул хугацааг нь сунгана.
      toast.error(e.message, { duration: 15000 });
    },
  });

  const ready =
    Boolean(project && name.trim() && startDate) &&
    (Boolean(designId) || Number(floors) > 0) &&
    !create.isPending;

  return (
    <div>
      <PageHeader
        title="Шинэ блок үүсгэх"
        crumbs={[{ label: "Төслүүд", href: "/" }, { label: "Шинэ блок" }]}
        description="Стандарт загвараас хувилна, эсвэл хоосон үүсгээд загварыг дараа буулгана."
      />

      {designsQuery.isLoading ? (
        <LoadingRows rows={3} />
      ) : designsQuery.error ? (
        <ErrorState
          message={(designsQuery.error as Error).message}
          onRetry={() => designsQuery.refetch()}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section>
              <h2 className="mb-3 text-sm font-medium">1. Зураг төслийн загвар сонгох</h2>
              <div className="space-y-2">
                {designs.map((d) => (
                  <DesignOption
                    key={d.id}
                    design={d}
                    selected={designId === d.id}
                    disabled={create.isPending}
                    onSelect={() => {
                      setDesignId(d.id);
                      if (!name.trim()) setName(d.name);
                    }}
                  />
                ))}

                {/* 75 барилгыг бүгдийг нь одоо загвартай үүсгэвэл ~247,000
                    мөр төрнө. Эхэлж байгаа барилгад нь л ажил үүсгэх нь зөв. */}
                <button
                  type="button"
                  onClick={() => setDesignId("")}
                  disabled={create.isPending}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    designId === "" ? "border-primary bg-accent" : "hover:bg-accent/40",
                  )}
                >
                  <div className="font-medium">Загваргүй (хоосон блок)</div>
                  <p className="text-muted-foreground text-sm">
                    Давхар, айл нь үүснэ; ажил үүсэхгүй. Загварыг дараа буулгах эсвэл ажлаа гараар
                    нэмэх боломжтой.
                  </p>
                </button>
              </div>
            </section>

            {/* Загваргүй үед хэмжээг гараар авна — эс бөгөөс байршил үүсгэх
                мэдээлэлгүй болно. */}
            {designId === "" && (
              <section>
                <h2 className="mb-3 text-sm font-medium">Барилгын хэмжээ</h2>
                <Card>
                  <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
                    <FormField label="Давхрын тоо" required>
                      <Input
                        type="number"
                        min={1}
                        value={floors}
                        onChange={(e) => setFloors(e.target.value)}
                        disabled={create.isPending}
                      />
                    </FormField>
                    <FormField label="Давхарт байх айл" hint="0 бол айлгүй.">
                      <Input
                        type="number"
                        min={0}
                        value={unitsPerFloor}
                        onChange={(e) => setUnitsPerFloor(e.target.value)}
                        disabled={create.isPending}
                      />
                    </FormField>
                    <FormField label="Зориулалт">
                      <Input
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                        disabled={create.isPending}
                      />
                    </FormField>
                  </CardContent>
                </Card>
              </section>
            )}

            <section>
              <h2 className="mb-3 text-sm font-medium">2. Блокийн мэдээлэл</h2>
              <Card>
                <CardContent className="space-y-4 pt-6">
                  <FormField label="Блокийн нэр" required>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Б блок — 16 давхар орон сууц"
                      disabled={create.isPending}
                    />
                  </FormField>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Ерөнхий төлөвлөгөөний дугаар">
                      <Input
                        value={buildingNo}
                        onChange={(e) => setBuildingNo(e.target.value)}
                        placeholder="19"
                        disabled={create.isPending}
                      />
                    </FormField>
                    <FormField label="Эхлэх огноо" required hint="Ажлын огноо эндээс тооцогдоно.">
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        disabled={create.isPending}
                      />
                    </FormField>
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h2 className="text-sm font-medium">Юу үүсэх вэ</h2>
                {!selected ? (
                  <p className="text-muted-foreground text-sm">Загвар сонгоно уу.</p>
                ) : (
                  <>
                    <dl className="space-y-2 text-sm">
                      <Row label="Давхар" value={String(selected.floors)} />
                      <Row
                        label="Айл"
                        value={
                          selected.unitsPerFloor
                            ? `${selected.floors * selected.unitsPerFloor} (${selected.unitsPerFloor}/давхар)`
                            : "—"
                        }
                      />
                      <Row label="Ажлын төрөл" value={String(selected.workTypeCount)} />
                      <Row
                        label="Ажлын нэгж"
                        value={selected.estimatedItems.toLocaleString("mn-MN")}
                        strong
                      />
                    </dl>

                    {selected.missingQuantities > 0 && (
                      <div className="bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 flex gap-2 rounded-lg p-3 text-xs">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span>
                          {selected.missingQuantities} ажлын төрөлд тоо хэмжээ бүртгэгдээгүй.
                          Тэдгээрт үлдэгдэл ажил бодогдохгүй — захиалагчаас тоо хэмжээ авсны дараа
                          загвараа гүйцээнэ.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {job ? (
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {job.status === "completed" ? (
                      <Check className="size-4 text-emerald-600" />
                    ) : (
                      <Layers className="size-4 animate-pulse" />
                    )}
                    {job.status === "completed" ? "Үүсгэж дууслаа" : "Ажлын нэгж үүсгэж байна…"}
                  </div>
                  <ProgressBar value={job.total ? (job.progress / job.total) * 100 : 0} />
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {job.progress.toLocaleString("mn-MN")} / {job.total.toLocaleString("mn-MN")}
                  </p>

                  {/* Шалтгааныг НЭРЛЭНЭ. «Ачаалж байна…» гэж мөнхөд эргэлдэх нь
                      хэрэглэгчид хийх зүйл өгөхгүй. */}
                  {stalled && (
                    <div className="flex gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>
                        Ажил дараалалд орсон ч эхлээгүй байна. Сервер дээр{" "}
                        <strong>дараалал боловсруулагч</strong> (queue worker) ажиллахгүй байж
                        магадгүй. Системийн админд хандана уу.
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Button className="w-full" disabled={!ready} onClick={() => create.mutate()}>
                Блок үүсгэх
              </Button>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function DesignOption({
  design,
  selected,
  disabled,
  onSelect,
}: {
  design: BlockDesign;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      role="radio"
      aria-checked={selected}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "cursor-pointer p-4 transition-colors",
        selected ? "ring-primary ring-2" : "hover:bg-accent/40",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{design.name}</div>
          <div className="text-muted-foreground text-sm">{design.purpose}</div>
        </div>
        <div className="shrink-0 text-right">
          <ToneBadge tone={selected ? "blue" : "gray"}>
            {design.estimatedItems.toLocaleString("mn-MN")} ажил
          </ToneBadge>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong && "text-base font-semibold")}>{value}</dd>
    </div>
  );
}
