import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArchiveRestore, Baby, Briefcase, Mail, Pencil, Phone, Plus, Unlink } from "lucide-react";
import { InviteButton } from "@/components/people/invite-button";
import { ProfileHeader } from "@/components/people/profile-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { DescriptionList } from "@/components/ui/misc";
import { can, requirePermission } from "@/lib/auth/actor";
import { formatDateTime, fullName, titleCase } from "@/lib/utils";
import { getParent, studentPickerOptions } from "@/server/services/parents.service";
import { resendInviteAction } from "../../students/actions";
import { archiveParentAction, unlinkChildAction } from "../actions";
import { LinkChildDialogBody } from "../link-child-dialog";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Parent profile" };

export default async function ParentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("parents.read");
  const p = await load(getParent(actor, id));
  const canWrite = can(actor, "parents.write");
  const name = fullName(p.user);
  const students = canWrite ? (await studentPickerOptions(actor.schoolId!)).filter((s) => !p.children.some((c) => c.studentId === s.value)) : [];
  return (
    <>
      <ProfileHeader
        name={name}
        avatarFileId={p.user.avatarFileId}
        subtitle="Parent / Guardian"
        badges={<StatusBadge status={p.status === "ARCHIVED" ? "ARCHIVED" : p.user.status} />}
        meta={[
          ...(p.user.email ? [{ icon: <Mail />, label: p.user.email }] : []),
          ...(p.user.phone ? [{ icon: <Phone />, label: p.user.phone }] : []),
          ...(p.occupation ? [{ icon: <Briefcase />, label: p.occupation }] : []),
        ]}
        actions={
          canWrite && (
            <>
              {p.user.status === "INVITED" && <InviteButton action={resendInviteAction.bind(null, p.user.id)} label="Resend invite" />}
              <ButtonLink href={`/parents/${p.id}/edit`} variant="outline"><Pencil /> Edit</ButtonLink>
              {p.status === "ACTIVE" ? (
                <ConfirmAction action={archiveParentAction.bind(null, p.id, true)} label="Archive" icon={<Archive />} title={`Archive ${name}?`} description="Their portal access will be disabled. Links to children are kept." confirmLabel="Archive" />
              ) : (
                <ConfirmAction action={archiveParentAction.bind(null, p.id, false)} label="Restore" icon={<ArchiveRestore />} title={`Restore ${name}?`} description="Portal access will be re-enabled." confirmLabel="Restore" confirmVariant="primary" />
              )}
            </>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader
            title="Children"
            icon={<Baby />}
            description={`${p.children.length} linked student${p.children.length === 1 ? "" : "s"}`}
            action={canWrite && <ModalButton size="sm" label="Link child" icon={<Plus />} title="Link a child"><LinkChildDialogBody parentId={p.id} students={students} /></ModalButton>}
          />
          {p.children.length === 0 ? (
            <EmptyState title="No children linked" />
          ) : (
            <ul className="divide-y">
              {p.children.map((c) => {
                const e = c.student.enrollments[0];
                return (
                  <li key={c.studentId} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={fullName(c.student.user)} fileId={c.student.user.avatarFileId} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/students/${c.studentId}`} className="font-medium hover:text-primary">{fullName(c.student.user)}</Link>
                      <p className="text-sm text-muted-foreground">{e ? `${e.section.class.name} – ${e.section.name} · Roll ${e.rollNumber}` : "Not enrolled"}</p>
                    </div>
                    <Badge>{titleCase(c.relationship)}</Badge>
                    {c.isPrimary && <Badge tone="primary">Primary</Badge>}
                    {canWrite && (
                      <ConfirmAction action={unlinkChildAction.bind(null, p.id, c.studentId)} variant="ghost" size="icon-sm" icon={<Unlink />} ariaLabel="Unlink child" title="Unlink this child?" description={`${name} will no longer see ${fullName(c.student.user)}'s information.`} confirmLabel="Unlink" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Details" />
          <CardContent>
            <DescriptionList className="sm:grid-cols-1" items={[{ label: "Address", value: p.address }, { label: "Occupation", value: p.occupation }, { label: "Last sign-in", value: formatDateTime(p.user.lastLoginAt) }]} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
