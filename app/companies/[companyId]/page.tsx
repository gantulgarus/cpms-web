"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { EditCompanyDialog } from "@/components/dialogs/edit-company-dialog";
import { NewProjectDialog } from "@/components/dialogs/new-project-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ProjectStatusBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { companies, projects } from "@/lib/api";
import { useRole } from "@/lib/role";

export default function CompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAdmin } = useRole();

  const companyQuery = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => companies.get(companyId),
  });
  const projectsQuery = useQuery({
    queryKey: ["projects", companyId],
    queryFn: () => projects.listForCompany(companyId, { pageSize: 100 }),
  });

  const remove = useMutation({
    mutationFn: () => companies.remove(companyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Компани устгагдлаа");
      router.push("/companies");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const company = companyQuery.data;

  if (companyQuery.isLoading) return <LoadingRows />;
  if (companyQuery.error)
    return <ErrorState message={(companyQuery.error as Error).message} onRetry={() => companyQuery.refetch()} />;
  if (!company) return null;

  return (
    <div>
      <PageHeader
        title={company.name}
        crumbs={[{ label: "Компаниуд", href: "/companies" }, { label: company.name }]}
        actions={
          isAdmin && (
            <>
              <NewProjectDialog companyId={companyId} />
              <EditCompanyDialog company={company} />
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm("Компанийг устгах уу? Бүх төсөл, доорх бүтэц устана.")) remove.mutate();
                }}
              >
                Устгах
              </Button>
            </>
          )
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Дэлгэрэнгүй</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
          <Detail label="Регистр" value={company.registrationNumber} />
          <Detail label="Утас" value={company.phone} />
          <Detail label="Имэйл" value={company.email} />
          <Detail label="Хаяг" value={company.address} />
        </CardContent>
      </Card>

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Төслүүд</h2>
      {projectsQuery.isLoading ? (
        <LoadingRows rows={2} />
      ) : !projectsQuery.data || projectsQuery.data.data.length === 0 ? (
        <EmptyState title="Төсөл алга" description="Энэ компанид төсөл нэмээгүй байна." />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Нэр</TableHead>
                <TableHead>Код</TableHead>
                <TableHead>Байршил</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectsQuery.data.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/projects/${p.id}`}>{p.name}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.code ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.location ?? "—"}</TableCell>
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
