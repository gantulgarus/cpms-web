"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ProjectStatusBadge } from "@/components/tone-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SHOW_V2_UI } from "@/lib/config";
import { loadAllProjects } from "@/lib/projects-overview";

export default function ProjectsHomePage() {
  const router = useRouter();

  // v2 горимд нүүр хуудас нь хянах самбар. v1-ийн /companies дуудлага шинэ
  // backend дээр байхгүй тул энд үлдэх нь алдаа заана.
  useEffect(() => {
    if (SHOW_V2_UI) router.replace("/dashboard");
  }, [router]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["all-projects"],
    queryFn: loadAllProjects,
    enabled: !SHOW_V2_UI,
  });

  if (SHOW_V2_UI) return null;

  return (
    <div>
      <PageHeader
        title="Төслүүд"
        description="Бүх төслийн жагсаалт — явцыг харахын тулд төсөл дээр дарна уу."
      />

      {isLoading ? (
        <LoadingRows />
      ) : error ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState title="Төсөл алга" description="Одоогоор бүртгэгдсэн төсөл байхгүй байна." />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Нэр</TableHead>
                <TableHead>Компани</TableHead>
                <TableHead>Байршил</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(({ project, companyName }) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">
                    <Link href={`/projects/${project.id}`}>{project.name}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{companyName}</TableCell>
                  <TableCell className="text-muted-foreground">{project.location ?? "—"}</TableCell>
                  <TableCell>
                    <ProjectStatusBadge status={project.status} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/projects/${project.id}`}>
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
