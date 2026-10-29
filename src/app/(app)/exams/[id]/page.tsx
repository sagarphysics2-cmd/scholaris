import type { Metadata } from "next";
import { CheckCircle2, ClipboardPen, Megaphone, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { canAny, requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { formatDate, toISODate } from "@/lib/utils";
import { getExam, markablePapers } from "@/server/services/exams.service";
import { deleteExamAction, deleteExamSubjectAction, saveExamAction, saveExamSubjectAction, setExamStatusAction } from "../actions";
import { ExamForm, PaperForm } from "../forms";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Examination" };

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("exams.read");
  const { exam, papers, canManage } = await load(getExam(actor, id));
  const canMark = canAny(actor, "marks.enter", "exams.manage");
  const entries = canMark ? await markablePapers(actor, id) : [];
  let classes: Array<{ value: string; label: string }> = [];
  let subjectsByClass: Record<string, Array<{ value: string; label: string }>> = {};
  if (canManage) {
    const cs = await db.classSubject.findMany({ where: { academicYearId: exam.academicYearId }, include: { class: true, subject: true }, orderBy: [{ class: { level: "asc" } }, { subject: { name: "asc" } }] });
    classes = [...new Map(cs.map((c) => [c.classId, { value: c.classId, label: c.class.name }])).values()];
    subjectsByClass = cs.reduce<Record<string, Array<{ value: string; label: string }>>>((acc, c) => ((acc[c.classId] ??= []).push({ value: c.subjectId, label: c.subject.name }), acc), {});
  }
  const range = { minDate: toISODate(exam.startDate), maxDate: toISODate(exam.endDate) };
  const nextStatus = { DRAFT: "SCHEDULED", SCHEDULED: "ONGOING", ONGOING: "COMPLETED" } as const;
  const advance = nextStatus[exam.status as keyof typeof nextStatus];

  return (
    <>
      <PageHeader
        title={exam.name}
        description={`${exam.term ? `${exam.term} · ` : ""}${formatDate(exam.startDate)} – ${formatDate(exam.endDate)} · ${exam.academicYear.name}`}
        breadcrumbs={[{ label: "Examinations", href: "/exams" }, { label: exam.name }]}
        actions={
          <>
            <StatusBadge status={exam.status} label={exam.status === "PUBLISHED" ? "Results published" : undefined} />
            {exam.status === "PUBLISHED" && <ButtonLink href={`/results?examId=${exam.id}`} variant="outline"><Trophy /> View results</ButtonLink>}
            {canManage && (
              <>
                <ModalButton variant="outline" icon={<Pencil />} label="Edit" title="Edit examination">
                  <ExamForm action={saveExamAction.bind(null, exam.id)} defaults={{ ...exam, startDate: toISODate(exam.startDate), endDate: toISODate(exam.endDate) }} />
                </ModalButton>
                {advance && <ConfirmAction action={setExamStatusAction.bind(null, exam.id, advance)} variant="outline" icon={<CheckCircle2 />} label={`Mark ${advance.toLowerCase()}`} title={`Mark as ${advance.toLowerCase()}?`} description="Changes the examination status." confirmLabel="Confirm" confirmVariant="primary" />}
                {exam.status !== "PUBLISHED" && exam.status !== "DRAFT" && (
                  <ConfirmAction action={setExamStatusAction.bind(null, exam.id, "PUBLISHED")} variant="primary" icon={<Megaphone />} label="Publish results" title="Publish results?" description="Students and parents will be able to see results and will be notified. Teachers will no longer be able to change marks." confirmLabel="Publish" confirmVariant="primary" />
                )}
                {exam.status === "PUBLISHED" && <ConfirmAction action={setExamStatusAction.bind(null, exam.id, "COMPLETED")} variant="outline" label="Unpublish" title="Unpublish results?" description="Results will be hidden from students and parents." confirmLabel="Unpublish" />}
                <ConfirmAction action={deleteExamAction.bind(null, exam.id)} variant="ghost" icon={<Trash2 />} ariaLabel="Delete examination" title="Delete examination?" description="Only examinations without marks can be deleted." confirmLabel="Delete" />
              </>
            )}
          </>
        }
      />
      {exam.description && <p className="-mt-3 mb-6 max-w-3xl text-sm text-muted-foreground">{exam.description}</p>}

      {canMark && entries.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Enter marks" description={exam.status === "PUBLISHED" && !canManage ? "Results are published — marks are read-only." : "Choose a paper and section."} icon={<ClipboardPen />} />
          <div className="flex flex-wrap gap-2 p-5">
            {entries.map((e) => (
              <ButtonLink key={`${e.paperId}-${e.sectionId}`} variant="outline" size="sm" href={`/exams/${exam.id}/marks?paperId=${e.paperId}&sectionId=${e.sectionId}`}>{e.label}</ButtonLink>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Schedule"
          description={`${papers.length} paper${papers.length === 1 ? "" : "s"}`}
          action={canManage && exam.status !== "PUBLISHED" && <ModalButton size="sm" icon={<Plus />} label="Add paper" title="Add paper"><PaperForm action={saveExamSubjectAction.bind(null, exam.id, undefined)} classes={classes} subjectsByClass={subjectsByClass} {...range} /></ModalButton>}
        />
        {papers.length === 0 ? (
          <EmptyState title="No papers scheduled" />
        ) : (
          <Table>
            <THead><TR><TH>Date</TH><TH>Time</TH><TH>Class</TH><TH>Subject</TH><TH>Max / Pass</TH><TH>Room</TH>{canManage && <><TH>Marks</TH><TH className="text-right">Actions</TH></>}</TR></THead>
            <TBody>
              {papers.map((p) => (
                <TR key={p.id}>
                  <TD label="Date" className="whitespace-nowrap font-medium">{formatDate(p.examDate)}</TD>
                  <TD label="Time" className="tabular-nums">{p.startTime ? `${p.startTime}–${p.endTime ?? ""}` : "—"}</TD>
                  <TD label="Class">{p.class.name}</TD>
                  <TD label="Subject"><Badge tone="primary">{p.subject.name}</Badge></TD>
                  <TD label="Max / Pass" className="tabular-nums">{p.maxMarks} / {p.passingMarks}</TD>
                  <TD label="Room">{p.room ?? "—"}</TD>
                  {canManage && (
                    <>
                      <TD label="Marks" className="tabular-nums">{p._count.marks}</TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          {exam.status !== "PUBLISHED" && (
                            <ModalButton variant="ghost" size="icon-sm" icon={<Pencil />} ariaLabel="Edit paper" title={`Edit ${p.subject.name} — ${p.class.name}`}>
                              <PaperForm action={saveExamSubjectAction.bind(null, exam.id, p.id)} classes={classes} subjectsByClass={subjectsByClass} {...range} defaults={{ ...p, examDate: toISODate(p.examDate) }} />
                            </ModalButton>
                          )}
                          {p._count.marks === 0 && <ConfirmAction action={deleteExamSubjectAction.bind(null, exam.id, p.id)} variant="danger-ghost" size="icon-sm" icon={<Trash2 />} ariaLabel="Remove paper" title="Remove paper?" description={`${p.subject.name} for ${p.class.name}`} confirmLabel="Remove" />}
                        </div>
                      </TD>
                    </>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
