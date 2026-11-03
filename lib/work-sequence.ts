import type { Location, WorkItem, WorkTypeGroup } from "./api/types";

/** Group order is the configured technology order; dates are only a tie-breaker. */
export function sortWorkSequence(items: WorkItem[], groups: WorkTypeGroup[], locations: Location[]) {
  const ranks = new Map(groups.map((g) => [g.name, g.sequenceNumber]));
  const byLocation = new Map(locations.map((l) => [l.id, l]));
  const floorRank = (item: WorkItem) => {
    let location = byLocation.get(item.locationId);
    const visited = new Set<string>();
    while (location && !visited.has(location.id)) {
      if (location.level === "floor" || location.level === "block") return location.sequenceNumber;
      visited.add(location.id);
      location = location.parentId ? byLocation.get(location.parentId) : undefined;
    }
    return Number.MAX_SAFE_INTEGER;
  };
  return [...items].sort((a, b) =>
    (ranks.get(a.workType.groupName) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.workType.groupName) ?? Number.MAX_SAFE_INTEGER)
    || a.workType.groupName.localeCompare(b.workType.groupName)
    || floorRank(a) - floorRank(b)
    || (a.plannedStartDate || "9999").localeCompare(b.plannedStartDate || "9999")
    || a.location.path.localeCompare(b.location.path)
    || a.workType.name.localeCompare(b.workType.name) || a.id.localeCompare(b.id));
}
