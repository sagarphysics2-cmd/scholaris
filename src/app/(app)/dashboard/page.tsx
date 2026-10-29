import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BookOpen, CalendarCheck2, CheckCircle2, GraduationCap, NotebookPen, School, Users, Wallet } from "lucide-react";
import { BarsChart, DonutChart, TrendChart } from "@/components/charts/charts";
import { LearnerDashboard } from "@/components/dashboard/learner-dashboard";
import { Greeting, RecentNotices, TodayTimetable, UpcomingExams } from "@/components/dashboard/widgets";
import { ChildSwitcher } from "@/components/people/child-switcher";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { attendanceTone } from "@/components/ui/misc";
import { sp } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { isAdmin, requireActor } from "@/lib/auth/actor";
import { formatCurrency, formatDate, formatPercent, relativeTime } from "@/lib/utils";
import { resolveStudentContext } from "@/server/authz/scope";
import { adminDashboard, learnerDashboard, parentChildrenCards, teacherDashboard } from "@/server/services/dashboard.service";
import { schoolSettings } from "@/server/services/attendance.service";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  if (!actor.schoolId) {
    return <><Greeting name={actor.firstName} subtitle={today} /><Card><EmptyState icon={<School />} title="No school yet" description="Create a school to get started." action={<ButtonLink href="/schools">Manage schools</ButtonLink>} /></Card></>;
  }

  if (isAdmin(actor)) return <AdminView actor={actor} today={today} />;
  if (actor.teacherId) return <TeacherView actor={actor} today={today} />;

  if (actor.studentId) {
    const data = await learnerDashboard(actor, actor.studentId);
    return (
      <>
        <Greeting name={actor.firstName} subtitle={today} />
        <LearnerDashboard data={data} studentId={actor.studentId} isParent={false} />
      </>
    );
  }

  if (actor.parentId) {
    const ctx = await load(resolveStudentContext(actor, sp(params, "studentId")));
    const cards = await parentChildrenCards(actor);
    const data = ctx.studentId ? await learnerDashboard(actor, ctx.studentId) : null;
    return (
      <>
        <Greeting name={actor.firstName} subtitle={today} />
        {cards.length === 0 ? (
          <Card><EmptyState title="No children linked" description="Ask the school office to link your children to your account." /></Card>
        ) : (
          <>
            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((c) => (
                <Link key={c.id} href={`/dashboard?studentId=${c.id}`} className={`flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs transition hover:border-primary/50 ${c.id === ctx.studentId ? "ring-2 ring-primary" : ""}`}>
                  <Avatar name={c.name} fileId={c.avatarFileId} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="text-sm text-muted-foreground">{c.section}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={attendanceTone(c.attendance) === "primary" ? "neutral" : attendanceTone(c.attendance)}>Attendance {formatPercent(c.attendance)}</Badge>
                      {c.outstanding > 0 && <Badge tone="warning">Due {formatCurrency(c.outstanding, c.currency)}</Badge>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <ChildSwitcher items={ctx.children} active={ctx.studentId} basePath="/dashboard" />
            {data && ctx.studentId && <LearnerDashboard data={data} studentId={ctx.studentId} isParent />}
          </>
        )}
      </>
    );
  }

  return <><Greeting name={actor.firstName} subtitle={today} /><Card><EmptyState title="Nothing to show" /></Card></>;
}

type ActorT = Awaited<ReturnType<typeof requireActor>>;

async function AdminView({ actor, today }: { actor: ActorT; today: string }) {
  const [d, settings] = await Promise.all([adminDashboard(actor), schoolSettings(actor.schoolId!)]);
  const money = (v: number) => formatCurrency(v, settings.currency);
  const att = d.attendance;
  return (
    <>
      <Greeting name={actor.firstName} subtitle={`${today}${d.year ? ` · Academic year ${d.year.name}` : ""}`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={d.counts.students} hint={`${d.counts.parents} parent accounts`} icon={<GraduationCap />} href="/students" />
        <StatCard label="Teachers" value={d.counts.teachers} icon={<Users />} tone="info" href="/teachers" />
        <StatCard label="Classes" value={d.counts.classes} hint={`${d.counts.sections} sections`} icon={<School />} tone="warning" href="/classes" />
        <StatCard
          label="Today's attendance"
          value={att?.today.marked ? formatPercent(att.today.rate) : "Not taken"}
          hint={att ? `${att.today.marked}/${att.today.sections} sections marked` : undefined}
          icon={<CalendarCheck2 />}
          tone="success"
          href="/attendance?tab=overview"
        />
      </div>
      {d.fees && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Fees collected" value={money(d.fees.collected)} hint={`${formatPercent(d.fees.collectionRate)} of ${money(d.fees.billed)}`} icon={<Wallet />} tone="success" href="/fees" />
          <StatCard label="Pending fees" value={money(d.fees.outstanding)} icon={<Wallet />} tone="warning" href="/fees?tab=fees&status=OUTSTANDING" />
          <StatCard label="Overdue fees" value={money(d.fees.overdue.amount)} hint={`${d.fees.overdue.count} items`} icon={<AlertTriangle />} tone="danger" href="/fees?tab=fees&status=OVERDUE" />
          <StatCard label="Need attendance support" value={att?.frequentAbsentees.length ?? 0} hint={`Below ${att?.threshold ?? 75}% or 5+ absences`} icon={<AlertTriangle />} tone="danger" href="/attendance?tab=overview" />
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Attendance trend" description="School-wide attendance rate, last 14 days" action={<ButtonLink href="/attendance?tab=overview" variant="ghost" size="sm">Details</ButtonLink>} />
          <div className="p-4">{att?.trend.length ? <TrendChart data={att.trend} xKey="date" series={[{ key: "rate", label: "Attendance rate", color: "var(--chart-1)" }]} unit="%" yDomain={[60, 100]} /> : <EmptyState title="No attendance yet" />}</div>
        </Card>
        {d.fees ? (
          <Card>
            <CardHeader title="Fee collection" description={d.year?.name} />
            <div className="p-5">
              <DonutChart
                centerValue={formatPercent(d.fees.collectionRate, 0)}
                centerLabel="collected"
                height={190}
                data={[
                  { name: "Collected", value: Math.round(d.fees.collected), color: "var(--status-good)" },
                  { name: "Pending (not due)", value: Math.max(0, Math.round(d.fees.outstanding - d.fees.overdue.amount)), color: "var(--status-warning)" },
                  { name: "Overdue", value: Math.round(d.fees.overdue.amount), color: "var(--status-critical)" },
                ]}
              />
            </div>
          </Card>
        ) : (
          <RecentNotices notices={d.notices} />
        )}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Students by class" description="Active enrollments this year" />
          <div className="p-4"><BarsChart data={d.distribution} xKey="class" series={[{ key: "students", label: "Students", color: "var(--chart-6)" }]} height={240} /></div>
        </Card>
        <UpcomingExams papers={d.papers} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recent assignments" icon={<NotebookPen />} action={<ButtonLink href="/assignments?when=all" variant="ghost" size="sm">View all</ButtonLink>} />
          {d.assignments.length === 0 ? (
            <EmptyState title="No assignments yet" className="py-8" />
          ) : (
            <ul className="divide-y">
              {d.assignments.map((a) => (
                <li key={a.id}>
                  <Link href={`/assignments/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.title}</span>
                      <span className="block text-xs text-muted-foreground">{a.subject.name} · {a.section.class.name}-{a.section.name} · due {formatDate(a.dueDate)}</span>
                    </span>
                    <Badge>{a._count.submissions} submitted</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {d.fees && <RecentNotices notices={d.notices} />}
      </div>
    </>
  );
}

async function TeacherView({ actor, today }: { actor: ActorT; today: string }) {
  const d = await teacherDashboard(actor);
  const unmarked = d.sections.filter((s) => s.isClassTeacher && !s.todayMarked);
  return (
    <>
      <Greeting name={actor.firstName} subtitle={`${today} · ${d.lessons.length} lesson${d.lessons.length === 1 ? "" : "s"} today`} />
      {unmarked.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
          <AlertTriangle className="size-5 text-warning" />
          <span className="flex-1">Today&apos;s attendance hasn&apos;t been taken for <strong>{unmarked.map((s) => s.label).join(", ")}</strong>.</span>
          <ButtonLink size="sm" href={`/attendance?tab=mark&sectionId=${unmarked[0]!.id}`}>Take attendance</ButtonLink>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My classes" value={d.sections.length} hint={`${d.sections.reduce((n, s) => n + s.students, 0)} students`} icon={<School />} href="/classes" />
        <StatCard label="Lessons today" value={d.lessons.length} icon={<BookOpen />} tone="info" href="/timetable" />
        <StatCard label="To grade" value={d.pending.reduce((n, a) => n + a._count.submissions, 0)} hint={`across ${d.pending.length} assignment${d.pending.length === 1 ? "" : "s"}`} icon={<NotebookPen />} tone="warning" href="/assignments?when=all" />
        <StatCard label="Upcoming exam papers" value={d.papers.length} icon={<CheckCircle2 />} tone="success" href="/exams" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="My classes" icon={<School />} action={<ButtonLink href="/attendance" variant="ghost" size="sm">Attendance</ButtonLink>} />
            {d.sections.length === 0 ? (
              <EmptyState title="No classes assigned" className="py-8" />
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {d.sections.map((s) => (
                  <Link key={s.id} href={`/classes/${s.id}`} className="rounded-xl border p-4 transition hover:border-primary/50">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{s.label}</p>
                      {s.isClassTeacher && <Badge tone="primary">Class teacher</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{s.students} students · {s.subjects.join(", ") || "Class teacher"}</p>
                    <p className="mt-2 text-xs">{s.todayMarked ? <Badge tone="success">Today {formatPercent(s.todayRate)}</Badge> : <Badge tone="neutral">Attendance not taken</Badge>}</p>
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Submissions to grade" icon={<NotebookPen />} action={<ButtonLink href="/assignments/new" size="sm">New assignment</ButtonLink>} />
            {d.pending.length === 0 ? (
              <EmptyState title="Nothing to grade" description="New submissions will appear here." className="py-8" />
            ) : (
              <ul className="divide-y">
                {d.pending.map((a) => (
                  <li key={a.id}>
                    <Link href={`/assignments/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.title}</span>
                        <span className="block text-xs text-muted-foreground">{a.subject.name} · {a.section.class.name}-{a.section.name} · due {relativeTime(a.dueDate)}</span>
                      </span>
                      <Badge tone="warning">{a._count.submissions} to grade</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <TodayTimetable lessons={d.lessons} mode="teacher" />
          <UpcomingExams papers={d.papers} />
          <RecentNotices notices={d.notices} />
        </div>
      </div>
    </>
  );
}
