"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { NewContractorDialog } from "@/components/dialogs/new-contractor-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contractors } from "@/lib/api";
import { useRole } from "@/lib/role";

export default function ContractorsPage() {
  const { isDirector } = useRole();
  const query = useQuery({ queryKey: ["contractors"], queryFn: () => contractors.list({ pageSize: 200 }) });

  return (
    <div>
      <PageHeader
        title="Гүйцэтгэгчид"
        description="Туслан гүйцэтгэгчид — олон төсөлд хариуцагдаж болно"
        actions={isDirector && <NewContractorDialog />}
      />

      {query.isLoading ? (
        <LoadingRows />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : !query.data || query.data.data.length === 0 ? (
        <EmptyState title="Гүйцэтгэгч алга" description="Эхний гүйцэтгэгчээ үүсгэнэ үү." />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Нэр</TableHead>
                <TableHead>Чиглэл</TableHead>
                <TableHead>Холбоо барих</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`/contractors/${c.id}`}>{c.name}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.tradeSpecialty ?? c.companyName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? c.email ?? "—"}</TableCell>
                  <TableCell>
                    <Link href={`/contractors/${c.id}`}>
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
