import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PROJECT_STATUS, REVIEW_STATE, WORK_STATUS, type Tone } from "@/lib/domain";
import type { ProjectStatus, WorkStatus } from "@/lib/api";
import type { ReviewState } from "@/lib/approval";

const TONE_CLASS: Record<Tone, string> = {
  gray: "bg-muted text-muted-foreground border-transparent",
  blue: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
  amber:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  green:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  red: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
};

export function ToneBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TONE_CLASS[tone])}>
      {children}
    </Badge>
  );
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = PROJECT_STATUS[status];
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}

export function WorkStatusBadge({ status }: { status: WorkStatus }) {
  const s = WORK_STATUS[status];
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}

export function ReviewStateBadge({ state }: { state: ReviewState }) {
  const s = REVIEW_STATE[state];
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}
