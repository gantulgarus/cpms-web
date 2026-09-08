"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { EnumSelect } from "@/components/enum-select";
import { FormDialog, FormField } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tasks, type DependencyType } from "@/lib/api";
import { DEPENDENCY_TYPE, DEPENDENCY_TYPE_OPTIONS } from "@/lib/domain";
import { loadProjectTasks, resolveProjectId } from "@/lib/project-tasks";

export function AddDependencyDialog({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [predecessorId, setPredecessorId] = useState("");
  const [type, setType] = useState<DependencyType>("FS");
  const [lag, setLag] = useState("");

  const candidates = useQuery({
    queryKey: ["projectTasks", taskId],
    enabled: open,
    queryFn: async () => {
      const projectId = await resolveProjectId(taskId);
      const all = await loadProjectTasks(projectId);
      return all.filter((t) => t.task.id !== taskId);
    },
  });

  const options = (candidates.data ?? []).map((c) => ({
    value: c.task.id,
    label: `${c.workPackageName} › ${c.activityName} › ${c.task.name}`,
  }));
  const selected = predecessorId || options[0]?.value || "";

  const add = useMutation({
    mutationFn: () =>
      tasks.addDependency(taskId, {
        predecessorTaskId: selected,
        dependencyType: type,
        lagDays: lag.trim() ? Number(lag) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dependencies", taskId] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
      toast.success("Хамаарал нэмэгдлээ");
      setOpen(false);
      setPredecessorId("");
      setLag("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Хамаарал
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Өмнөх даалгавар нэмэх"
        submitLabel="Нэмэх"
        submitDisabled={!selected}
        pending={add.isPending}
        onSubmit={() => add.mutate()}
      >
        <FormField label="Өмнөх даалгавар (Predecessor)" required hint="Энэ даалгавар нь successor болно.">
          {candidates.isLoading ? (
            <p className="text-muted-foreground text-sm">Төслийн даалгаврууд уншиж байна…</p>
          ) : options.length === 0 ? (
            <p className="text-muted-foreground text-sm">Өөр даалгавар алга.</p>
          ) : (
            <EnumSelect value={selected} onChange={setPredecessorId} options={options} />
          )}
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Төрөл">
            <EnumSelect
              value={type}
              onChange={(v: DependencyType) => setType(v)}
              options={DEPENDENCY_TYPE_OPTIONS.map((v) => ({ value: v, label: `${v} · ${DEPENDENCY_TYPE[v].full}` }))}
            />
          </FormField>
          <FormField label="Lag (хоног)">
            <Input type="number" value={lag} onChange={(e) => setLag(e.target.value)} placeholder="0" />
          </FormField>
        </div>
      </FormDialog>
    </>
  );
}
