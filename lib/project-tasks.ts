/**
 * Traverses a project's hierarchy (work packages → activities → tasks) and
 * returns a flat, labeled list of every task. Used by the "add dependency"
 * picker, where a predecessor can be any other task in the same project.
 *
 * There is no single "all tasks for a project" endpoint, so this fans out
 * across the nested list endpoints.
 */
import { activities, tasks, workPackages, type Task } from '@/lib/api';

export interface FlatTask {
  task: Task;
  workPackageName: string;
  activityName: string;
}

/** Resolve the owning projectId for a task by walking up the hierarchy. */
export async function resolveProjectId(taskId: string): Promise<string> {
  const task = await tasks.get(taskId);
  const activity = await activities.get(task.activityId);
  const wp = await workPackages.get(activity.workPackageId);
  return wp.projectId;
}

export async function loadProjectTasks(projectId: string): Promise<FlatTask[]> {
  const wps = await workPackages.listForProject(projectId, { pageSize: 200 });
  const result: FlatTask[] = [];

  for (const wp of wps.data) {
    const acts = await activities.listForWorkPackage(wp.id, { pageSize: 200 });
    for (const act of acts.data) {
      const ts = await tasks.listForActivity(act.id, { pageSize: 200 });
      for (const task of ts.data) {
        result.push({ task, workPackageName: wp.name, activityName: act.name });
      }
    }
  }
  return result;
}
