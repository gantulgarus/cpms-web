"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ProjectStatusBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contractors } from "@/lib/api";
import { useRole } from "@/lib/role";

export default function ContractorDetailPage() {
  const { contractorId } = useParams<{ contractorId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isDirector } = useRole();

  const contractorQuery = useQuery({
    queryKey: ["contractor", contractorId],
    queryFn: () => contractors.get(contractorId),
  });
  const projectsQuery = useQuery({
    queryKey: ["contractorProjects", contractorId],
    queryFn: () => contractors.projects(contractorId),
  });

  const remove = useMutation({
    mutationFn: () => contractors.remove(contractorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contractors"] });
      toast.success("Гүйцэтгэгч устгагдлаа");
      router.push("/contractors");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = contractorQuery.data;
  if (contractorQuery.isLoading) return <LoadingRows />;
  if (contractorQuery.error)
    return <ErrorState message={(contractorQuery.error as Error).message} onRetry={() => contractorQuery.refetch()} />;
  if (!c) return null;

  return (
    <div>
      <PageHeader
        title={c.name}
        crumbs={[{ label: "Гүйцэтгэгчид", href: "/contractors" }, { label: c.name }]}
        actions={
          isDirector && (
            <Button
              variant="outline"
              onClick={() => {
                if (confirm("Гүйцэтгэгчийг устгах уу?")) remove.mutate();
              }}
            >
              Устгах
            </Button>
          )
        }
      />

      <Card className="mb-6">
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 pt-6 text-sm sm:grid-cols-3">
          <Detail label="Компани" value={c.companyName} />
          <Detail label="Чиглэл" value={c.tradeSpecialty} />
          <Detail label="Холбоо барих хүн" value={c.contactPerson} />
          <Detail label="Утас" value={c.phone} />
          <Detail label="Имэйл" value={c.email} />
        </CardContent>
      </Card>

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Оролцож буй төслүүд</h2>
      {projectsQuery.isLoading ? (
        <LoadingRows rows={2} />
      ) : !projectsQuery.data || projectsQuery.data.length === 0 ? (
        <EmptyState title="Төсөлд хариуцаагүй байна" />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Нэр</TableHead>
                <TableHead>Код</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectsQuery.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/projects/${p.id}`}>{p.name}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.code ?? "—"}</TableCell>
                  <TableCell>
                    <ProjectStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/projects/${p.id}`}>
                      <ChevronRight className="text-muted-foreground size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div>{value || "—"}</div>
    </div>
  );
}
