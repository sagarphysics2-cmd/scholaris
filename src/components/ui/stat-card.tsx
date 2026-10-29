import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  tone?: keyof typeof tones;
  href?: string;
}) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5", tones[tone])}>{icon}</div>
    </div>
  );
  const cls = "block rounded-xl border bg-card p-5 shadow-xs";
  return href ? (
    <Link href={href} className={cn(cls, "transition hover:border-primary/40 hover:shadow-sm")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
