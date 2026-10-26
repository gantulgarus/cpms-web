/** Missing data must never look like a confirmed zero. */
export function DashboardCount({ value, loading = false }: { value?: number; loading?: boolean }) {
  const known = typeof value === "number" && Number.isFinite(value);
  return (
    <span className="tabular-nums" aria-label={known ? undefined : loading ? "Ачаалж байна" : "Мэдээлэл тодорхойгүй"}>
      {known ? value.toLocaleString("mn-MN") : loading ? "…" : "—"}
    </span>
  );
}
