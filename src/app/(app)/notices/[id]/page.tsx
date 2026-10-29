import type { Metadata } from "next";
import { Pencil, Pin, Trash2 } from "lucide-react";
import { FileList } from "@/components/files/file-list";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { formatDateTime, fullName } from "@/lib/utils";
import { getNotice } from "@/server/services/notices.service";
import { deleteNoticeAction } from "../actions";
import { audienceLabel } from "../audience";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Notice" };

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("notices.read");
  const n = await load(getNotice(actor, id));
  return (
    <>
      <PageHeader
        title={n.title}
        breadcrumbs={[{ label: "Notices", href: "/notices" }, { label: n.title }]}
        actions={
          n.canEdit && (
            <>
              <ButtonLink href={`/notices/${n.id}/edit`} variant="outline"><Pencil /> Edit</ButtonLink>
              <ConfirmAction action={deleteNoticeAction.bind(null, n.id)} icon={<Trash2 />} label="Delete" title="Delete this notice?" description="It will disappear for everyone." confirmLabel="Delete" />
            </>
          )
        }
      />
      <Card className="max-w-3xl">
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={fullName(n.author)} fileId={n.author.avatarFileId} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{fullName(n.author)}</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(n.publishDate)}{n.expiryDate && ` · until ${formatDateTime(n.expiryDate)}`}</p>
            </div>
            {n.isPinned && <Badge tone="warning"><Pin className="size-3" /> Pinned</Badge>}
            <Badge tone="primary">{audienceLabel(n)}</Badge>
          </div>
          <div className="whitespace-pre-line text-[15px] leading-relaxed">{n.message}</div>
          <FileList files={n.attachments} />
        </CardContent>
      </Card>
    </>
  );
}
