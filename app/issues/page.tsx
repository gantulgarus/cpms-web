"use client";

/**
 * Саатлын бүртгэл — төслийн хэмжээнд нэг жагсаалт.
 *
 * ЯАГААД ТУСДАА ХУУДАС ВЭ: хянах самбар нь «материал дутсанаас 12» гэж
 * хэлдэг ч тэр 12 нь ХААНА байгааг хэлдэггүй. Нэг барилга дээр овоорсон бол
 * тэр объектын логистик, 12 барилгад тарсан бол ханган нийлүүлэлт — өөр өөр
 * шийдэл. Ажлын мөр бүрийг нэгжиж байж мэдэх боломжтой байсан нь 3,290
 * мөрийн блокт бодит бус.
 *
 * Хянах самбарын багана энд `?category=…` гэж авчирна.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AlertOctagon, Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { ISSUE_CATEGORIES } from "@/components/issue-panel";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { blocks, issues } from "@/lib/api/v2/endpoints";
import type { Issue, Uuid } from "@/lib/api/v2/types";
import { useMe } from "@/lib/api/v2/use-me";
import { useProject } from "@/lib/api/v2/use-project";
import { formatDateTime } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Анхдагч нь НЭЭЛТТЭЙ.
 *
 * Шийдэгдсэн саатал бол түүх — өдөр тутам хардаг зүйл биш. Бүгдийг нь
 * холиод харуулбал жагсаалт нь урт болж, ажлын утга нь алга болно.
 */
const STATUSES = [
  { value: "open", label: "Нээлттэй" },
  { value: "resolved", label: "Шийдэгдсэн" },
  { value: "", label: "Бүгд" },
];

const SEVERITY_LABEL: Record<Issue["severity"], string> = {
  low: "Бага",
  medium: "Дунд",
  high: "Өндөр",
};

/** `useSearchParams` статик рендерийг зогсоодог тул Suspense заавал. */
export default function IssuesPage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <IssuesContent />
    </Suspense>
  );
}

function IssuesContent() {
  const qc = useQueryClient();
  const { me } = useMe();
  const { project } = useProject();
  const projectId = project?.id;

  const params = useSearchParams();
  const fromDashboard = params.get("category");

  const [status, setStatus] = useState("open");
  const [category, setCategory] = useState(
    ISSUE_CATEGORIES.some((c) => c.value === fromDashboard) ? fromDashboard! : "",
  );
  const [blockId, setBlockId] = useState("");

  const blockList = useQuery({
    queryKey: ["v2-blocks", projectId],
    queryFn: () => blocks.listForProject(projectId!),
    enabled: Boolean(projectId),
  });

  const list = useQuery({
    queryKey: ["v2-issues", projectId, status, category, blockId],
    queryFn: () =>
      issues.forProject(projectId!, {
        status: status || undefined,
        category: category || undefined,
        blockId: blockId || undefined,
      }),
    enabled: Boolean(projectId),
  });

  const resolve = useMutation({
    mutationFn: (id: Uuid) => issues.resolve(id),
    onSuccess: () => {
      toast.success("Шийдвэрлэсэн гэж тэмдэглэлээ");
      qc.invalidateQueries({ queryKey: ["v2-issues"] });
      // Хянах самбарын тоо мөн өөрчлөгдөнө.
      qc.invalidateQueries({ queryKey: ["v2-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data?.data ?? [];
  const filtered = Boolean(category || blockId) || status !== "open";

  return (
    <div>
      <PageHeader
        title="Саатлын бүртгэл"
        description="Ажил яагаад хойшилсныг тайлбарласан бүртгэлүүд. Шалтгааныг мэдэхгүйгээр хоцролтыг засах боломжгүй."
      />

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <Filter label="Төлөв" value={status} onChange={setStatus} options={STATUSES} />
          <Filter
            label="Ангилал"
            value={category}
            onChange={setCategory}
            options={[{ value: "", label: "Бүх ангилал" }, ...ISSUE_CATEGORIES]}
          />
          <Filter
            label="Барилга"
            value={blockId}
            onChange={setBlockId}
            options={[
              { value: "", label: "Бүх барилга" },
              ...(blockList.data?.data ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        </div>
      </Card>

      {list.isLoading ? (
        <LoadingRows rows={6} />
      ) : list.error ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={status === "open" ? "Нээлттэй саатал алга" : "Бүртгэл олдсонгүй"}
          description={
            filtered
              ? "Шүүлтүүрээ өөрчилж үзнэ үү."
              : "Ажил хойшилсон бол ажлын мөр дээр шалтгааныг нь бүртгэнэ үү — хугацаа сунгахад автоматаар үүснэ."
          }
        />
      ) : (
        <>
          <p className="text-muted-foreground mb-2 text-xs">{rows.length} бүртгэл</p>
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Шалтгаан</TableHead>
                  <TableHead>Ажил</TableHead>
                  <TableHead>Байршил</TableHead>
                  <TableHead>Бүртгэсэн</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((i) => (
                  <TableRow key={i.id} className={cn(i.status === "resolved" && "opacity-60")}>
                    <TableCell className="align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{i.categoryLabel}</span>
                        {i.status === "resolved" ? (
                          <ToneBadge tone="green">Шийдэгдсэн</ToneBadge>
                        ) : i.severity === "high" ? (
                          <ToneBadge tone="red">{SEVERITY_LABEL.high}</ToneBadge>
                        ) : null}
                      </div>
                      {/* Тайлбар нь мөрийн ХАМГИЙН чухал хэсэг — «материал
                          дутсан» гэдэг ангилал өөрөө юу ч хэлэхгүй. */}
                      <p className="text-muted-foreground mt-0.5 max-w-md text-xs break-words">
                        {i.description}
                      </p>
                    </TableCell>
                    <TableCell className="align-top">
                      <Link href={`/work-items/${i.workItemId}`} className="hover:underline">
                        {i.workItemName ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground align-top text-sm">
                      {i.blockName && <div>{i.blockName}</div>}
                      <div className="text-xs">{i.locationPath ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground align-top text-sm">
                      {i.reportedBy ?? "—"}
                      <div className="text-xs">{formatDateTime(i.createdAt)}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex items-center justify-end gap-1">
                        {i.status === "open" && me?.canInspect && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resolve.isPending}
                            onClick={() => resolve.mutate(i.id)}
                            title="Шийдвэрлэсэн гэж тэмдэглэх"
                          >
                            <Check className="size-3.5" /> Шийдсэн
                          </Button>
                        )}
                        <Link href={`/work-items/${i.workItemId}`} aria-label="Ажлын дэлгэрэнгүй">
                          <ChevronRight className="text-muted-foreground size-4" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <p className="text-muted-foreground mt-4 flex items-start gap-1.5 text-xs">
        <AlertOctagon className="mt-0.5 size-3.5 shrink-0" />
        Хугацаа сунгах бүрт шалтгаан нь энд автоматаар бүртгэгдэнэ. Тиймээс «хэдэн ажил хэдэн
        хоногоор, ямар шалтгаанаар хойшилсон» гэдгийг хожим тоолж болно.
      </p>
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 block text-xs">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
