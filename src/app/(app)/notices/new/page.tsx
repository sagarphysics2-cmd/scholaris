import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { noticeTargetOptions } from "@/server/services/notices.service";
import { createNoticeAction } from "../actions";
import { NoticeForm } from "../notice-form";

export const metadata: Metadata = { title: "New notice" };

export default async function NewNoticePage() {
  const actor = await requirePermission("notices.publish");
  const opts = await noticeTargetOptions(actor);
  return (
    <>
      <PageHeader title={opts.manage ? "New notice" : "New class announcement"} breadcrumbs={[{ label: "Notices", href: "/notices" }, { label: "New" }]} />
      <Card>
        <CardContent>
          {!opts.manage && opts.sections.length === 0 ? (
            <EmptyState title="No classes" description="You need to be assigned to a class to post announcements." />
          ) : (
            <NoticeForm action={createNoticeAction} manage={opts.manage} classes={opts.classes} sections={opts.sections} cancelHref="/notices" />
          )}
        </CardContent>
      </Card>
    </>
  );
}
