import type { Location, WorkCatalogEntry, WorkItem } from "./api/types";

export function matchesWorkSearch(item: WorkItem, search: string, catalogEntry?: WorkCatalogEntry): boolean {
  const text = [item.code, item.workType.name, item.workType.groupName, item.location.path, item.contractor?.name,
    catalogEntry?.systemCode, catalogEntry?.subgroupNumber, catalogEntry?.typeName]
    .filter(Boolean).join(" ").toLocaleLowerCase();
  return search.trim().toLocaleLowerCase().split(/\s+/).every((term) => text.includes(term));
}

const workCodeOrder = new Intl.Collator("en", { numeric: true });

/** Order the full plan before filtering and pagination. */
export function sortWorkPlan(items: WorkItem[], catalog: WorkCatalogEntry[], locations: Location[]) {
  const codes = new Map(catalog.filter((entry) => entry.workTypeId).map((entry) => [entry.workTypeId, entry.systemCode]));
  const byLocation = new Map(locations.map((location) => [location.id, location]));
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

  return [...items].sort((first, second) => {
    const firstCode = codes.get(first.workTypeId) || first.code;
    const secondCode = codes.get(second.workTypeId) || second.code;
    if (firstCode && !secondCode) return -1;
    if (!firstCode && secondCode) return 1;
    const codeOrder = workCodeOrder.compare(firstCode ?? "", secondCode ?? "");
    return codeOrder
      || workCodeOrder.compare(first.workType.name, second.workType.name)
      || floorRank(first) - floorRank(second)
      || (byLocation.get(first.locationId)?.sequenceNumber ?? 0) - (byLocation.get(second.locationId)?.sequenceNumber ?? 0)
      || workCodeOrder.compare(first.location.path, second.location.path)
      || first.id.localeCompare(second.id);
  });
}
