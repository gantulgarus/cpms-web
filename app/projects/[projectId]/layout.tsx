"use client";

/**
 * Shell for every project screen.
 *
 * The project header (name, status, key facts) and the tab bar live here, so
 * the child routes only render their own content. Tabs are real routes rather
 * than local state — deep links, refresh and the browser back button all work.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { ProjectStatusBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { projects } from "@/lib/api";
import { formatDate } from "@/lib/domain";
import { useRole } from "@/lib/role";
import { cn } from "@/lib/utils";

interface TabDef {
  /** Appended to `/projects/<id>`; "" is the overview. */
  segment: string;
  label: string;
  hint: string;
  directorOnly?: boolean;
}

const TABS: TabDef[] = [
  { segment: "", label: "Тойм", hint: "Ерөнхий явц" },
  { segment: "/work-packages", label: "Ажлын бүтэц", hint: "Багц → үйл ажиллагаа → даалгавар" },
  { segment: "/schedule", label: "Хуваарь", hint: "Хугацаа, чухал зам" },
  { segment: "/review", label: "Гүйцэтгэл", hint: "Гүйцэтгэгчээр", directorOnly: true },
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { isDirector } = useRole();

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.get(projectId),
  });

  const remove = useMutation({
    mutationFn: () => projects.remove(projectId),
    onSuccess: () => {
      toast.success("Төсөл устгагдлаа");
      const companyId = projectQuery.data?.companyId;
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["all-projects"] });
      router.push(companyId ? `/companies/${companyId}` : "/");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (projectQuery.isLoading) return <LoadingRows />;
  if (projectQuery.error)
    return (
      <ErrorState
        message={(projectQuery.error as Error).message}
        onRetry={() => projectQuery.refetch()}
      />
    );

  const project = projectQuery.data;
  if (!project) return null;

  const base = `/projects/${projectId}`;
  const tabs = TABS.filter((t) => !t.directorOnly || isDirector);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {project.name} <ProjectStatusBadge status={project.status} />
          </span>
        }
        crumbs={[{ label: "Төслүүд", href: "/" }, { label: project.name }]}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {project.code && <span>Код: {project.code}</span>}
            {project.location && <span>{project.location}</span>}
            <span>
              {formatDate(project.startDate)} — {formatDate(project.endDate)}
            </span>
          </span>
        }
        actions={
          isDirector && (
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm("Төслийг устгах уу? Доорх бүх бүтэц устана.")) remove.mutate();
              }}
            >
              <Trash2 className="size-4" /> Төсөл устгах
            </Button>
          )
        }
      />

      {project.description && (
        <Card className="mb-6" size="sm">
          <CardContent className="text-muted-foreground text-sm">{project.description}</CardContent>
        </Card>
      )}

      <nav
        aria-label="Төслийн хэсгүүд"
        className="mb-6 -mx-4 flex gap-1 overflow-x-auto border-b px-4"
      >
        {tabs.map((tab) => {
          const href = `${base}${tab.segment}`;
          const active = tab.segment === "" ? pathname === base : pathname.startsWith(href);
          return (
            <Link
              key={tab.segment || "overview"}
              href={href}
              aria-current={active ? "page" : undefined}
              title={tab.hint}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
