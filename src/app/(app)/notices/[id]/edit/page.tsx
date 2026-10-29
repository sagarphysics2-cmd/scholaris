import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { getNotice, noticeTargetOptions } from "@/server/services/notices.service";
import { updateNoticeAction } from "../../actions";
import { NoticeForm } from "../../notice-form";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Edit notice" };

const local = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("notices.publish");
  const [n, opts] = await Promise.all([load(getNotice(actor, id)), noticeTargetOptions(actor)]);
  if (!n.canEdit) notFound();
  return (
    <>
      <PageHeader title="Edit notice" breadcrumbs={[{ label: "Notices", href: "/notices" }, { label: n.title, href: `/notices/${id}` }, { label: "Edit" }]} />
      <Card>
        <CardContent>
          <NoticeForm action={updateNoticeAction.bind(null, id)} manage={opts.manage} classes={opts.classes} sections={opts.sections} cancelHref={`/notices/${id}`} defaults={{ ...n, publishDate: local(n.publishDate), expiryDate: local(n.expiryDate) }} />
        </CardContent>
      </Card>
    </>
  );
}
