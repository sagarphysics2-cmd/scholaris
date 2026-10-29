import type { Metadata } from "next";
import { Clock, Coffee, Pencil, Plus, Trash2 } from "lucide-react";
import { ChildSwitcher } from "@/components/people/child-switcher";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { sp } from "@/components/ui/pagination";
import { LinkTabs } from "@/components/ui/tabs";
import { FilterSelect } from "@/components/ui/url-controls";
import { can, isAdmin, requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { DAYS, cn, isoWeekday, todayUTC } from "@/lib/utils";
import { resolveStudentContext } from "@/server/authz/scope";
import { schoolSettings, viewableSections } from "@/server/services/attendance.service";
import { sectionOptions } from "@/server/services/students.service";
import { teacherOptions } from "@/server/services/teachers.service";
import { getTimetable, listPeriods } from "@/server/services/timetable.service";
import { load } from "@/server/page";
import { deleteEntryAction, deletePeriodAction } from "./actions";
import { EntryForm, PeriodForm } from "./forms";

export const metadata: Metadata = { title: "Timetable" };

const SUBJECT_TINTS = ["bg-[color-mix(in_oklch,var(--chart-1),transparent_88%)] border-l-[var(--chart-1)]", "bg-[color-mix(in_oklch,var(--chart-2),transparent_88%)] border-l-[var(--chart-2)]", "bg-[color-mix(in_oklch,var(--chart-3),transparent_88%)] border-l-[var(--chart-3)]", "bg-[color-mix(in_oklch,var(--chart-4),transparent_86%)] border-l-[var(--chart-4)]", "bg-[color-mix(in_oklch,var(--chart-5),transparent_86%)] border-l-[var(--chart-5)]", "bg-[color-mix(in_oklch,var(--chart-6),transparent_88%)] border-l-[var(--chart-6)]"];

export default async function TimetablePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("timetable.read");
  const params = await searchParams;
  const tab = sp(params, "tab") === "periods" && can(actor, "timetable.manage") ? "periods" : "grid";
  const schoolId = actor.schoolId!;
  const [periods, settings] = await Promise.all([listPeriods(schoolId), schoolSettings(schoolId)]);
  const ctx = actor.parentId ? await load(resolveStudentContext(actor, sp(params, "studentId"))) : null;

  let sectionId = sp(params, "sectionId");
  const teacherId = sp(params, "teacherId");
  const admin = isAdmin(actor);
  const sections = admin || actor.teacherId ? await viewableSections(actor) : [];
  const allSections = actor.teacherId && !admin ? await sectionOptions(schoolId) : sections;
  if (admin && !sectionId && !teacherId) sectionId = sections[0]?.value;

  const tt = tab === "grid" ? await load(getTimetable(actor, { sectionId, teacherId, studentId: ctx?.studentId ?? undefined })) : null;
  const days = settings.schoolDays.sort();
  const today = isoWeekday(todayUTC());

  // Data for the edit dialogs (admins viewing a section).
  let editData: { subjects: Array<{ value: string; label: string }>; teachers: Array<{ value: string; label: string }>; subjectTeacher: Record<string, string> } | null = null;
  if (tt?.canEdit && tt.sectionId) {
    const section = await db.section.findUniqueOrThrow({ where: { id: tt.sectionId }, include: { teacherSubjects: true } });
    const curriculum = await db.classSubject.findMany({ where: { classId: section.classId, academicYearId: section.academicYearId }, include: { subject: true }, orderBy: { subject: { name: "asc" } } });
    editData = {
      subjects: curriculum.map((c) => ({ value: c.subjectId, label: c.subject.name })),
      teachers: await teacherOptions(schoolId),
      subjectTeacher: Object.fromEntries(section.teacherSubjects.map((t) => [t.subjectId, t.teacherId])),
    };
  }
  const tint = new Map<string, string>();
  const tintFor = (subjectId: string) => {
    if (!tint.has(subjectId)) tint.set(subjectId, SUBJECT_TINTS[tint.size % SUBJECT_TINTS.length]!);
    return tint.get(subjectId)!;
  };

  const tabs = can(actor, "timetable.manage")
    ? [
        { key: "grid", label: "Timetable", href: "/timetable" },
        { key: "periods", label: "Bell schedule", href: "/timetable?tab=periods" },
      ]
    : null;

  return (
    <>
      <PageHeader title="Timetable" description={tt?.title ? `${tt.title} · ${tt.year.name}` : "Weekly lesson schedule."} />
      {tabs && <LinkTabs tabs={tabs} active={tab} />}
      {ctx && <ChildSwitcher items={ctx.children} active={ctx.studentId} basePath="/timetable" />}

      {tab === "periods" ? (
        <Card>
          <CardHeader title="Bell schedule" description="Periods used by every class timetable." icon={<Clock />} action={<ModalButton size="sm" icon={<Plus />} label="Add period" title="Add period"><PeriodForm defaults={{ name: "", startTime: "", endTime: "", sortOrder: (periods.at(-1)?.sortOrder ?? 0) + 1, isBreak: false }} /></ModalButton>} />
          <ul className="divide-y">
            {periods.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-5 py-3">
                <span className="w-6 text-sm tabular-nums text-muted-foreground">{p.sortOrder}</span>
                <span className="flex-1 font-medium">{p.isBreak && <Coffee className="mr-1.5 inline size-4 text-muted-foreground" />}{p.name}</span>
                <span className="text-sm tabular-nums text-muted-foreground">{p.startTime} – {p.endTime}</span>
                <ModalButton variant="ghost" size="icon-sm" icon={<Pencil />} ariaLabel={`Edit ${p.name}`} title={`Edit ${p.name}`}><PeriodForm id={p.id} defaults={p} /></ModalButton>
                <ConfirmAction action={deletePeriodAction.bind(null, p.id)} variant="danger-ghost" size="icon-sm" icon={<Trash2 />} ariaLabel={`Delete ${p.name}`} title={`Delete ${p.name}?`} description="Periods with scheduled lessons cannot be deleted." confirmLabel="Delete" />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          {(admin || actor.teacherId) && (
            <Toolbar>
              <FilterSelect param="sectionId" label="View section" placeholder={actor.teacherId && !admin ? "My timetable" : "Choose section"} options={allSections} fallback={teacherId ? undefined : sectionId} />
              {admin && <FilterSelect param="teacherId" label="View teacher" placeholder="…or a teacher" options={await teacherOptions(schoolId)} />}
              {tt?.canEdit && <p className="text-sm text-muted-foreground sm:ml-auto">Click a slot to add or change a lesson.</p>}
            </Toolbar>
          )}
          {!tt || tt.mode === "none" ? (
            <EmptyState title="Choose a section or teacher" />
          ) : periods.length === 0 ? (
            <EmptyState title="No periods configured" description="Set up the bell schedule first." />
          ) : (
            <>
              {/* Desktop/tablet grid */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="w-28 border-b bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Period</th>
                      {days.map((d) => (
                        <th key={d} className={cn("border-b bg-muted/40 px-2 py-2 text-left text-xs font-semibold uppercase text-muted-foreground", d === today && "text-primary")}>
                          {DAYS[d - 1]} {d === today && <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Today</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-3 py-2 align-top">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs tabular-nums text-muted-foreground">{p.startTime}–{p.endTime}</p>
                        </td>
                        {p.isBreak ? (
                          <td colSpan={days.length} className="bg-muted/30 px-3 py-2 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">{p.name}</td>
                        ) : (
                          days.map((d) => {
                            const e = tt.entries.find((x) => x.dayOfWeek === d && x.periodId === p.id);
                            const cell = e ? (
                              <div className={cn("h-full rounded-lg border-l-4 px-2.5 py-1.5 text-left", tintFor(e.subjectId))}>
                                <p className="truncate font-medium">{e.subject.name}</p>
                                <p className="truncate text-xs text-muted-foreground">{tt.mode === "teacher" ? `${e.section.class.name}-${e.section.name}` : `${e.teacher.user.firstName} ${e.teacher.user.lastName}`}</p>
                                {e.room && <p className="truncate text-[11px] text-muted-foreground">{e.room}</p>}
                              </div>
                            ) : (
                              <div className="grid h-full min-h-14 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground/60">{tt.canEdit ? "+ Add" : "Free"}</div>
                            );
                            return (
                              <td key={d} className="h-20 p-1 align-top">
                                {tt.canEdit && editData && tt.sectionId ? (
                                  <div className="relative h-full">
                                    <ModalButton variant="ghost" className="h-full w-full p-0 hover:bg-transparent [&>*]:w-full" title={`${DAYS[d - 1]} · ${p.name}`} description={`${p.startTime}–${p.endTime}`} label={cell} ariaLabel={`${DAYS[d - 1]} ${p.name}: ${e ? e.subject.name : "empty"}`}>
                                      <div className="space-y-4">
                                        <EntryForm sectionId={tt.sectionId} dayOfWeek={d} periodId={p.id} subjects={editData.subjects} teachers={editData.teachers} subjectTeacher={editData.subjectTeacher} defaults={e ? { subjectId: e.subjectId, teacherId: e.teacherId, room: e.room } : undefined} />
                                        {e && (
                                          <div className="border-t pt-4">
                                            <ConfirmAction action={deleteEntryAction.bind(null, e.id)} variant="danger-ghost" size="sm" icon={<Trash2 />} label="Remove lesson" title="Remove this lesson?" description="The slot will become a free period." confirmLabel="Remove" />
                                          </div>
                                        )}
                                      </div>
                                    </ModalButton>
                                  </div>
                                ) : (
                                  cell
                                )}
                              </td>
                            );
                          })
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile: one list per day, today first */}
              <div className="divide-y md:hidden">
                {[...days].sort((a, b) => (a === today ? -1 : b === today ? 1 : a - b)).map((d) => {
                  const lessons = periods.map((p) => ({ p, e: tt.entries.find((x) => x.dayOfWeek === d && x.periodId === p.id) })).filter((x) => x.e || x.p.isBreak);
                  return (
                    <section key={d} className="p-4">
                      <h3 className={cn("mb-2 text-sm font-semibold", d === today && "text-primary")}>{DAYS[d - 1]}{d === today && " · Today"}</h3>
                      <ul className="space-y-2">
                        {lessons.map(({ p, e }) =>
                          p.isBreak ? (
                            <li key={p.id} className="rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">{p.startTime} · {p.name}</li>
                          ) : (
                            <li key={p.id} className={cn("flex gap-3 rounded-lg border-l-4 px-3 py-2", tintFor(e!.subjectId))}>
                              <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{p.startTime}</span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{e!.subject.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">{tt.mode === "teacher" ? `${e!.section.class.name}-${e!.section.name}` : `${e!.teacher.user.firstName} ${e!.teacher.user.lastName}`}{e!.room ? ` · ${e!.room}` : ""}</span>
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      )}
    </>
  );
}
