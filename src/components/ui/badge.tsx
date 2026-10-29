import type { ComponentProps } from "react";
import { cn, titleCase } from "@/lib/utils";

const tones = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-accent-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-[color-mix(in_oklch,var(--warning),black_30%)] dark:text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Consistent colours for every status enum in the app. */
const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: "success",
  INVITED: "info",
  DISABLED: "neutral",
  ARCHIVED: "neutral",
  GRADUATED: "primary",
  TRANSFERRED: "warning",
  SUSPENDED: "danger",
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  EXCUSED: "info",
  DRAFT: "neutral",
  SCHEDULED: "info",
  ONGOING: "warning",
  COMPLETED: "primary",
  PUBLISHED: "success",
  CLOSED: "neutral",
  SUBMITTED: "info",
  GRADED: "success",
  RETURNED: "primary",
  MISSING: "danger",
  PENDING: "warning",
  PARTIALLY_PAID: "info",
  PAID: "success",
  OVERDUE: "danger",
  WAIVED: "neutral",
  PASS: "success",
  FAIL: "danger",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label ?? titleCase(status)}
    </Badge>
  );
}
