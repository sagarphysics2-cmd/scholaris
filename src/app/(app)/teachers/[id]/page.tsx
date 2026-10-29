import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArchiveRestore, BookOpen, CalendarRange, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { ProfileHeader } from "@/components/people/profile-header";
import { InviteButton } from "@/components/people/invite-button";
import { TeachingAssignForm } from "@/components/academics/teaching-assign-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { DescriptionList } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can, requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, fullName, titleCase } from "@/lib/utils";
import { sectionOptions } from "@/server/services/students.service";
import { getTeacher } from "@/server/services/teachers.service";
import { resendInviteAction } from "../../students/actions";
import { archiveTeacherAction, assignTeachingAction, unassignTeachingAction } from "../actions";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Teacher profile" };

export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("teachers.read");
  const t = await load(getTeacher(actor, id));
  const canWrite = can(actor, "teachers.write");
  const canAssign = can(actor, "subjects.write");
  const [sections, subjects] = canAssign
    ? await Promise.all([sectionOptions(actor.schoolId!), db.subject.findMany({ where: { schoolId: actor.schoolId!, status: "ACTIVE" }, orderBy: { name: "asc" } })])
    : [[], []];
  const name = fullName(t.user);
  const students = t.teacherSubjects.reduce((sum, ts) => sum + ts.section._count.enrollments, 0);

  return (
    <>
      <ProfileHeader
        name={name}
        avatarFileId={t.user.avatarFileId}
        subtitle={`${t.specialization ?? "Teacher"} · ${t.employeeId}`}
        badges={<StatusBadge status={t.status === "ACTIVE" && t.user.status === "INVITED" ? "INVITED" : t.status} />}
        meta={[
          ...(t.user.email ? [{ icon: <Mail />, label: <a href={`mailto:${t.user.email}`} className="hover:text-foreground">{t.user.email}</a> }] : []),
          ...(t.user.phone ? [{ icon: <Phone />, label: t.user.phone }] : []),
        ]}
        actions={
          <>
            <ButtonLink href={`/timetable?teacherId=${t.id}`} variant="outline"><CalendarRange /> Timetable</ButtonLink>
            {canWrite && t.user.status === "INVITED" && <InviteButton action={resendInviteAction.bind(null, t.user.id)} label="Resend invite" />}
            {canWrite && <ButtonLink href={`/teachers/${t.id}/edit`} variant="outline"><Pencil /> Edit</ButtonLink>}
            {canWrite &&
              (t.status === "ACTIVE" ? (
                <ConfirmAction
                  action={archiveTeacherAction.bind(null, t.id, true)}
                  label="Archive"
                  icon={<Archive />}
                  title={`Archive ${name}?`}
                  description="Their login will be disabled and their current teaching assignments, class-teacher roles and timetable slots will be released. Marks and assignments they created are kept."
                  confirmLabel="Archive teacher"
                />
              ) : (
                <ConfirmAction action={archiveTeacherAction.bind(null, t.id, false)} label="Restore" icon={<ArchiveRestore />} title={`Restore ${name}?`} description="Their account will be re-enabled." confirmLabel="Restore" confirmVariant="primary" />
              ))}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title="Teaching assignments"
            description={`${t.teacherSubjects.length} class-subject${t.teacherSubjects.length === 1 ? "" : "s"} · ${students} students this year`}
            icon={<BookOpen />}
            action={
              canAssign && t.status === "ACTIVE" && (
                <ModalButton label="Assign" icon={<Plus />} size="sm" title={`Assign a class to ${name}`}>
                  <TeachingAssignForm action={assignTeachingAction} fixed={{ teacherId: t.id }} sections={sections} subjects={subjects.map((s) => ({ value: s.id, label: s.name }))} />
                </ModalButton>
              )
            }
          />
          {t.teacherSubjects.length === 0 ? (
            <EmptyState title="No classes assigned" description="Assign subjects and sections to this teacher." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Class</TH>
                  <TH>Subject</TH>
                  <TH>Students</TH>
                  {canAssign && <TH className="text-right">Actions</TH>}
                </TR>
              </THead>
              <TBody>
                {t.teacherSubjects.map((ts) => (
                  <TR key={ts.id}>
                    <TD label="Class"><Link className="font-medium hover:text-primary" href={`/classes/${ts.sectionId}`}>{ts.section.class.name} – {ts.section.name}</Link></TD>
                    <TD label="Subject"><Badge tone="primary">{ts.subject.name}</Badge></TD>
                    <TD label="Students" className="tabular-nums">{ts.section._count.enrollments}</TD>
                    {canAssign && (
                      <TD className="text-right">
                        <ConfirmAction
                          action={unassignTeachingAction.bind(null, ts.id)}
                          variant="danger-ghost"
                          size="icon-sm"
                          icon={<Trash2 />}
                          ariaLabel={`Remove ${ts.subject.name} in ${ts.section.class.name}-${ts.section.name}`}
                          title="Remove teaching assignment?"
                          description={`${name} will no longer teach ${ts.subject.name} to ${ts.section.class.name}-${ts.section.name}.`}
                          confirmLabel="Remove"
                        />
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardContent>
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Employee ID", value: t.employeeId },
                  { label: "Qualification", value: t.qualification },
                  { label: "Joining date", value: formatDate(t.joiningDate) },
                  { label: "Gender", value: t.gender ? titleCase(t.gender) : "—" },
                  { label: "Class teacher of", value: t.classTeacherOf.map((s) => `${s.class.name}-${s.name}`).join(", ") || "—" },
                  { label: "Address", value: t.address },
                  { label: "Last sign-in", value: formatDateTime(t.user.lastLoginAt) },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
