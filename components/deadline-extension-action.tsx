"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Clock } from "lucide-react";

import { ExtendDeadlineDialog } from "@/components/extend-deadline-dialog";
import { Button } from "@/components/ui/button";
import type { ExtensionRequest, WorkItem } from "@/lib/api/types";
import { formatDate } from "@/lib/domain";

/** The caller fetches pending requests once for its list, never once per row. */
export function DeadlineExtensionAction({ item, canRequest, canApprove, pending, loading, error, onRetry, onDone }: {
  item: Pick<WorkItem, "id" | "name" | "plannedEndDate" | "overdueDays" | "status">;
  canRequest: boolean;
  canApprove: boolean;
  pending?: ExtensionRequest | null;
  loading: boolean;
  error: boolean;
  onRetry?: () => void;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!canRequest || item.overdueDays <= 0 || item.status === "completed") return null;

  if (error) return <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Сунгалтын хүсэлтийн төлөвийг авч чадсангүй.</span>{onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Дахин шалгах</Button>}</div>;
  if (pending) return (
    <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm" role="status">
      <p className="flex items-center gap-1.5 font-medium"><Clock className="size-4 shrink-0" aria-hidden="true" />Сунгалтын хүсэлт хүлээгдэж байна</p>
      <p className="text-muted-foreground text-xs">Хүссэн огноо: {formatDate(pending.requestedEndDate)} · Батлагдах хүртэл одоогийн хугацаа хэвээр.</p>
      <Link href="/extensions" className="text-primary inline-block text-xs hover:underline">Сунгалтын хүсэлтүүдийг харах →</Link>
    </div>
  );

  if (loading) return <p className="text-muted-foreground text-xs" role="status">Сунгалтын хүсэлт байгаа эсэхийг шалгаж байна…</p>;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" />{canApprove ? "Хугацаа сунгах" : "Сунгалт хүсэх"}
      </Button>
      <ExtendDeadlineDialog
        key={item.id}
        workItemId={item.id}
        workItemName={item.name}
        currentEndDate={item.plannedEndDate}
        overdueDays={item.overdueDays}
        open={open}
        onOpenChange={setOpen}
        onDone={onDone}
      />
    </>
  );
}
