"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Building2, ChevronDown, KeyRound, LogOut, Menu, Search, UserRound } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import type { NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { BottomNav, MobileDrawer } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

type Props = {
  user: { name: string; email: string | null; roleName: string; avatarFileId: string | null };
  schoolName: string;
  nav: NavItem[];
  bottom: NavItem[];
  unread: number;
  schools?: Array<{ id: string; name: string }>;
  activeSchoolId?: string | null;
  logoutAction: () => Promise<void>;
  switchSchoolAction?: (schoolId: string) => Promise<void>;
};

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside]);
}

export function Topbar({ user, schoolName, nav, bottom, unread: initialUnread, schools, activeSchoolId, logoutAction, switchSchoolAction }: Props) {
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  // Latest polled count, remembered together with the server value it refreshed.
  const [polled, setPolled] = useState<{ base: number; count: number } | null>(null);
  const unread = polled && polled.base === initialUnread ? polled.count : initialUnread;
  const [q, setQ] = useState("");
  const [switching, startSwitch] = useTransition();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenu(false));

  // Poll the unread count so the bell stays fresh without a full reload.
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/notifications/unread", { cache: "no-store" });
        if (res.ok) {
          const { count } = await res.json();
          setPolled({ base: initialUnread, count });
        }
      } catch {
        /* offline — keep the last known count */
      }
    };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [initialUnread]);

  return (
    <>
      <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur sm:px-5">
        <button
          onClick={() => setDrawer(true)}
          className="grid size-10 place-items-center rounded-lg hover:bg-muted lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>

        <form
          role="search"
          className="relative min-w-0 flex-1 md:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Search students, teachers, classes…"
            aria-label="Global search"
            className="h-10 w-full rounded-lg border border-transparent bg-muted pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:outline-none focus:ring-3 focus:ring-ring/20"
          />
        </form>

        <div className="ml-auto flex items-center gap-1">
          {schools && schools.length > 0 && switchSchoolAction && (
            <label className="relative hidden items-center md:flex">
              <span className="sr-only">Active school</span>
              <Building2 className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden />
              <select
                value={activeSchoolId ?? ""}
                disabled={switching}
                onChange={(e) => startSwitch(() => switchSchoolAction(e.target.value))}
                className="h-10 max-w-52 rounded-lg border border-input bg-card pl-8 pr-7 text-sm"
              >
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ThemeToggle />
          <Link
            href="/notifications"
            className="relative grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          >
            <Bell className="size-5" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4.5 text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenu((m) => !m)}
              className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-muted"
              aria-haspopup="menu"
              aria-expanded={menu}
              aria-label={`Account menu for ${user.name}`}
            >
              <Avatar name={user.name} fileId={user.avatarFileId} size="sm" />
              <span className="hidden text-left md:block">
                <span className="block max-w-36 truncate text-sm font-medium leading-tight">{user.name}</span>
                <span className="block text-xs leading-tight text-muted-foreground">{user.roleName}</span>
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground md:block" aria-hidden />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 mt-2 w-60 animate-fade-in rounded-xl border bg-card p-1.5 shadow-lg">
                <div className="border-b px-3 py-2">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email ?? schoolName}</p>
                </div>
                <Link role="menuitem" href="/profile" onClick={() => setMenu(false)} className="mt-1 flex h-9 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted">
                  <UserRound className="size-4" /> My profile
                </Link>
                <Link role="menuitem" href="/profile#security" onClick={() => setMenu(false)} className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted">
                  <KeyRound className="size-4" /> Password & sessions
                </Link>
                <form action={logoutAction}>
                  <button role="menuitem" className={cn("flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-danger hover:bg-danger-soft")}>
                    <LogOut className="size-4" /> Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </header>
      <MobileDrawer items={nav} schoolName={schoolName} open={drawer} onClose={() => setDrawer(false)} />
      <BottomNav items={bottom} />
    </>
  );
}
