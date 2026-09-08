"use client";

/**
 * Чанарын шалгах хуудас — шалгалт хийхийн өмнө бөглөнө.
 *
 * Захиалагчийн дүрэм: «Зөвхөн зураг дээр үндэслэн ажил батлахгүй». Тиймээс
 * энэ нь зүгээр нэг маягт биш — заавал зүйл дутуу эсвэл «тэнцээгүй» байвал
 * батлах товч ажиллахгүй.
 *
 * Дүрмийг сервер мөн шалгана (`ChecklistGate`). Энд давхардуулсан нь
 * хамгаалалт биш, тайлбар: хэрэглэгч 422 алдаа хүлээхгүйгээр яагаад батлах
 * боломжгүй байгааг шууд харна.
 */
import { Check, Minus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ChecklistItem, ChecklistResult, ChecklistTemplate } from "@/lib/api/v2/types";

export type ChecklistAnswers = Record<string, { result: ChecklistResult; note?: string }>;

const OPTIONS: { value: ChecklistResult; label: string; icon: typeof Check; tone: string }[] = [
  { value: "pass", label: "Тэнцсэн", icon: Check, tone: "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  { value: "fail", label: "Тэнцээгүй", icon: X, tone: "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  { value: "na", label: "Хамаарахгүй", icon: Minus, tone: "border-muted-foreground bg-muted text-muted-foreground" },
];

/**
 * Батлах боломжтой эсэх ба шалтгаан.
 *
 * Дэлгэц болон энэ файл хоёулаа нэг эх сурвалжаас уншина — товч идэвхгүй
 * байгаа шалтгааныг хэрэглэгчид харуулахын тулд.
 */
export function checklistBlocker(
  template: ChecklistTemplate | null | undefined,
  answers: ChecklistAnswers,
): string | null {
  if (!template) return null;

  const required = template.items.filter((i) => i.isRequired);

  const missing = required.filter((i) => !answers[i.id]);
  if (missing.length > 0) {
    return `Чанарын хуудас дутуу — ${missing.length} зүйл хариулаагүй байна.`;
  }

  const failed = required.filter((i) => answers[i.id]?.result === "fail");
  if (failed.length > 0) {
    return `«${failed[0].text}» тэнцээгүй тул батлах боломжгүй. Буцаана уу.`;
  }

  return null;
}

/** Серверт илгээх хэлбэрт хөрвүүлнэ. */
export function toChecklistPayload(answers: ChecklistAnswers) {
  return Object.entries(answers).map(([itemId, a]) => ({
    itemId,
    result: a.result,
    note: a.note?.trim() || undefined,
  }));
}

export function ChecklistForm({
  template,
  answers,
  onChange,
}: {
  template: ChecklistTemplate;
  answers: ChecklistAnswers;
  onChange: (next: ChecklistAnswers) => void;
}) {
  const set = (item: ChecklistItem, result: ChecklistResult) =>
    onChange({ ...answers, [item.id]: { ...answers[item.id], result } });

  const setNote = (item: ChecklistItem, note: string) =>
    onChange({ ...answers, [item.id]: { result: answers[item.id]?.result ?? "pass", note } });

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium">{template.name}</p>

      <ul className="space-y-2.5">
        {template.items.map((item) => {
          const current = answers[item.id]?.result;

          return (
            <li key={item.id} className="space-y-1.5">
              <div className="text-sm">
                {item.text}
                {!item.isRequired && (
                  <span className="text-muted-foreground ml-1 text-xs">(заавал бус)</span>
                )}
              </div>
              {item.guidance && (
                <p className="text-muted-foreground text-xs">{item.guidance}</p>
              )}

              <div className="flex gap-1">
                {OPTIONS.map((o) => {
                  const Icon = o.icon;
                  const active = current === o.value;

                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set(item, o.value)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                        active ? o.tone : "text-muted-foreground hover:bg-accent/40",
                      )}
                    >
                      <Icon className="size-3" />
                      {o.label}
                    </button>
                  );
                })}
              </div>

              {/* Тэнцээгүй бол юу болсныг бичих нь дараагийн хүнд хэрэгтэй. */}
              {current === "fail" && (
                <input
                  value={answers[item.id]?.note ?? ""}
                  onChange={(e) => setNote(item, e.target.value)}
                  placeholder="Юу буруу байсныг бичнэ үү"
                  className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
