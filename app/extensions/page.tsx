"use client";

/**
 * Хугацаа сунгах хүсэлтийн дараалал.
 *
 * ЯАГААД ТУСДАА ДЭЛГЭЦ ВЭ: хүсэлт хаана ч харагдахгүй бол урсгал нь
 * байхгүйтэй адил. Гүйцэтгэгч хүсэлт илгээгээд хариу хүлээж, ерөнхий
 * инженер түүнийг хэзээ ч хардаггүй — тэгвэл хүн дахиад л утсаар
 * ярьж шийдэх бөгөөд баримт үлдэхгүй.
 *
 * Сунгалт нь зөвхөн `planned_end_date`-ийг хойшлуулна. `baselineEndDate`
 * хэвээр үлдэх тул хуваарийн гулсалт тайланд мөнх хадгалагдана.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CalendarClock, Check, X } from "lucide-react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { extensions } from "@/lib/api/v2/endpoints";
import type { ExtensionRequest, ExtensionStatus } from "@/lib/api/v2/types";
import { useMe } from "@/lib/api/v2/use-me";
import { useProject } from "@/lib/api/v2/use-project";
import { ISSUE_CATEGORIES } from "@/components/issue-panel";
import { formatDate } from "@/lib/domain";
import { cn } from "@/lib/utils";

const TABS: { value: ExtensionStatus; label: string }[] = [
  { value: "pending", label: "Хүлээгдэж буй" },
  { value: "approved", label: "Батлагдсан" },
  { value: "rejected", label: "Татгалзсан" },
];

const STATUS_TONE: Record<ExtensionStatus, "amber" | "green" | "red"> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
};

function categoryLabel(value: string): string {
  return ISSUE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export default function ExtensionRequestsPage() {
  const { me } = useMe();
  const { project } = useProject();
  const qc = useQueryClient();

  const [tab, setTab] = useState<ExtensionStatus>("pending");
  const [rejecting, setRejecting] = useState<ExtensionRequest | null>(null);
  const [note, setNote] = useState("");

  const list = useQuery({
    queryKey: ["v2-extensions", project?.id, tab],
    queryFn: () => extensions.list(project!.id, tab),
    enabled: Boolean(project),
    placeholderData: keepPreviousData,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["v2-extensions"] });
    qc.invalidateQueries({ queryKey: ["v2-work-items"] });
    qc.invalidateQueries({ queryKey: ["v2-queue"] });
    qc.invalidateQueries({ queryKey: ["v2-queue-counts"] });
    qc.invalidateQueries({ queryKey: ["v2-issues"] });
    qc.invalidateQueries({ queryKey: ["v2-dashboard"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => extensions.approve(id),
    onSuccess: () => {
      toast.success("Сунгалт батлагдлаа");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: () => extensions.reject(rejecting!.id, note.trim()),
    onSuccess: () => {
      toast.success("Татгалзлаа");
      setRejecting(null);
      setNote("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data ?? [];

  return (
    <div>
      <PageHeader
        title="Хугацаа сунгах хүсэлт"
        description="Сунгалт нь үндсэн төлөвлөгөөг хөндөхгүй — хуваарийн гулсалт тайланд үлдэнэ."
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              tab === t.value
                ? "bg-primary text-primary-foreground border-transparent"
                : "hover:bg-accent",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <LoadingRows rows={5} />
      ) : list.error ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Хүсэлт алга"
          description={
            tab === "pending"
              ? "Шийдвэр хүлээж буй сунгалт байхгүй."
              : "Энэ жагсаалтад хүсэлт алга."
          }
        />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ажил</TableHead>
                <TableHead>Шалтгаан</TableHead>
                <TableHead className="text-right">Огноо</TableHead>
                <TableHead className="text-right">Хүссэн</TableHead>
                <TableHead>Төлөв</TableHead>
                {me?.canApproveExtensions && tab === "pending" && <TableHead className="w-40" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/work-items/${r.workItemId}`} className="font-medium">
                      {r.workItemName ?? "—"}
                    </Link>
                    <div className="text-muted-foreground text-xs">{r.locationPath ?? ""}</div>
                  </TableCell>
                  <TableCell className="max-w-72">
                    <div className="text-xs font-medium">{categoryLabel(r.category)}</div>
                    <div className="text-muted-foreground text-xs">{r.reason}</div>
                    {r.decisionNote && (
                      <div className="text-muted-foreground mt-1 text-xs italic">
                        Шийдвэр: {r.decisionNote}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    <div className="text-muted-foreground">{formatDate(r.currentEndDate)}</div>
                    <div className="font-medium">→ {formatDate(r.requestedEndDate)}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Хоногийг СЕРВЕР бодно — дэлгэц огноо хасахгүй. */}
                    <ToneBadge tone={r.requestedDays > 14 ? "red" : "amber"}>
                      {r.requestedDays} хоног
                    </ToneBadge>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {r.requestedBy?.name ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={STATUS_TONE[r.status]}>
                      {TABS.find((t) => t.value === r.status)?.label ?? r.status}
                    </ToneBadge>
                    {r.decidedBy && (
                      <div className="text-muted-foreground mt-1 text-xs">
                        {r.decidedBy.name}
                      </div>
                    )}
                  </TableCell>
                  {me?.canApproveExtensions && tab === "pending" && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          onClick={() => approve.mutate(r.id)}
                          disabled={approve.isPending}
                        >
                          <Check className="size-3.5" /> Батлах
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejecting(r)}>
                          <X className="size-3.5" /> Татгалзах
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {!me?.canApproveExtensions && rows.length > 0 && tab === "pending" && (
        <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
          <CalendarClock className="size-3.5" />
          Сунгалтыг зөвхөн ерөнхий инженер, захирал батална.
        </p>
      )}

      {rejecting && (
        <FormDialog
          open
          onOpenChange={(open) => !open && setRejecting(null)}
          title="Сунгалтыг татгалзах"
          submitLabel="Татгалзах"
          submitDisabled={note.trim().length < 10}
          pending={reject.isPending}
          onSubmit={() => reject.mutate()}
        >
          <div className="bg-muted/50 rounded-md px-3 py-2 text-sm">
            <div className="font-medium">{rejecting.workItemName}</div>
            <div className="text-muted-foreground text-xs">
              {formatDate(rejecting.currentEndDate)} → {formatDate(rejecting.requestedEndDate)}
            </div>
          </div>

          {/* Шалтгаан ЗААВАЛ: «болохгүй» гэж орхивол хүсэгч юу засахаа
              мэдэхгүй, ижил хүсэлтийг дахин илгээнэ. */}
          <FormField label="Татгалзах шалтгаан" required hint="Дор хаяж 10 тэмдэгт.">
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Хүйтний улмаас гэж бичсэн ч тэр өдрүүдэд -5 хэм байсан."
            />
          </FormField>
        </FormDialog>
      )}
    </div>
  );
}
