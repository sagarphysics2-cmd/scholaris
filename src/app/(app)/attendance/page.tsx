import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarCheck2, CheckCircle2, Download, Percent, Users } from "lucide-react";
import { AttendanceSheet } from "@/components/attendance/attendance-sheet";
import { StudentAttendance } from "@/components/attendance/student-attendance";
import { BarsChart, TrendChart } from "@/components/charts/charts";
import { ChildSwitcher } from "@/components/people/child-switcher";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { sp } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DateParam, FilterSelect } from "@/components/ui/url-controls";
import { canAny, requirePermission } from "@/lib/auth/actor";
import { cn, formatPercent, todayUTC, toISODate } from "@/lib/utils";
import { resolveStudentContext } from "@/server/authz/scope";
import { attendanceOverview, getAttendanceSheet, markableSections, sectionMonthRegister, studentAttendanceSummary, viewableSections } from "@/server/services/attendance.service";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Attendance" };

type SP = Record<string, string | string[] | undefined>;

export default async function AttendancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requirePermission("attendance.read");
  const params = await searchParams;
  const requestedStudent = sp(params, "studentId");

  // Students & parents (or staff looking at one student): personal view.
  if (actor.studentId || actor.parentId || requestedStudent) {
    const ctx = await load(resolveStudentContext(actor, requestedStudent));
    if (!ctx.studentId) return <><PageHeader title="Attendance" /><Card><EmptyState title="No linked students" /></Card></>;
    const summary = await studentAttendanceSummary(actor, ctx.studentId);
    const name = ctx.children.find((c) => c.id === ctx.studentId)?.name;
    return (
      <>
        <PageHeader title={actor.studentId ? "My Attendance" : name ? `${name}'s Attendance` : "Student Attendance"} description="Daily records, monthly breakdown and absence history for this academic year." />
        <ChildSwitcher items={ctx.children} active={ctx.studentId} basePath="/attendance" />
        <StudentAttendance summary={summary} />
      </>
    );
  }

  const canMark = canAny(actor, "attendance.mark", "attendance.manage");
  const tab = sp(params, "tab") ?? (canMark ? "mark" : "overview");
  const tabs = [
    ...(canMark ? [{ key: "mark", label: "Take attendance", href: "/attendance?tab=mark" }] : []),
    { key: "overview", label: "Overview", href: "/attendance?tab=overview" },
    { key: "register", label: "Monthly register", href: "/attendance?tab=register" },
  ];

  return (
    <>
      <PageHeader title="Attendance" description="Take daily roll call, follow trends and spot students who need support." />
      <LinkTabs tabs={tabs} active={tab} />
      {tab === "mark" && canMark && <MarkTab actorSections={await markableSections(actor)} params={params} actor={actor} />}
      {tab === "overview" && <OverviewTab actor={actor} />}
      {tab === "register" && <RegisterTab actor={actor} params={params} />}
    </>
  );
}

type ActorT = Awaited<ReturnType<typeof requirePermission>>;

async function MarkTab({ actorSections, params, actor }: { actorSections: Awaited<ReturnType<typeof markableSections>>; params: SP; actor: ActorT }) {
  const today = toISODate(todayUTC());
  const date = sp(params, "date") ?? today;
  const preferred = actorSections.find((s) => actor.teacherId && s.classTeacherId === actor.teacherId)?.value;
  const sectionId = sp(params, "sectionId") ?? preferred ?? actorSections[0]?.value;
  if (!sectionId) return <Card><EmptyState icon={<CalendarCheck2 />} title="No sections to mark" description="You are not assigned to any class sections." /></Card>;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : today;
  const sheet = await load(getAttendanceSheet(actor, sectionId, new Date(`${validDate}T00:00:00Z`)));
  return (
    <Card>
      <Toolbar>
        <FilterSelect param="sectionId" label="Section" placeholder="Choose section" options={actorSections} fallback={sectionId} />
        <DateParam param="date" label="Date" fallback={validDate} max={today} />
        <p className="text-sm text-muted-foreground sm:ml-auto">
          {sheet.section.class.name} – {sheet.section.name} · {new Date(`${validDate}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
        </p>
      </Toolbar>
      {sheet.rows.length === 0 ? (
        <EmptyState icon={<Users />} title="No students in this section" />
      ) : (
        <AttendanceSheet key={`${sectionId}-${validDate}`} sectionId={sectionId} date={validDate} rows={sheet.rows} alreadyMarked={sheet.alreadyMarked} locked={sheet.locked} editWindowDays={sheet.editWindowDays} isSchoolDay={sheet.isSchoolDay} />
      )}
    </Card>
  );
}

async function OverviewTab({ actor }: { actor: ActorT }) {
  const o = await attendanceOverview(actor);
  if (!o) return <Card><EmptyState title="No academic year configured" /></Card>;
  const notMarked = o.sections.filter((s) => !s.todayMarked);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's attendance" value={formatPercent(o.today.rate)} hint={`${o.today.counts.PRESENT + o.today.counts.LATE} present · ${o.today.counts.ABSENT} absent`} icon={<Percent />} tone="success" />
        <StatCard label="Sections marked today" value={`${o.today.marked}/${o.today.sections}`} hint={notMarked.length ? `${notMarked.length} pending` : "All done"} icon={<CheckCircle2 />} tone={notMarked.length ? "warning" : "success"} />
        <StatCard label="Year-to-date rate" value={formatPercent(avg(o.sections.map((s) => s.rate)))} hint={o.year.name} icon={<CalendarCheck2 />} tone="primary" />
        <StatCard label="Students needing attention" value={o.frequentAbsentees.length} hint={`Below ${o.threshold}% or 5+ absences`} icon={<AlertTriangle />} tone="danger" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Daily attendance trend" description="Attendance rate, last 30 days" />
          <div className="p-4">{o.trend.length ? <TrendChart data={o.trend} xKey="date" series={[{ key: "rate", label: "Attendance rate", color: "var(--chart-1)" }]} unit="%" yDomain={[50, 100]} /> : <EmptyState title="No attendance in the last 30 days" />}</div>
        </Card>
        <Card>
          <CardHeader title="Attendance by section" description="Year-to-date rate" />
          <div className="p-4"><BarsChart data={o.sections.map((s) => ({ label: s.label, rate: s.rate }))} xKey="label" series={[{ key: "rate", label: "Attendance rate", color: "var(--chart-1)" }]} unit="%" yDomain={[0, 100]} /></div>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Students with frequent absences" description={`Attendance below ${o.threshold}% or 5+ absences this year`} icon={<AlertTriangle />} />
          {o.frequentAbsentees.length === 0 ? (
            <EmptyState title="No concerns" description="Every student is above the attendance threshold." />
          ) : (
            <Table>
              <THead><TR><TH>Student</TH><TH>Section</TH><TH>Absences</TH><TH>Rate</TH></TR></THead>
              <TBody>
                {o.frequentAbsentees.map((s) => (
                  <TR key={s.studentId}>
                    <TD><Link href={`/attendance?studentId=${s.studentId}`} className="flex items-center gap-2 font-medium hover:text-primary"><Avatar name={s.name} fileId={s.avatarFileId} size="sm" />{s.name}</Link></TD>
                    <TD label="Section">{s.section}</TD>
                    <TD label="Absences" className="tabular-nums">{s.counts.ABSENT}</TD>
                    <TD label="Rate"><Badge tone={s.rate < o.threshold ? "danger" : "warning"}>{formatPercent(s.rate)}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Today by section" />
          <ul className="divide-y">
            {o.sections.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="flex-1 font-medium">{s.fullLabel}</span>
                <span className="text-muted-foreground">{s.students} students</span>
                {s.todayMarked ? <Badge tone="success">{formatPercent(s.todayRate)}</Badge> : <Badge tone="warning">Not marked</Badge>}
                <ButtonLink size="sm" variant="ghost" href={`/attendance?tab=mark&sectionId=${s.id}`}>Open</ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function avg(values: Array<number | null>) {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

const CELL: Record<string, { label: string; cls: string }> = {
  PRESENT: { label: "P", cls: "text-success" },
  ABSENT: { label: "A", cls: "bg-danger-soft text-danger font-semibold" },
  LATE: { label: "L", cls: "bg-warning-soft" },
  EXCUSED: { label: "E", cls: "bg-info-soft text-info" },
};

async function RegisterTab({ actor, params }: { actor: ActorT; params: SP }) {
  const sections = await viewableSections(actor);
  const sectionId = sp(params, "sectionId") ?? sections[0]?.value;
  const month = sp(params, "month") ?? toISODate(todayUTC()).slice(0, 7);
  const months = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.UTC(todayUTC().getUTCFullYear(), todayUTC().getUTCMonth() - i, 1));
    return { value: toISODate(d).slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) };
  });
  if (!sectionId) return <Card><EmptyState title="No sections available" /></Card>;
  const reg = await load(sectionMonthRegister(actor, sectionId, /^\d{4}-\d{2}$/.test(month) ? month : toISODate(todayUTC()).slice(0, 7)));
  return (
    <Card className="print-area">
      <Toolbar>
        <FilterSelect param="sectionId" label="Section" placeholder="Choose section" options={sections} fallback={sectionId} />
        <FilterSelect param="month" label="Month" placeholder="This month" options={months} fallback={month} />
        <ButtonLink variant="outline" className="sm:ml-auto" href={`/api/export/attendance?sectionId=${sectionId}&month=${month}`} prefetch={false}><Download /> Export CSV</ButtonLink>
      </Toolbar>
      {reg.rows.length === 0 ? (
        <EmptyState title="No students" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 bg-muted px-3 py-2 text-left font-semibold">Student</th>
                {reg.days.map((d) => (
                  <th key={d.toISOString()} className="px-1 py-2 text-center font-medium text-muted-foreground">
                    {d.getUTCDate()}
                  </th>
                ))}
                <th className="px-2 py-2 text-center">P</th>
                <th className="px-2 py-2 text-center">A</th>
                <th className="px-2 py-2 text-center">L</th>
                <th className="px-3 py-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {reg.rows.map((r) => (
                <tr key={r.studentId} className="border-b">
                  <td className="sticky left-0 whitespace-nowrap bg-card px-3 py-1.5 font-medium">{r.roll}. {r.name}</td>
                  {r.cells.map((c, i) => (
                    <td key={i} className={cn("px-1 py-1.5 text-center", c ? CELL[c]!.cls : "text-muted-foreground/40")}>{c ? CELL[c]!.label : "·"}</td>
                  ))}
                  <td className="px-2 text-center tabular-nums">{r.counts.PRESENT}</td>
                  <td className="px-2 text-center tabular-nums">{r.counts.ABSENT}</td>
                  <td className="px-2 text-center tabular-nums">{r.counts.LATE}</td>
                  <td className="px-3 text-right font-medium tabular-nums">{formatPercent(r.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-muted-foreground">P = Present · A = Absent · L = Late · E = Excused · “·” = not marked</p>
        </div>
      )}
    </Card>
  );
}
