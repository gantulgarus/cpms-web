/**
 * Project-wide performance review for the Director dashboard.
 *
 * Walks the project hierarchy and, for every task, derives its reported
 * percentage and approval state from progress history. Results are grouped by
 * the contractor responsible for the owning activity (a task can belong to
 * several contractors, or none → "unassigned").
 *
 * This fans out across the nested list endpoints plus one progress call per
 * task; fine for typical project sizes.
 */
import { activities, tasks, workPackages, type Contractor, type Task } from '@/lib/api';
import { deriveReview, type Review } from '@/lib/approval';

export interface TaskReviewEntry {
  task: Task;
  workPackageName: string;
  activityName: string;
  review: Review;
}

export interface ContractorGroup {
  /** null = tasks whose activity has no contractor assigned. */
  contractor: Contractor | null;
  entries: TaskReviewEntry[];
  taskCount: number;
  avgPercentage: number;
  pendingCount: number;
  approvedCount: number;
}

export interface ProjectReview {
  groups: ContractorGroup[];
  totalTasks: number;
  avgPercentage: number;
  pendingCount: number;
  approvedCount: number;
}

function summarize(contractor: Contractor | null, entries: TaskReviewEntry[]): ContractorGroup {
  const taskCount = entries.length;
  const sum = entries.reduce((acc, e) => acc + (e.review.percentage ?? 0), 0);
  return {
    contractor,
    entries,
    taskCount,
    avgPercentage: taskCount ? Math.round(sum / taskCount) : 0,
    pendingCount: entries.filter((e) => e.review.state === 'pending').length,
    approvedCount: entries.filter((e) => e.review.state === 'approved').length,
  };
}

export async function loadProjectReview(projectId: string): Promise<ProjectReview> {
  const wps = await workPackages.listForProject(projectId, { pageSize: 200 });

  const activityRefs = (
    await Promise.all(
      wps.data.map(async (wp) => {
        const acts = await activities.listForWorkPackage(wp.id, { pageSize: 200 });
        return acts.data.map((act) => ({ wp, act }));
      }),
    )
  ).flat();

  const perActivity = await Promise.all(
    activityRefs.map(async ({ wp, act }) => {
      const [assigned, taskList] = await Promise.all([
        activities.listContractors(act.id),
        tasks.listForActivity(act.id, { pageSize: 200 }),
      ]);
      const entries: TaskReviewEntry[] = await Promise.all(
        taskList.data.map(async (task) => ({
          task,
          workPackageName: wp.name,
          activityName: act.name,
          review: deriveReview(await tasks.progress(task.id)),
        })),
      );
      return { contractors: assigned.map((a) => a.contractor), entries };
    }),
  );

  // Group by contractor.
  const groupMap = new Map<string, { contractor: Contractor; entries: TaskReviewEntry[] }>();
  const unassigned: TaskReviewEntry[] = [];

  for (const { contractors, entries } of perActivity) {
    if (contractors.length === 0) {
      unassigned.push(...entries);
      continue;
    }
    for (const c of contractors) {
      const existing = groupMap.get(c.id);
      if (existing) existing.entries.push(...entries);
      else groupMap.set(c.id, { contractor: c, entries: [...entries] });
    }
  }

  const groups = [...groupMap.values()]
    .map((g) => summarize(g.contractor, g.entries))
    .sort((a, b) => (a.contractor?.name ?? '').localeCompare(b.contractor?.name ?? ''));
  if (unassigned.length) groups.push(summarize(null, unassigned));

  // Project totals over distinct tasks (a task may be counted in several groups).
  const distinct = new Map<string, TaskReviewEntry>();
  for (const { entries } of perActivity) for (const e of entries) distinct.set(e.task.id, e);
  const all = [...distinct.values()];
  const sum = all.reduce((acc, e) => acc + (e.review.percentage ?? 0), 0);

  return {
    groups,
    totalTasks: all.length,
    avgPercentage: all.length ? Math.round(sum / all.length) : 0,
    pendingCount: all.filter((e) => e.review.state === 'pending').length,
    approvedCount: all.filter((e) => e.review.state === 'approved').length,
  };
}
