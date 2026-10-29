import type { Metadata } from "next";
import { Archive, ArchiveRestore, BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { sp } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SearchInput } from "@/components/ui/url-controls";
import { can, requirePermission } from "@/lib/auth/actor";
import { fullName } from "@/lib/utils";
import { listSubjects } from "@/server/services/academics.service";
import { archiveSubjectAction, deleteSubjectAction, saveSubjectAction } from "./actions";
import { SubjectForm } from "./subject-form";

export const metadata: Metadata = { title: "Subjects" };

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("subjects.read");
  const q = sp(await searchParams, "q");
  const subjects = await listSubjects(actor, q);
  const canWrite = can(actor, "subjects.write");
  return (
    <>
      <PageHeader
        title="Subjects"
        description="Subjects offered by the school, the classes that study them and who teaches them this year."
        actions={canWrite && <ModalButton label="New subject" icon={<Plus />} title="Create subject"><SubjectForm action={saveSubjectAction.bind(null, undefined)} /></ModalButton>}
      />
      <Card>
        <Toolbar><SearchInput placeholder="Search subjects…" /></Toolbar>
        {subjects.length === 0 ? (
          <EmptyState icon={<BookOpen />} title="No subjects found" />
        ) : (
          <Table>
            <THead><TR><TH>Subject</TH><TH>Code</TH><TH>Classes</TH><TH>Teachers</TH><TH>Status</TH>{canWrite && <TH className="text-right">Actions</TH>}</TR></THead>
            <TBody>
              {subjects.map((s) => {
                const teachers = [...new Map(s.teacherSubjects.map((t) => [t.teacherId, fullName(t.teacher.user)])).values()];
                return (
                  <TR key={s.id}>
                    <TD><p className="font-medium">{s.name}</p>{s.description && <p className="line-clamp-1 max-w-xs text-xs text-muted-foreground max-md:hidden">{s.description}</p>}</TD>
                    <TD label="Code"><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{s.code}</code></TD>
                    <TD label="Classes"><div className="flex flex-wrap justify-end gap-1 md:justify-start">{s.classSubjects.map((c) => <Badge key={c.id}>{c.class.name}</Badge>)}{s.classSubjects.length === 0 && "—"}</div></TD>
                    <TD label="Teachers" className="text-sm">{teachers.join(", ") || "—"}</TD>
                    <TD label="Status"><StatusBadge status={s.status} /></TD>
                    {canWrite && (
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          <ModalButton variant="ghost" size="icon-sm" icon={<Pencil />} ariaLabel={`Edit ${s.name}`} title={`Edit ${s.name}`}>
                            <SubjectForm action={saveSubjectAction.bind(null, s.id)} defaults={{ name: s.name, code: s.code, description: s.description }} />
                          </ModalButton>
                          {s.status === "ACTIVE" ? (
                            <ConfirmAction action={archiveSubjectAction.bind(null, s.id, true)} variant="ghost" size="icon-sm" icon={<Archive />} ariaLabel={`Archive ${s.name}`} title={`Archive ${s.name}?`} description="Archived subjects can't be added to new classes, but history is kept." confirmLabel="Archive" />
                          ) : (
                            <ConfirmAction action={archiveSubjectAction.bind(null, s.id, false)} variant="ghost" size="icon-sm" icon={<ArchiveRestore />} ariaLabel={`Restore ${s.name}`} title={`Restore ${s.name}?`} description="The subject will be available again." confirmLabel="Restore" confirmVariant="primary" />
                          )}
                          <ConfirmAction action={deleteSubjectAction.bind(null, s.id)} variant="danger-ghost" size="icon-sm" icon={<Trash2 />} ariaLabel={`Delete ${s.name}`} title={`Delete ${s.name}?`} description="Only subjects that were never used in classes, exams or assignments can be deleted." confirmLabel="Delete" />
                        </div>
                      </TD>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
