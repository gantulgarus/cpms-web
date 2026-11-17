"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { WorkCatalog } from "@/components/work-catalog";
import { ChecklistTemplates } from "@/components/checklist-templates";
import { useMe } from "@/lib/api/use-me";
import { cn } from "@/lib/utils";

export default function ReferenceDataPage() {
  const { me } = useMe();
  const canManage = Boolean(me?.canManageReferenceData);
  const [tab, setTab] = useState<"catalog" | "checklists">("catalog");
  return (
    <div>
      <PageHeader title="Лавлах сан" description="Компанийн ажлын бүлэг, төрөл, хийгдэх ажлын лавлах. Барилгад ажил төлөвлөх нь барилгын хуудсанд." />
      <div className="mb-4 flex gap-1">
        {([["catalog", "Ажлын жагсаалт"], ["checklists", "Чанарын хуудас"]] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", tab === value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</button>
        ))}
      </div>
      {tab === "catalog" ? <WorkCatalog canManage={canManage} /> : <ChecklistTemplates canManage={canManage} />}
    </div>
  );
}
