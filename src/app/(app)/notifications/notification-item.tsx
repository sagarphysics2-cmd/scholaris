"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { markReadAction } from "./actions";

/** Clicking a notification marks it read, then follows its link. */
export function NotificationItem({ id, link, unread, children }: { id: string; link: string | null; unread: boolean; children: ReactNode }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        start(async () => {
          if (unread) await markReadAction(id);
          if (link?.startsWith("/")) router.push(link);
          else router.refresh();
        })
      }
      className={cn("flex w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/60", unread && "bg-primary-soft/40")}
    >
      {children}
    </button>
  );
}
