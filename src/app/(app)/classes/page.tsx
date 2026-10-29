import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Pencil, Plus, School, Trash2, UserRound, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { can, requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";
import { listClassesWithSections } from "@/server/services/academics.service";
import { teacherOptions } from "@/server/services/teachers.service";
import { deleteClassAction, saveClassAction, saveSectionAction, setCurriculumAction } from "./actions";
import { ClassForm, CurriculumForm, SectionForm } from "./forms";

export const metadata: Metadata = { title: "Classes & Sections" };

export default async function ClassesPage() {
  const actor = await requirePermission("classes.read");
  const { classes, year } = await listClassesWithSections(actor);
  const canWrite = can(actor, "classes.write");
  const canCurriculum = can(actor, "subjects.write");
  const [teachers, subjects] = canWrite
    ? await Promise.all([teacherOptions(actor.schoolId!), db.subject.findMany({ where: { schoolId: actor.schoolId!, status: "ACTIVE" }, orderBy: { name: "asc" } })])
    : [[], []];
  const classOpts = classes.map((c) => ({ value: c.id, label: c.name }));
  const totalStudents = classes.reduce((n, c) => n + c.sections.reduce((m, s) => m + s._count.enrollments, 0), 0);

  return (
    <>
      <PageHeader
        title={actor.role === "TEACHER" ? "My Classes" : "Classes & Sections"}
        description={year ? `${year.name} · ${classes.length} classes · ${classes.reduce((n, c) => n + c.sections.length, 0)} sections · ${totalStudents} students` : "No academic year configured."}
        actions={
          canWrite && (
            <>
              <ModalButton variant="outline" label="New class" icon={<Plus />} title="Create class"><ClassForm action={saveClassAction.bind(null, undefined)} /></ModalButton>
              <ModalButton label="New section" icon={<Plus />} title="Create section" description={`For academic year ${year?.name ?? ""}`}>
                <SectionForm action={saveSectionAction.bind(null, undefined)} classes={classOpts} teachers={teachers} />
              </ModalButton>
            </>
          )
        }
      />
      {classes.length === 0 ? (
        <Card><EmptyState icon={<School />} title="No classes yet" description={canWrite ? "Create classes (grades) and then add sections." : "You are not assigned to any classes."} /></Card>
      ) : (
        <div className="space-y-6">
          {classes.map((c) => (
            <Card key={c.id}>
              <CardHeader
                title={c.name}
                icon={<School />}
                description={
                  <span className="flex flex-wrap gap-1 pt-1">
                    {c.classSubjects.length ? c.classSubjects.map((cs) => <Badge key={cs.id}>{cs.subject.name}</Badge>) : "No subjects assigned"}
                  </span>
                }
                action={
                  <>
                    {canCurriculum && (
                      <ModalButton size="sm" variant="outline" icon={<BookOpen />} label="Subjects" title={`${c.name} subjects`} description={year?.name}>
                        <CurriculumForm action={setCurriculumAction} classId={c.id} subjects={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))} selected={c.classSubjects.map((cs) => cs.subjectId)} />
                      </ModalButton>
                    )}
                    {canWrite && (
                      <ModalButton size="icon-sm" variant="ghost" icon={<Pencil />} ariaLabel={`Edit ${c.name}`} title={`Edit ${c.name}`}>
                        <ClassForm action={saveClassAction.bind(null, c.id)} defaults={{ name: c.name, level: c.level }} />
                      </ModalButton>
                    )}
                    {canWrite && c.sections.length === 0 && (
                      <ConfirmAction action={deleteClassAction.bind(null, c.id)} variant="danger-ghost" size="icon-sm" icon={<Trash2 />} ariaLabel={`Delete ${c.name}`} title={`Delete ${c.name}?`} description="This class has no sections this year. Classes with history cannot be deleted." confirmLabel="Delete" />
                    )}
                  </>
                }
              />
              {c.sections.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">No sections this year.</p>
              ) : (
                <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                  {c.sections.map((s) => {
                    const fill = s.capacity ? (s._count.enrollments / s.capacity) * 100 : 0;
                    return (
                      <Link key={s.id} href={`/classes/${s.id}`} className="group rounded-xl border p-4 transition hover:border-primary/50 hover:shadow-sm">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-lg font-semibold group-hover:text-primary">Section {s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.room ? `Room ${s.room}` : "No room"}</p>
                          </div>
                          <Badge tone="primary"><Users className="size-3" /> {s._count.enrollments}{s.capacity ? `/${s.capacity}` : ""}</Badge>
                        </div>
                        {s.capacity && <div className="mt-3"><ProgressBar value={fill} tone={fill >= 100 ? "danger" : fill > 85 ? "warning" : "primary"} label="Capacity used" /></div>}
                        <p className="mt-3 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                          <UserRound className="size-3.5 shrink-0" /> {s.classTeacher ? fullName(s.classTeacher.user) : "No class teacher"}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
