"use client";

/**
 * Төслүүд — жагсаалт, идэвхтэй төсөл сонгох, шинэ төсөл үүсгэх.
 *
 * Бусад бүх дэлгэц (блок, дараалал, тайлан) ИДЭВХТЭЙ төслийн хүрээнд
 * ажилладаг. Сонголт нь хөтөч дээр санагдана.
 */
import { useState } from "react";
import { Check, Plus } from "lucide-react";

import { NewProjectDialog } from "@/components/new-project-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ProjectStatusBadge, ToneBadge } from "@/components/tone-badge";
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
import { useMe } from "@/lib/api/use-me";
import { useProject } from "@/lib/api/use-project";
import { formatDate } from "@/lib/domain";

export default function ProjectsPage() {
  const { me } = useMe();
  const { project: active, projects, select, isLoading, error } = useProject();
  const [creating, setCreating] = useState(false);

  const canCreate = Boolean(me?.canManageProjects);

  return (
    <div>
      <PageHeader
        title="Төслүүд"
        description="Блок, дараалал, тайлан нь идэвхтэй төслийн хүрээнд харагдана."
        actions={
          canCreate && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Шинэ төсөл
            </Button>
          )
        }
      />

      {error ? (
        <ErrorState message={(error as Error).message} />
      ) : isLoading ? (
        <LoadingRows rows={3} />
      ) : projects.length === 0 ? (
        <EmptyState
          title="Төсөл алга"
          description={
            canCreate
              ? "Эхний төслөө үүсгэнэ үү — блокууд төсөл дор үүснэ."
              : "Төсөл бүртгэгдээгүй байна. Системийн админд хандана уу."
          }
          action={
            canCreate && (
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" /> Шинэ төсөл
              </Button>
            )
          }
        />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Нэр</TableHead>
                <TableHead>Компани</TableHead>
                <TableHead>Байршил</TableHead>
                <TableHead>Хугацаа</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.code && <span className="text-muted-foreground ml-2 text-xs">{p.code}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.companyName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.location ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {p.startDate || p.endDate
                      ? `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <ProjectStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {active?.id === p.id ? (
                      <ToneBadge tone="green">
                        <Check className="size-3" /> Идэвхтэй
                      </ToneBadge>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => select(p.id)}>
                        Сонгох
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <NewProjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(p) => select(p.id)}
      />
    </div>
  );
}
