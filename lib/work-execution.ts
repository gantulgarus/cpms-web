import type { Location, WorkItem } from "./api/types";

export interface WorkExecutionPlan {
  order: string[];
  predecessors: Record<string, string[]>;
  version: string;
  hasOrder: boolean;
}

export interface WorkDependencyLink {
  workItemId: string;
  predecessorIds: string[];
}

/** Return null for a cycle. Original order breaks ties between independent work. */
export function orderWorkDependencies(order: string[], predecessors: Record<string, string[]>): string[] | null {
  const waiting = new Map<string, number>();
  const followers = new Map<string, string[]>();
  const rank = new Map(order.map((id, index) => [id, index]));
  for (const id of order) {
    const previous = predecessors[id] ?? [];
    if (previous.some((previousId) => !rank.has(previousId))) return null;
    waiting.set(id, previous.length);
    for (const previousId of previous) followers.set(previousId, [...(followers.get(previousId) ?? []), id]);
  }
  const ready = order.filter((id) => waiting.get(id) === 0);
  const result: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    result.push(id);
    for (const next of followers.get(id) ?? []) {
      const count = waiting.get(next)! - 1;
      waiting.set(next, count);
      if (count === 0) {
        const position = ready.findIndex((candidate) => rank.get(candidate)! > rank.get(next)!);
        ready.splice(position === -1 ? ready.length : position, 0, next);
      }
    }
  }
  return result.length === order.length ? result : null;
}

export function workHasFinished(work: WorkItem): boolean {
  return Boolean(work.actualEndDate || work.status === "completed");
}

export function executionState(work: WorkItem, previous: WorkItem[]): string {
  if (work.status === "cancelled") return "Цуцлагдсан";
  if (workHasFinished(work)) return "Дууссан";
  if (work.status === "on_hold") return "Түр зогссон";
  if (work.actualStartDate || work.reportedQty > 0 || work.status === "in_progress") return "Хийгдэж байна";
  if (previous.some((item) => !workHasFinished(item))) return "Өмнөх ажил хүлээж буй";
  return previous.length ? "Өмнөх ажлууд дууссан" : "Өмнөх ажил тохируулаагүй";
}

export function locationAncestors(id: string, locations: Location[]): string[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const result: string[] = [];
  let current: string | null | undefined = id;
  while (current && !result.includes(current)) {
    result.push(current);
    current = byId.get(current)?.parentId;
  }
  return result;
}

/** Replicate a link only where the same type has exactly one matching work. */
export function matchDependencyLocations(
  anchor: WorkItem,
  predecessorIds: string[],
  targetIds: string[],
  works: WorkItem[],
  locations: Location[],
): { links: WorkDependencyLink[]; missing: string[] } {
  const byId = new Map(works.map((work) => [work.id, work]));
  const byLocation = new Map(locations.map((location) => [location.id, location]));
  const anchorAncestors = locationAncestors(anchor.locationId, locations);
  const links: WorkDependencyLink[] = [];
  const missing: string[] = [];
  for (const targetId of targetIds) {
    const target = byId.get(targetId);
    if (!target || target.workTypeId !== anchor.workTypeId) {
      missing.push("Сонгосон ажил олдсонгүй.");
      continue;
    }
    const mapped: string[] = [];
    for (const previousId of predecessorIds) {
      const previous = byId.get(previousId);
      if (target.id === anchor.id && previous) {
        mapped.push(previous.id);
        continue;
      }
      if (!previous || !anchorAncestors.includes(previous.locationId)) {
        missing.push(`${target.location.path} — өмнөх ажлыг тухайн эсвэл дээд байршлаас сонгоно уу.`);
        continue;
      }
      const matchingLocation = locationAncestors(target.locationId, locations)
        .find((id) => byLocation.get(id)?.level === previous.location.level);
      const candidates = works.filter((work) => work.workTypeId === previous.workTypeId && work.locationId === matchingLocation && work.id !== target.id);
      if (candidates.length !== 1) {
        missing.push(`${target.location.path} — «${previous.workType.name}» ажил нэг утгатай таарсангүй.`);
        continue;
      }
      mapped.push(candidates[0].id);
    }
    links.push({ workItemId: target.id, predecessorIds: [...new Set(mapped)] });
  }
  return { links, missing: [...new Set(missing)] };
}
