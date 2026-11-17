import type { WorkCatalogEntry } from "@/lib/api/types";

export function WorkCatalogIdentity({ entry }: { entry?: WorkCatalogEntry }) {
  if (!entry) return null;
  return (
    <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-normal text-muted-foreground">
      <div className="flex gap-1"><dt>Код</dt><dd className="font-mono text-foreground">{entry.systemCode}</dd></div>
      <div className="flex gap-1"><dt>Бүлэг</dt><dd>{entry.groupName}</dd></div>
      <div className="flex gap-1"><dt>Дэд бүлэг</dt><dd>{entry.subgroupNumber}</dd></div>
      <div className="flex gap-1"><dt>Ажлын төрөл</dt><dd>{entry.typeName}</dd></div>
    </dl>
  );
}
