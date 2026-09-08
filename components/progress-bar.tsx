import { cn } from "@/lib/utils";

/**
 * Нимгэн явцын зурвас — хүснэгтийн мөрөнд хувийг нүдээр харьцуулахад.
 * Дууссан бол ногоон, эхлээгүй бол зөвхөн суурь өнгө харагдана.
 */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn("bg-muted h-1.5 w-full overflow-hidden rounded-full", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct >= 100 ? "bg-emerald-500" : "bg-blue-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Хоёр давхар зурвас: БАТЛАГДСАН (тод) + мэдээлэгдсэн ч БАТЛАГДААГҮЙ (сул).
 *
 * Яагаад чухал: ганц хувь харуулах нь маргаан үүсгэдэг. Гүйцэтгэгч "би 40%
 * хийсэн" гэнэ, програм "12%" гэж бичнэ — хоёулаа зөв, зүгээр л 28% нь
 * батлагдаагүй байгаа юм. Тэр зөрүү харагдахгүй бол хүмүүс програмд итгэхээ
 * болино. Захиалагчийн гол гомдол яг энэ байсан.
 */
export function DualProgressBar({
  accepted,
  reported,
  planned,
  className,
}: {
  accepted: number;
  reported: number;
  planned: number;
  className?: string;
}) {
  const safe = (n: number) => (planned > 0 ? Math.max(0, Math.min(100, (n / planned) * 100)) : 0);
  const acceptedPct = safe(accepted);
  // Хүлээгдэж буй хэсэг нь батлагдсаны ДЭЭР нэмэгдэнэ, давхардахгүй.
  const pendingPct = Math.max(0, safe(reported) - acceptedPct);

  return (
    <div
      className={cn("bg-muted flex h-1.5 w-full overflow-hidden rounded-full", className)}
      role="progressbar"
      aria-valuenow={Math.round(acceptedPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      title={`Батлагдсан ${Math.round(acceptedPct)}% · батлахыг хүлээж буй ${Math.round(pendingPct)}%`}
    >
      <div
        className={cn(
          "h-full transition-all",
          acceptedPct >= 100 ? "bg-emerald-500" : "bg-blue-500",
        )}
        style={{ width: `${acceptedPct}%` }}
      />
      <div className="h-full bg-amber-400/60 transition-all" style={{ width: `${pendingPct}%` }} />
    </div>
  );
}
