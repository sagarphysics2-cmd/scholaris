import type { Metadata } from "next";
import { CalendarClock, CheckCircle2, Lock, MessageSquare, Pencil, Send, Trash2, Unlock, X } from "lucide-react";
import { FileList } from "@/components/files/file-list";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { DescriptionList } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { sp } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/actor";
import { formatDateTime, fullName, relativeTime, requestNow, toNumber } from "@/lib/utils";
import { getAssignment } from "@/server/services/assignments.service";
import { deleteAssignmentAction, gradeSubmissionAction, removeAttachmentAction, setAssignmentStatusAction, submitAssignmentAction } from "../actions";
import { GradeForm, SubmissionForm } from "../forms";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Assignment" };

export default async function AssignmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const actor = await requirePermission("assignments.read");
  const { assignment: a, canManage, mySubmission, roster } = await load(getAssignment(actor, id, sp(await searchParams, "studentId")));
  const overdue = a.dueDate.getTime() < requestNow();
  const submitted = roster.filter((r) => r.student.submissions[0]);
  const graded = submitted.filter((r) => r.student.submissions[0]!.status === "GRADED");
  const missing = roster.filter((r) => !r.student.submissions[0]);
  const isStudent = Boolean(actor.studentId);

  return (
    <>
      <PageHeader
        title={a.title}
        description={`${a.subject.name} · ${a.section.class.name} – ${a.section.name} · ${a.teacher.user.firstName} ${a.teacher.user.lastName}`}
        breadcrumbs={[{ label: "Assignments", href: "/assignments" }, { label: a.title }]}
        actions={
          canManage && (
            <>
              <ButtonLink href={`/assignments/${a.id}/edit`} variant="outline"><Pencil /> Edit</ButtonLink>
              {a.status === "PUBLISHED" && <ConfirmAction action={setAssignmentStatusAction.bind(null, a.id, "CLOSED")} icon={<Lock />} label="Close" title="Close submissions?" description="Students will no longer be able to submit or resubmit." confirmLabel="Close assignment" confirmVariant="primary" />}
              {a.status !== "PUBLISHED" && <ConfirmAction action={setAssignmentStatusAction.bind(null, a.id, "PUBLISHED")} icon={a.status === "DRAFT" ? <Send /> : <Unlock />} label={a.status === "DRAFT" ? "Publish" : "Reopen"} title={a.status === "DRAFT" ? "Publish assignment?" : "Reopen submissions?"} description={a.status === "DRAFT" ? "Students and parents will be notified." : "Students will be able to submit again."} confirmLabel="Confirm" confirmVariant="primary" />}
              {submitted.length === 0 && <ConfirmAction action={deleteAssignmentAction.bind(null, a.id)} icon={<Trash2 />} label="Delete" title="Delete assignment?" description="This cannot be undone." confirmLabel="Delete" />}
            </>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Instructions" action={<StatusBadge status={a.status} />} />
            <CardContent className="space-y-4">
              <p className="whitespace-pre-line text-sm leading-relaxed">{a.description}</p>
              <FileList
                files={a.attachments}
                action={canManage ? (f) => <ConfirmAction action={removeAttachmentAction.bind(null, a.id, f.id)} variant="ghost" size="icon-sm" icon={<X />} ariaLabel={`Remove ${f.originalName}`} title="Remove attachment?" description={f.originalName} confirmLabel="Remove" /> : undefined}
              />
            </CardContent>
          </Card>

          {!canManage && roster.length === 0 && (
            <Card>
              <CardHeader title={isStudent ? "Your submission" : "Submission"} icon={<Send />} action={mySubmission && <StatusBadge status={mySubmission.status} />} />
              <CardContent className="space-y-4">
                {mySubmission && (
                  <div className="space-y-3 rounded-lg bg-muted/50 p-4 text-sm">
                    <p className="text-muted-foreground">Submitted {formatDateTime(mySubmission.submittedAt)}{mySubmission.status === "LATE" && " (late)"}</p>
                    {mySubmission.content && <p className="whitespace-pre-line">{mySubmission.content}</p>}
                    <FileList files={mySubmission.files} />
                  </div>
                )}
                {mySubmission?.status === "GRADED" && (
                  <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success-soft p-4">
                    <CheckCircle2 className="mt-0.5 size-5 text-success" />
                    <div>
                      <p className="font-semibold">Grade: {toNumber(mySubmission.marks)} / {a.maxMarks}</p>
                      {mySubmission.feedback && <p className="mt-1 text-sm"><MessageSquare className="mr-1 inline size-3.5" />{mySubmission.feedback}</p>}
                    </div>
                  </div>
                )}
                {isStudent && a.status === "PUBLISHED" && mySubmission?.status !== "GRADED" && (
                  <SubmissionForm action={submitAssignmentAction.bind(null, a.id)} defaultContent={mySubmission?.content} resubmit={Boolean(mySubmission)} />
                )}
                {!mySubmission && (!isStudent || a.status === "CLOSED") && <p className="text-sm text-muted-foreground">{a.status === "CLOSED" ? "Submissions are closed." : "Not submitted yet."}</p>}
              </CardContent>
            </Card>
          )}

          {roster.length > 0 && (
            <Card>
              <CardHeader title="Submissions" description={`${submitted.length} submitted · ${graded.length} graded · ${missing.length} missing`} />
              <Table>
                <THead><TR><TH>Student</TH><TH>Status</TH><TH>Submitted</TH><TH>Marks</TH>{canManage && <TH className="text-right">Grade</TH>}</TR></THead>
                <TBody>
                  {roster.map((r) => {
                    const s = r.student.submissions[0];
                    const name = fullName(r.student.user);
                    return (
                      <TR key={r.id}>
                        <TD><span className="flex items-center gap-2 font-medium"><Avatar name={name} fileId={r.student.user.avatarFileId} size="sm" />{name}</span></TD>
                        <TD label="Status"><StatusBadge status={s ? s.status : overdue ? "MISSING" : "PENDING"} label={!s && !overdue ? "Not yet" : undefined} /></TD>
                        <TD label="Submitted" className="whitespace-nowrap text-sm">{s ? formatDateTime(s.submittedAt) : "—"}</TD>
                        <TD label="Marks" className="tabular-nums">{s?.marks != null ? `${toNumber(s.marks)}/${a.maxMarks}` : "—"}</TD>
                        {canManage && (
                          <TD className="text-right">
                            {s && (
                              <ModalButton size="sm" variant={s.status === "GRADED" ? "ghost" : "secondary"} label={s.status === "GRADED" ? "Regrade" : "Grade"} title={`Grade — ${name}`} dialogSize="lg">
                                <div className="space-y-4">
                                  <div className="rounded-lg bg-muted/50 p-3 text-sm">
                                    {s.content ? <p className="whitespace-pre-line">{s.content}</p> : <p className="text-muted-foreground">No text answer.</p>}
                                  </div>
                                  <FileList files={s.files} />
                                  <GradeForm action={gradeSubmissionAction.bind(null, s.id, a.id)} maxMarks={a.maxMarks} defaults={{ marks: s.marks === null ? null : toNumber(s.marks), feedback: s.feedback }} />
                                </div>
                              </ModalButton>
                            )}
                          </TD>
                        )}
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              {roster.length === 0 && <EmptyState title="No students in this section" />}
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <StatCard label={overdue ? "Was due" : "Due"} value={formatDateTime(a.dueDate)} hint={relativeTime(a.dueDate)} icon={<CalendarClock />} tone={overdue ? "danger" : "primary"} />
          <Card>
            <CardHeader title="Details" />
            <CardContent>
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Subject", value: <Badge tone="primary">{a.subject.name}</Badge> },
                  { label: "Class", value: `${a.section.class.name} – ${a.section.name}` },
                  { label: "Maximum marks", value: a.maxMarks },
                  { label: "Created", value: formatDateTime(a.createdAt) },
                  ...(roster.length ? [{ label: "Average mark", value: graded.length ? `${(graded.reduce((n, r) => n + toNumber(r.student.submissions[0]!.marks), 0) / graded.length).toFixed(1)} / ${a.maxMarks}` : "—" }] : []),
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
