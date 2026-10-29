import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, NotebookPen, Paperclip, Plus } from "lucide-react";
import { ChildSwitcher } from "@/components/people/child-switcher";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParams, sp } from "@/components/ui/pagination";
import { LinkTabs } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterSelect, SearchInput } from "@/components/ui/url-controls";
import { can, requirePermission } from "@/lib/auth/actor";
import { cn, formatDateTime, relativeTime, requestNow, toNumber } from "@/lib/utils";
import { resolveStudentContext } from "@/server/authz/scope";
import { assignmentFormOptions, listAssignments } from "@/server/services/assignments.service";

export const metadata: Metadata = { title: "Assignments" };

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("assignments.read");
  const params = await searchParams;
  const learner = Boolean(actor.studentId || actor.parentId);
  const when = sp(params, "when") ?? "upcoming";
  const { page, pageSize, skip, take } = pageParams(params, 15);
  const ctx = actor.parentId ? await resolveStudentContext(actor, sp(params, "studentId")) : null;
  const { total, rows } = await listAssignments(actor, { when: when === "all" ? undefined : when, q: sp(params, "q"), sectionId: sp(params, "sectionId"), subjectId: sp(params, "subjectId"), status: sp(params, "status"), studentId: ctx?.studentId ?? undefined, skip, take });
  const canCreate = can(actor, "assignments.write");
  const opts = !learner ? await assignmentFormOptions(actor) : null;
  const base = (w: string) => `/assignments?when=${w}${ctx?.studentId ? `&studentId=${ctx.studentId}` : ""}`;
  const now = requestNow();

  return (
    <>
      <PageHeader title="Assignments" description={learner ? "Homework and projects for your class." : "Create assignments, collect submissions and grade work."} actions={canCreate && <ButtonLink href="/assignments/new"><Plus /> New assignment</ButtonLink>} />
      {ctx && <ChildSwitcher items={ctx.children} active={ctx.studentId} basePath="/assignments" params={{ when }} />}
      <LinkTabs active={when} tabs={[{ key: "upcoming", label: "Upcoming", href: base("upcoming") }, { key: "past", label: "Past due", href: base("past") }, { key: "all", label: "All", href: base("all") }]} />
      <Card>
        {!learner && opts && (
          <Toolbar>
            <SearchInput placeholder="Search by title…" />
            <FilterSelect param="sectionId" label="Section" placeholder="All sections" options={opts.sections} />
            <FilterSelect param="status" label="Status" placeholder="Any status" options={[{ value: "PUBLISHED", label: "Published" }, { value: "DRAFT", label: "Draft" }, { value: "CLOSED", label: "Closed" }]} />
          </Toolbar>
        )}
        {rows.length === 0 ? (
          <EmptyState icon={<NotebookPen />} title={when === "upcoming" ? "Nothing due" : "No assignments"} description={learner ? "You're all caught up." : canCreate ? "Create an assignment for one of your classes." : undefined} />
        ) : learner ? (
          <ul className="divide-y">
            {rows.map((a) => {
              const sub = a.submissions[0];
              const overdue = !sub && a.dueDate.getTime() < now;
              const state = sub ? sub.status : overdue ? "MISSING" : "PENDING";
              return (
                <li key={a.id}>
                  <Link href={`/assignments/${a.id}${ctx?.studentId ? `?studentId=${ctx.studentId}` : ""}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-muted/50 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone="primary">{a.subject.name}</Badge>{a._count.attachments > 0 && <Paperclip className="size-3.5 text-muted-foreground" aria-label="Has attachments" />}</div>
                      <p className="mt-1 font-medium">{a.title}</p>
                      <p className={cn("mt-0.5 flex items-center gap-1.5 text-sm", overdue ? "text-danger" : "text-muted-foreground")}><CalendarClock className="size-3.5" /> Due {formatDateTime(a.dueDate)} · {relativeTime(a.dueDate)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {sub?.status === "GRADED" && <span className="text-sm font-semibold tabular-nums">{toNumber(sub.marks)}/{a.maxMarks}</span>}
                      <StatusBadge status={state} label={state === "PENDING" ? "To do" : undefined} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Table>
            <THead><TR><TH>Assignment</TH><TH>Class</TH><TH>Due</TH><TH>Submissions</TH><TH>Status</TH></TR></THead>
            <TBody>
              {rows.map((a) => (
                <TR key={a.id}>
                  <TD>
                    <Link href={`/assignments/${a.id}`} className="font-medium hover:text-primary">{a.title}</Link>
                    <p className="text-xs text-muted-foreground">{a.subject.name} · {a.teacher.user.firstName} {a.teacher.user.lastName}</p>
                  </TD>
                  <TD label="Class">{a.section.class.name} – {a.section.name}</TD>
                  <TD label="Due" className="whitespace-nowrap">{formatDateTime(a.dueDate)}</TD>
                  <TD label="Submissions" className="tabular-nums">{a._count.submissions}/{a.section._count.enrollments}</TD>
                  <TD label="Status"><StatusBadge status={a.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/assignments" searchParams={params} />
      </Card>
    </>
  );
}
