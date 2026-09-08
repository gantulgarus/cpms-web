/**
 * Progress rollups.
 *
 * The API's `status` field on work packages / activities / tasks is a static
 * value the console doesn't edit — completion is tracked through the append-only
 * progress history instead. So a work package whose tasks are all reported at
 * 100% would still show its stale `not_started` status.
 *
 * These helpers derive an effective status (and an average percentage) from the
 * latest reported progress of the underlying tasks, so lists reflect reality.
 * `on_hold` / `cancelled` are treated as explicit decisions and preserved.
 */
import { activities, tasks, workPackages, type WorkStatus } from "@/lib/api";
import { deriveReview } from "@/lib/approval";

export interface Rollup {
  /** Average of the latest reported percentage across the underlying tasks. */
  percentage: number;
  taskCount: number;
  status: WorkStatus;
}

export function deriveStatus(percentage: number, taskCount: number, fallback: WorkStatus): WorkStatus {
  if (fallback === "on_hold" || fallback === "cancelled") return fallback;
  if (taskCount === 0) return fallback;
  if (percentage >= 100) return "completed";
  if (percentage > 0) return "in_progress";
  return "not_started";
}

/** Latest reported percentage for a single task (0 when nothing reported). */
async function taskPercentage(taskId: string): Promise<number> {
  return deriveReview(await tasks.progress(taskId)).percentage ?? 0;
}

function summarize(percentages: number[], fallback: WorkStatus): Rollup {
  const taskCount = percentages.length;
  const percentage = taskCount
    ? Math.round(percentages.reduce((a, b) => a + b, 0) / taskCount)
    : 0;
  return { percentage, taskCount, status: deriveStatus(percentage, taskCount, fallback) };
}

/** Per-task rollup for an activity (each task keyed by its own derived status). */
export async function loadActivityRollup(activityId: string): Promise<Map<string, Rollup>> {
  const list = await tasks.listForActivity(activityId, { pageSize: 200 });
  const byTask = new Map<string, Rollup>();
  await Promise.all(
    list.data.map(async (t) => {
      const pct = await taskPercentage(t.id);
      byTask.set(t.id, { percentage: pct, taskCount: 1, status: deriveStatus(pct, 1, t.status) });
    }),
  );
  return byTask;
}

/** Per-activity rollup for a work package (aggregating each activity's tasks). */
export async function loadWorkPackageRollup(workPackageId: string): Promise<Map<string, Rollup>> {
  const acts = await activities.listForWorkPackage(workPackageId, { pageSize: 200 });
  const byActivity = new Map<string, Rollup>();
  await Promise.all(
    acts.data.map(async (act) => {
      const list = await tasks.listForActivity(act.id, { pageSize: 200 });
      const pcts = await Promise.all(list.data.map((t) => taskPercentage(t.id)));
      byActivity.set(act.id, summarize(pcts, act.status));
    }),
  );
  return byActivity;
}

/** Per-work-package rollup for a project (aggregating all tasks under each WP). */
export async function loadProjectRollup(projectId: string): Promise<Map<string, Rollup>> {
  const wps = await workPackages.listForProject(projectId, { pageSize: 200 });
  const byWorkPackage = new Map<string, Rollup>();
  await Promise.all(
    wps.data.map(async (wp) => {
      const acts = await activities.listForWorkPackage(wp.id, { pageSize: 200 });
      const taskLists = await Promise.all(
        acts.data.map((act) => tasks.listForActivity(act.id, { pageSize: 200 })),
      );
      const allTasks = taskLists.flatMap((t) => t.data);
      const pcts = await Promise.all(allTasks.map((t) => taskPercentage(t.id)));
      byWorkPackage.set(wp.id, summarize(pcts, wp.status));
    }),
  );
  return byWorkPackage;
}
