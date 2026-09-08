"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { activities, contractors } from "@/lib/api";

export function AssignContractorDialog({
  activityId,
  assignedIds,
}: {
  activityId: string;
  assignedIds: Set<string>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const all = useQuery({
    queryKey: ["contractors"],
    queryFn: () => contractors.list({ pageSize: 200 }),
    enabled: open,
  });

  const assign = useMutation({
    mutationFn: (contractorId: string) => activities.assignContractor(activityId, contractorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activityContractors", activityId] });
      toast.success("Гүйцэтгэгч хариуцууллаа");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const available = (all.data?.data ?? []).filter((c) => !assignedIds.has(c.id));

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Хариуцуулах
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Гүйцэтгэгч хариуцуулах</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {all.isLoading ? (
              <p className="text-muted-foreground text-sm">Уншиж байна…</p>
            ) : available.length === 0 ? (
              <p className="text-muted-foreground text-sm">Хариуцуулах боломжтой гүйцэтгэгч алга.</p>
            ) : (
              available.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={assign.isPending}
                  onClick={() => assign.mutate(c.id)}
                  className="hover:bg-muted flex w-full flex-col items-start rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50"
                >
                  <span className="font-medium">{c.name}</span>
                  {(c.tradeSpecialty || c.companyName) && (
                    <span className="text-muted-foreground text-xs">{c.tradeSpecialty ?? c.companyName}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
