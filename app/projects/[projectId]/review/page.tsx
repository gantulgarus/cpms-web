"use client";

/** Performance tab — reported progress grouped by contractor (header/tabs from the layout). */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ReviewStateBadge } from "@/components/tone-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadProjectReview, type ContractorGroup } from "@/lib/review";

export default function ReviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const query = useQuery({
    queryKey: ["review", projectId],
    queryFn: () => loadProjectReview(projectId),
  });
  const data = query.data;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Туслан гүйцэтгэгч тус бүрийн мэдээлсэн явц. Даалгавар дээр дарж батлах эсвэл засварт буцаана.
      </p>

      {query.isLoading ? (
        <LoadingRows />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : !data || data.totalTasks === 0 ? (
        <EmptyState
          title="Хянах өгөгдөл алга"
          description="Энэ төсөлд даалгавар эсвэл хариуцах гүйцэтгэгч бүртгэгдээгүй байна."
        />
      ) : (
        <div className="space-y-6">
          {data.groups.map((group, i) => (
            <ContractorSection key={group.contractor?.id ?? `unassigned-${i}`} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContractorSection({ group }: { group: ContractorGroup }) {
  return (
    <Card className="p-0">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 border-b">
        <CardTitle className="text-base">
          {group.contractor?.name ?? "Хариуцагчгүй даалгавар"}
          {group.contractor?.tradeSpecialty && (
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {group.contractor.tradeSpecialty}
            </span>
          )}
        </CardTitle>
        <div className="text-muted-foreground text-sm">
          {group.avgPercentage}% · {group.taskCount} даалгавар
          {group.pendingCount > 0 && ` · ${group.pendingCount} хүлээгдэж буй`}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Даалгавар</TableHead>
              <TableHead>Байршил</TableHead>
              <TableHead className="text-right">Мэдээлсэн</TableHead>
              <TableHead>Төлөв</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.entries.map((e) => (
              <TableRow key={e.task.id}>
                <TableCell className="font-medium">
                  <Link href={`/tasks/${e.task.id}`}>{e.task.name}</Link>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {e.workPackageName} › {e.activityName}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.review.percentage != null ? `${e.review.percentage}%` : "—"}
                </TableCell>
                <TableCell>
                  <ReviewStateBadge state={e.review.state} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
