import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Paperclip, Pin, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParams, sp } from "@/components/ui/pagination";
import { LinkTabs } from "@/components/ui/tabs";
import { SearchInput } from "@/components/ui/url-controls";
import { can, requirePermission } from "@/lib/auth/actor";
import { formatDateTime, fullName, relativeTime, requestNow } from "@/lib/utils";
import { listNotices } from "@/server/services/notices.service";
import { audienceLabel } from "./audience";

export const metadata: Metadata = { title: "Notices" };

export default async function NoticesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("notices.read");
  const params = await searchParams;
  const scope = sp(params, "scope") ?? "live";
  const { page, pageSize, skip, take } = pageParams(params, 12);
  const { total, rows } = await listNotices(actor, { q: sp(params, "q"), scope, skip, take });
  const canPublish = can(actor, "notices.publish");
  const manage = can(actor, "notices.manage");
  const tabs = [
    { key: "live", label: "Current", href: "/notices" },
    ...(canPublish ? [{ key: "mine", label: "Posted by me", href: "/notices?scope=mine" }] : []),
    ...(manage ? [{ key: "scheduled", label: "Scheduled", href: "/notices?scope=scheduled" }, { key: "expired", label: "Expired", href: "/notices?scope=expired" }] : []),
  ];
  const now = requestNow();
  return (
    <>
      <PageHeader title="Notices & Announcements" description="School-wide notices and class announcements." actions={canPublish && <ButtonLink href="/notices/new"><Plus /> New notice</ButtonLink>} />
      {tabs.length > 1 && <LinkTabs tabs={tabs} active={scope} />}
      <Card>
        <Toolbar><SearchInput placeholder="Search notices…" /></Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={<Megaphone />} title="No notices" description="There's nothing to show here right now." />
        ) : (
          <ul className="divide-y">
            {rows.map((n) => (
              <li key={n.id}>
                <Link href={`/notices/${n.id}`} className="flex gap-4 px-5 py-4 hover:bg-muted/50">
                  <Avatar name={fullName(n.author)} fileId={n.author.avatarFileId} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.isPinned && <Badge tone="warning"><Pin className="size-3" /> Pinned</Badge>}
                      <Badge tone="primary">{audienceLabel(n)}</Badge>
                      {n.publishDate.getTime() > now && <Badge tone="info">Scheduled {formatDateTime(n.publishDate)}</Badge>}
                      {n._count.attachments > 0 && <Paperclip className="size-3.5 text-muted-foreground" aria-label="Has attachments" />}
                    </div>
                    <p className="mt-1.5 font-semibold">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">{fullName(n.author)} · {relativeTime(n.publishDate)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/notices" searchParams={params} />
      </Card>
    </>
  );
}
