"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { NewCompanyDialog } from "@/components/dialogs/new-company-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { companies } from "@/lib/api";
import { useRole } from "@/lib/role";

export default function CompaniesPage() {
  const { isAdmin } = useRole();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["companies"],
    queryFn: () => companies.list({ pageSize: 100 }),
  });

  return (
    <div>
      <PageHeader
        title="Компаниуд"
        description="Барилгын компаниуд ба тэдгээрийн төслүүд"
        actions={isAdmin && <NewCompanyDialog />}
      />

      {isLoading ? (
        <LoadingRows />
      ) : error ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="Компани алга"
          description="Эхний компаниа үүсгэж төсөл төлөвлөж эхэлнэ үү."
        />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Нэр</TableHead>
                <TableHead>Регистр</TableHead>
                <TableHead>Холбоо барих</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/companies/${c.id}`} className="block">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.registrationNumber ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.email ?? c.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/companies/${c.id}`}>
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
