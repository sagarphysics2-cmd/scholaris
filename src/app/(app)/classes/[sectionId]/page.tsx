import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarCheck2, CalendarRange, Pencil, Plus, Trash2, Users } from "lucide-react";
import { TeachingAssignForm } from "@/components/academics/teaching-assign-form";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can, requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";
import { getSectionDetail } from "@/server/services/academics.service";
import { teacherOptions } from "@/server/services/teachers.service";
import { assignTeachingAction, unassignTeachingAction } from "../../teachers/actions";
import { deleteSectionAction, saveSectionAction } from "../actions";
import { SectionForm } from "../forms";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Section" };

export default async function SectionPage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  const actor = await requirePermission("classes.read");
  const s = await load(getSectionDetail(actor, sectionId));
  const canWrite = can(actor, "classes.write");
  const canAssign = can(actor, "subjects.write");
  const teachers = canWrite || canAssign ? await teacherOptions(actor.schoolId!) : [];
  const classes = canWrite ? (await db.class.findMany({ where: { schoolId: actor.schoolId! }, orderBy: { level: "asc" } })).map((c) => ({ value: c.id, label: c.name })) : [];
  const curriculum = s.class.classSubjects.filter((cs) => cs.academicYearId === s.academicYearId);
  const title = `${s.class.name} – Section ${s.name}`;

  return (
    <>
      <PageHeader
        title={title}
        description={`${s.academicYear.name} · ${s.enrollments.length} students${s.room ? ` · Room ${s.room}` : ""} · Class teacher: ${s.classTeacher ? fullName(s.classTeacher.user) : "not assigned"}`}
        breadcrumbs={[{ label: "Classes", href: "/classes" }, { label: title }]}
        actions={
          <>
            <ButtonLink variant="outline" href={`/attendance?sectionId=${s.id}`}><CalendarCheck2 /> Attendance</ButtonLink>
            <ButtonLink variant="outline" href={`/timetable?sectionId=${s.id}`}><CalendarRange /> Timetable</ButtonLink>
            {canWrite && (
              <ModalButton variant="outline" icon={<Pencil />} label="Edit" title={`Edit ${title}`}>
                <SectionForm action={saveSectionAction.bind(null, s.id)} classes={classes} teachers={teachers} defaults={{ classId: s.classId, name: s.name, room: s.room, capacity: s.capacity, classTeacherId: s.classTeacherId }} />
              </ModalButton>
            )}
            {canWrite && s.enrollments.length === 0 && (
              <ConfirmAction action={deleteSectionAction.bind(null, s.id)} icon={<Trash2 />} label="Delete" title="Delete section?" description="Only empty sections without attendance or assignments can be deleted." confirmLabel="Delete" />
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader title="Students" icon={<Users />} description={`${s.enrollments.length}${s.capacity ? ` of ${s.capacity}` : ""} enrolled`} />
          {s.enrollments.length === 0 ? (
            <EmptyState title="No students in this section" description="Assign students from their profile or by importing a CSV." />
          ) : (
            <Table>
              <THead><TR><TH>Roll</TH><TH>Student</TH><TH>Email</TH></TR></THead>
              <TBody>
                {s.enrollments.map((e) => (
                  <TR key={e.id}>
                    <TD label="Roll" className="w-16 tabular-nums">{e.rollNumber}</TD>
                    <TD>
                      <Link href={`/students/${e.studentId}`} className="flex items-center gap-3 font-medium hover:text-primary">
                        <Avatar name={fullName(e.student.user)} fileId={e.student.user.avatarFileId} size="sm" />
                        {fullName(e.student.user)}
                      </Link>
                    </TD>
                    <TD label="Email" className="text-muted-foreground">{e.student.user.email ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card className="self-start">
          <CardHeader
            title="Subjects & teachers"
            icon={<BookOpen />}
            action={
              canAssign && (
                <ModalButton size="sm" label="Assign" icon={<Plus />} title={`Assign a teacher — ${title}`}>
                  <TeachingAssignForm action={assignTeachingAction} fixed={{ sectionId: s.id }} teachers={teachers} subjects={curriculum.map((c) => ({ value: c.subjectId, label: c.subject.name }))} />
                </ModalButton>
              )
            }
          />
          <ul className="divide-y">
            {curriculum.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No subjects configured for {s.class.name}.</li>}
            {curriculum.map((cs) => {
              const ts = s.teacherSubjects.find((t) => t.subjectId === cs.subjectId);
              return (
                <li key={cs.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{cs.subject.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {ts ? <Link href={`/teachers/${ts.teacherId}`} className="hover:text-primary">{fullName(ts.teacher.user)}</Link> : <Badge tone="warning">No teacher</Badge>}
                    </p>
                  </div>
                  {canAssign && ts && (
                    <ConfirmAction action={unassignTeachingAction.bind(null, ts.id)} variant="ghost" size="icon-sm" icon={<Trash2 />} ariaLabel={`Unassign ${cs.subject.name}`} title="Remove teacher?" description={`${fullName(ts.teacher.user)} will no longer teach ${cs.subject.name} here.`} confirmLabel="Remove" />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
