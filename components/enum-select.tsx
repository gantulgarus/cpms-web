import { cn } from "@/lib/utils";

export interface EnumOption<T extends string> {
  value: T;
  label: string;
}

/** Styled native select for small enums (status, dependency type). */
export function EnumSelect<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: EnumOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        "border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
