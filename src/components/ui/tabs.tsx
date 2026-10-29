import Link from "next/link";
import { cn } from "@/lib/utils";

/** Link-based tabs (the active tab lives in the URL so it is shareable and SSR-friendly). */
export function LinkTabs({ tabs, active }: { tabs: Array<{ key: string; label: string; href: string; count?: number }>; active: string }) {
  return (
    <div className="no-print -mx-1 mb-5 overflow-x-auto">
      <nav className="flex min-w-max gap-1 border-b px-1" aria-label="Tabs">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
              t.key === active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{t.count}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
