import type { Metadata } from "next";
import { Bell, BookOpenCheck, CalendarX2, CheckCheck, ClipboardCheck, Megaphone, NotebookPen, Trash2, Trophy, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParams, sp } from "@/components/ui/pagination";
import { LinkTabs } from "@/components/ui/tabs";
import { requireActor } from "@/lib/auth/actor";
import { cn, relativeTime } from "@/lib/utils";
import { listNotifications } from "@/server/services/notifications.service";
import { clearReadAction, markAllReadAction } from "./actions";
import { NotificationItem } from "./notification-item";

export const metadata: Metadata = { title: "Notifications" };

const ICONS: Record<string, { icon: typeof Bell; cls: string }> = {
  ASSIGNMENT_NEW: { icon: NotebookPen, cls: "bg-primary-soft text-primary" },
  ASSIGNMENT_DUE: { icon: ClipboardCheck, cls: "bg-warning-soft text-warning" },
  ASSIGNMENT_GRADED: { icon: BookOpenCheck, cls: "bg-success-soft text-success" },
  RESULT_PUBLISHED: { icon: Trophy, cls: "bg-success-soft text-success" },
  ATTENDANCE: { icon: CalendarX2, cls: "bg-danger-soft text-danger" },
  NOTICE: { icon: Megaphone, cls: "bg-info-soft text-info" },
  FEE_REMINDER: { icon: Wallet, cls: "bg-warning-soft text-warning" },
  GENERAL: { icon: Bell, cls: "bg-muted text-muted-foreground" },
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const unreadOnly = sp(params, "filter") === "unread";
  const { page, pageSize, skip, take } = pageParams(params, 20);
  const { total, unread, rows } = await listNotifications(actor, { unread: unreadOnly, skip, take });
  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `You have ${unread} unread notification${unread === 1 ? "" : "s"}.` : "You're all caught up."}
        actions={
          <>
            <ConfirmAction action={markAllReadAction} icon={<CheckCheck />} label="Mark all read" title="Mark all as read?" description="All notifications will be marked as read." confirmLabel="Mark all read" confirmVariant="primary" />
            <ConfirmAction action={clearReadAction} variant="ghost" icon={<Trash2 />} label="Clear read" title="Delete read notifications?" description="Read notifications will be removed from your history." confirmLabel="Delete" />
          </>
        }
      />
      <LinkTabs active={unreadOnly ? "unread" : "all"} tabs={[{ key: "all", label: "All", href: "/notifications" }, { key: "unread", label: "Unread", href: "/notifications?filter=unread", count: unread }]} />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Bell />} title={unreadOnly ? "No unread notifications" : "No notifications yet"} />
        ) : (
          <ul className="divide-y">
            {rows.map((n) => {
              const { icon: Icon, cls } = ICONS[n.type] ?? ICONS.GENERAL!;
              return (
                <li key={n.id}>
                  <NotificationItem id={n.id} link={n.link} unread={!n.readAt}>
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", cls)}><Icon className="size-4.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn("truncate", !n.readAt && "font-semibold")}>{n.title}</span>
                        {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
                    </span>
                  </NotificationItem>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/notifications" searchParams={params} />
      </Card>
    </>
  );
}
