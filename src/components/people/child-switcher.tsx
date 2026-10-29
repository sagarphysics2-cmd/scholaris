import Link from "next/link";
import { cn } from "@/lib/utils";

/** Parent view: pill tabs to switch between linked children (keeps other query params). */
export function ChildSwitcher({ items, active, basePath, params = {} }: { items: Array<{ id: string; name: string }>; active: string | null; basePath: string; params?: Record<string, string | undefined> }) {
  if (items.length <= 1) return null;
  return (
    <div className="no-print mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Choose child">
      {items.map((c) => {
        const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v) as [string, string][]), studentId: c.id });
        return (
          <Link
            key={c.id}
            role="tab"
            aria-selected={c.id === active}
            href={`${basePath}?${qs}`}
            className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition", c.id === active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {c.name}
          </Link>
        );
      })}
    </div>
  );
}
