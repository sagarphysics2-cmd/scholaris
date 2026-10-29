"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, X } from "lucide-react";
import { useEffect } from "react";
import type { NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = [...new Set(items.map((i) => i.section))];
  return (
    <nav aria-label="Main" className="space-y-6">
      {sections.map((section) => (
        <div key={section}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{section}</p>
          <ul className="space-y-0.5">
            {items
              .filter((i) => i.section === section)
              .map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                        active ? "bg-primary-soft text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <NavIcon name={item.icon} className={cn("size-4.5", active ? "text-primary" : "")} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ schoolName }: { schoolName: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <GraduationCap className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-tight">Scholaris</span>
        <span className="block truncate text-xs text-muted-foreground">{schoolName}</span>
      </span>
    </Link>
  );
}

export function Sidebar({ items, schoolName }: { items: NavItem[]; schoolName: string }) {
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-16 items-center border-b px-4">
        <Brand schoolName={schoolName} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <NavLinks items={items} />
      </div>
    </aside>
  );
}

export function MobileDrawer({ items, schoolName, open, onClose }: { items: NavItem[]; schoolName: string; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-slide-in flex-col bg-sidebar shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b px-4">
          <Brand schoolName={schoolName} />
          <button onClick={onClose} className="grid size-10 place-items-center rounded-lg hover:bg-muted" aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <NavLinks items={items} onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Quick navigation"
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}
              >
                <NavIcon name={item.icon} className="size-5" />
                <span className="truncate px-1">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
