import type { ListEnvelope, WorkItem } from "./api/types";

/** Read every page before ordering; never present a partial schedule as the first work. */
export async function loadAssignmentWork(
  fetchPage: (page: number) => Promise<ListEnvelope<WorkItem>>,
): Promise<WorkItem[]> {
  const first = await fetchPage(1);
  const rows = [...first.data];
  if (first.meta.pageSize <= 0) throw new Error("Ажлын хуудаслалтын мэдээлэл буруу байна.");
  const pages = Math.ceil(first.meta.total / first.meta.pageSize);
  for (let page = 2; page <= pages; page++) {
    const next = await fetchPage(page);
    if (next.meta.total !== first.meta.total || next.meta.pageSize !== first.meta.pageSize) {
      throw new Error("Ажлын жагсаалт өөрчлөгдсөн байна. Дахин ачаална уу.");
    }
    rows.push(...next.data);
  }
  if (rows.length !== first.meta.total || new Set(rows.map((w) => w.id)).size !== rows.length) {
    throw new Error("Ажлын жагсаалтыг бүрэн авч чадсангүй. Дахин ачаална уу.");
  }
  return rows;
}

export function isUnassignedWork(item: WorkItem) {
  return !item.contractor && item.status !== "completed" && item.status !== "cancelled";
}

export function compareAssignmentStart(a: WorkItem, b: WorkItem) {
  const aDate = a.plannedStartDate?.slice(0, 10) || "9999-99-99";
  const bDate = b.plannedStartDate?.slice(0, 10) || "9999-99-99";
  return aDate.localeCompare(bDate) || a.location.path.localeCompare(b.location.path)
    || a.workType.name.localeCompare(b.workType.name) || a.id.localeCompare(b.id);
}
