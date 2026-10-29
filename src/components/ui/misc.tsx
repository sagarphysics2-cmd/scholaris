import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Label/value pairs for profile pages. */
export function DescriptionList({ items, className }: { items: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{i.label}</dt>
          <dd className="mt-1 break-words text-sm">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value, tone = "primary", label }: { value: number; tone?: "primary" | "success" | "warning" | "danger"; label?: string }) {
  const colors = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger" };
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full rounded-full transition-all", colors[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="no-print flex flex-col gap-2 border-b p-4 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}

export function attendanceTone(pct: number | null | undefined): "success" | "warning" | "danger" | "primary" {
  if (pct === null || pct === undefined) return "primary";
  if (pct >= 90) return "success";
  if (pct >= 75) return "warning";
  return "danger";
}
