import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArchiveRestore, Cake, FileText, Hash, Mail, Pencil, Phone, School, Trash2, UserRound } from "lucide-react";
import { StudentAttendance } from "@/components/attendance/student-attendance";
import { InviteButton } from "@/components/people/invite-button";
import { ProfileHeader } from "@/components/people/profile-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { DescriptionList } from "@/components/ui/misc";
import { sp } from "@/components/ui/pagination";
import { LinkTabs } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can, isAdmin, requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatPercent, fullName, requestNow, titleCase, toNumber } from "@/lib/utils";
import { schoolSettings, studentAttendanceSummary } from "@/server/services/attendance.service";
import { studentResultsOverview } from "@/server/services/exams.service";
import { studentFeeSummary } from "@/server/services/fees.service";
import { getStudentProfile } from "@/server/services/students.service";
import { FamilyFees } from "../../fees/family-fees";
import { archiveStudentAction, deleteStudentAction, resendInviteAction } from "../actions";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Student profile" };

function age(dob: Date) {
  const now = new Date();
  let a = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) a--;
  return a;
}

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const actor = await requirePermission("students.read");
  const s = await load(getStudentProfile(actor, id));
  const tab = sp(await searchParams, "tab") ?? "overview";
  const canWrite = can(actor, "students.write");
  const name = fullName(s.user);
  const current = s.enrollments.find((e) => e.academicYear.isCurrent) ?? s.enrollments[0];
  const base = `/students/${id}`;
  const tabs = [
    { key: "overview", label: "Overview", href: base },
    ...(can(actor, "attendance.read") ? [{ key: "attendance", label: "Attendance", href: `${base}?tab=attendance` }] : []),
    ...(can(actor, "results.read") ? [{ key: "results", label: "Results", href: `${base}?tab=results` }] : []),
    ...(can(actor, "assignments.read") ? [{ key: "assignments", label: "Assignments", href: `${base}?tab=assignments` }] : []),
    ...(can(actor, "fees.read") && (canWrite || actor.parentId) ? [{ key: "fees", label: "Fees", href: `${base}?tab=fees` }] : []),
  ];

  return (
    <>
      <ProfileHeader
        name={name}
        avatarFileId={s.user.avatarFileId}
        subtitle={current ? `${current.section.class.name} – ${current.section.name} · Roll ${current.rollNumber}` : "Not enrolled this year"}
        badges={<StatusBadge status={s.status} />}
        meta={[
          { icon: <Hash />, label: s.studentCode },
          { icon: <FileText />, label: s.admissionNumber },
          { icon: <Cake />, label: `${formatDate(s.dateOfBirth)} (${age(s.dateOfBirth)} yrs)` },
          ...(s.user.email ? [{ icon: <Mail />, label: s.user.email }] : []),
        ]}
        actions={
          canWrite && (
            <>
              {s.user.status === "INVITED" && s.user.email && <InviteButton action={resendInviteAction.bind(null, s.user.id)} label="Resend invite" />}
              {s.user.status === "ACTIVE" && s.user.email && !s.user.lastLoginAt && <InviteButton action={resendInviteAction.bind(null, s.user.id)} label="Send portal invite" />}
              <ButtonLink href={`/students/${id}/report`} variant="outline"><FileText /> Report</ButtonLink>
              <ButtonLink href={`/students/${id}/edit`} variant="outline"><Pencil /> Edit</ButtonLink>
              {s.status !== "ARCHIVED" ? (
                <ConfirmAction action={archiveStudentAction.bind(null, id, true)} icon={<Archive />} label="Archive" title={`Archive ${name}?`} description="The student is hidden from active lists and their login is disabled. All academic records are kept and the student can be restored at any time." confirmLabel="Archive student" />
              ) : (
                <>
                  <ConfirmAction action={archiveStudentAction.bind(null, id, false)} icon={<ArchiveRestore />} label="Restore" title={`Restore ${name}?`} description="The student will become active again." confirmLabel="Restore" confirmVariant="primary" />
                  <ConfirmAction action={deleteStudentAction.bind(null, id)} variant="danger-ghost" icon={<Trash2 />} label="Delete" title="Permanently delete?" description="Only students with no attendance, marks, submissions or fees can be deleted. This cannot be undone." confirmLabel="Delete permanently" />
                </>
              )}
            </>
          )
        }
      />
      <LinkTabs tabs={tabs} active={tab} />

      {tab === "overview" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Personal details" icon={<UserRound />} />
              <CardContent>
                <DescriptionList
                  items={[
                    { label: "Full name", value: name },
                    { label: "Gender", value: titleCase(s.gender) },
                    { label: "Date of birth", value: formatDate(s.dateOfBirth) },
                    { label: "Blood group", value: s.bloodGroup ?? "—" },
                    { label: "Phone", value: s.user.phone ?? "—" },
                    { label: "Email", value: s.user.email ?? "—" },
                    { label: "Address", value: s.address ?? "—" },
                    { label: "Emergency contact", value: s.emergencyContactName ? `${s.emergencyContactName} · ${s.emergencyContactPhone ?? ""}` : "—" },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="Enrollment history" icon={<School />} />
              <Table>
                <THead><TR><TH>Year</TH><TH>Class</TH><TH>Roll</TH><TH>Class teacher</TH><TH>Status</TH></TR></THead>
                <TBody>
                  {s.enrollments.map((e) => (
                    <TR key={e.id}>
                      <TD className="font-medium">{e.academicYear.name}</TD>
                      <TD label="Class"><Link href={`/classes/${e.sectionId}`} className="hover:text-primary">{e.section.class.name} – {e.section.name}</Link></TD>
                      <TD label="Roll" className="tabular-nums">{e.rollNumber}</TD>
                      <TD label="Class teacher">{e.section.classTeacher ? fullName(e.section.classTeacher.user) : "—"}</TD>
                      <TD label="Status"><StatusBadge status={e.status} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {s.enrollments.length === 0 && <EmptyState title="No enrollments" />}
            </Card>
            {s.notes && (isAdmin(actor) || actor.teacherId) && (
              <Card>
                <CardHeader title="Notes" />
                <CardContent><p className="whitespace-pre-line text-sm">{s.notes}</p></CardContent>
              </Card>
            )}
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Parents & guardians" />
              {s.parents.length === 0 ? (
                <EmptyState title="No parent linked" action={can(actor, "parents.write") && <ButtonLink size="sm" href="/parents">Link from Parents</ButtonLink>} className="py-8" />
              ) : (
                <ul className="divide-y">
                  {s.parents.map((p) => (
                    <li key={p.parentId} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        {can(actor, "parents.read") && !actor.parentId ? <Link href={`/parents/${p.parentId}`} className="font-medium hover:text-primary">{fullName(p.parent.user)}</Link> : <span className="font-medium">{fullName(p.parent.user)}</span>}
                        <span className="flex gap-1"><Badge>{titleCase(p.relationship)}</Badge>{p.isPrimary && <Badge tone="primary">Primary</Badge>}</span>
                      </div>
                      <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                        {p.parent.user.phone && <span className="flex items-center gap-1"><Phone className="size-3.5" />{p.parent.user.phone}</span>}
                        {p.parent.user.email && <span className="flex items-center gap-1"><Mail className="size-3.5" />{p.parent.user.email}</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Admission" />
              <CardContent>
                <DescriptionList className="sm:grid-cols-1" items={[
                  { label: "Student ID", value: s.studentCode },
                  { label: "Admission number", value: s.admissionNumber },
                  { label: "Admission date", value: formatDate(s.admissionDate) },
                  { label: "Portal account", value: s.user.email ? <StatusBadge status={s.user.status} /> : "No login (no email)" },
                  { label: "Last sign-in", value: formatDateTime(s.user.lastLoginAt) },
                ]} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "attendance" && <StudentAttendance summary={await studentAttendanceSummary(actor, id)} />}

      {tab === "results" && <ResultsTab actorPromise={studentResultsOverview(actor, id)} studentId={id} />}

      {tab === "assignments" && <AssignmentsTab studentId={id} sectionId={current?.sectionId ?? null} />}

      {tab === "fees" && <FamilyFees summary={await studentFeeSummary(actor, id)} currency={(await schoolSettings(actor.schoolId!)).currency} />}
    </>
  );
}

async function ResultsTab({ actorPromise, studentId }: { actorPromise: ReturnType<typeof studentResultsOverview>; studentId: string }) {
  const rows = await actorPromise;
  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState title="No results yet" />
      ) : (
        <Table>
          <THead><TR><TH>Examination</TH><TH>Total</TH><TH>%</TH><TH>Grade</TH><TH>Rank</TH><TH>Result</TH><TH /></TR></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.exam.id}>
                <TD className="font-medium">{r.exam.name}<p className="text-xs text-muted-foreground">{formatDate(r.exam.startDate)}{r.exam.status !== "PUBLISHED" && " · not published"}</p></TD>
                <TD label="Total" className="tabular-nums">{r.result.totalObtained}/{r.result.totalMax}</TD>
                <TD label="%">{formatPercent(r.result.percent)}</TD>
                <TD label="Grade"><Badge>{r.result.grade}</Badge></TD>
                <TD label="Rank" className="tabular-nums">{r.rank ? `${r.rank}/${r.classSize}` : "—"}</TD>
                <TD label="Result"><StatusBadge status={r.result.incomplete ? "PENDING" : r.result.passed ? "PASS" : "FAIL"} /></TD>
                <TD className="text-right"><ButtonLink size="sm" variant="outline" href={`/results/${r.exam.id}/${studentId}`}>Report card</ButtonLink></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

async function AssignmentsTab({ studentId, sectionId }: { studentId: string; sectionId: string | null }) {
  // Access to the student was already verified by getStudentProfile above.
  const assignments = sectionId
    ? await db.assignment.findMany({ where: { sectionId, status: { not: "DRAFT" } }, orderBy: { dueDate: "desc" }, include: { subject: true, submissions: { where: { studentId } } } })
    : [];
  const now = requestNow();
  return (
    <Card>
      {assignments.length === 0 ? (
        <EmptyState title="No assignments" />
      ) : (
        <Table>
          <THead><TR><TH>Assignment</TH><TH>Subject</TH><TH>Due</TH><TH>Status</TH><TH>Marks</TH></TR></THead>
          <TBody>
            {assignments.map((a) => {
              const sub = a.submissions[0];
              return (
                <TR key={a.id}>
                  <TD><Link href={`/assignments/${a.id}`} className="font-medium hover:text-primary">{a.title}</Link></TD>
                  <TD label="Subject">{a.subject.name}</TD>
                  <TD label="Due">{formatDate(a.dueDate)}</TD>
                  <TD label="Status"><StatusBadge status={sub ? sub.status : a.dueDate.getTime() < now ? "MISSING" : "PENDING"} /></TD>
                  <TD label="Marks" className="tabular-nums">{sub?.marks != null ? `${toNumber(sub.marks)}/${a.maxMarks}` : "—"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
