import Link from "next/link";
import { CalendarCheck2, NotebookPen, Trophy, Wallet } from "lucide-react";
import { BarsChart } from "@/components/charts/charts";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { attendanceTone } from "@/components/ui/misc";
import { StatCard } from "@/components/ui/stat-card";
import { ATTENDANCE_COLORS } from "@/lib/attendance";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import type { learnerDashboard } from "@/server/services/dashboard.service";
import { RecentNotices, TodayTimetable, UpcomingExams, dueLabel } from "./widgets";

export function LearnerDashboard({ data, studentId, isParent }: { data: Awaited<ReturnType<typeof learnerDashboard>>; studentId: string; isParent: boolean }) {
  const q = isParent ? `?studentId=${studentId}` : "";
  const latest = data.results[0];
  const pending = data.assignments.filter((a) => !a.submissions.length);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Attendance" value={formatPercent(data.attendance.rate)} hint={`${data.attendance.totals.ABSENT} absences this year`} icon={<CalendarCheck2 />} tone={attendanceTone(data.attendance.rate) === "primary" ? "primary" : attendanceTone(data.attendance.rate)} href={`/attendance${q}`} />
        <StatCard label="Assignments to do" value={pending.length} hint={pending[0] ? `Next: ${pending[0].title}` : "All caught up"} icon={<NotebookPen />} tone={pending.length ? "warning" : "success"} href={`/assignments${q}`} />
        <StatCard label="Latest result" value={latest ? formatPercent(latest.result.percent) : "—"} hint={latest ? `${latest.exam.name} · Grade ${latest.result.grade}` : "No results yet"} icon={<Trophy />} tone="primary" href={`/results${q}`} />
        {data.fees ? (
          <StatCard label="Fees outstanding" value={formatCurrency(data.fees.outstanding, data.currency)} hint={data.fees.overdue.length ? `${data.fees.overdue.length} overdue` : data.fees.nextDue ? `Next due ${formatDate(data.fees.nextDue.dueDate)}` : "Nothing due"} icon={<Wallet />} tone={data.fees.overdue.length ? "danger" : "info"} href={`/fees${q}`} />
        ) : (
          <StatCard label="Upcoming exams" value={data.papers.length} icon={<Trophy />} tone="info" href="/exams" />
        )}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Upcoming assignments" icon={<NotebookPen />} action={<ButtonLink href={`/assignments${q}`} variant="ghost" size="sm">View all</ButtonLink>} />
            {data.assignments.length === 0 ? (
              <EmptyState title="Nothing due" description="No upcoming assignments." className="py-8" />
            ) : (
              <ul className="divide-y">
                {data.assignments.map((a) => {
                  const due = dueLabel(a.dueDate);
                  const sub = a.submissions[0];
                  return (
                    <li key={a.id}>
                      <Link href={`/assignments/${a.id}${q}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{a.title}</span>
                          <span className="block text-xs text-muted-foreground">{a.subject.name}</span>
                        </span>
                        {sub ? <StatusBadge status={sub.status} /> : <Badge tone={due.tone}>{due.text}</Badge>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Recent results" icon={<Trophy />} action={<ButtonLink href={`/results${q}`} variant="ghost" size="sm">All results</ButtonLink>} />
            {!latest ? (
              <EmptyState title="No published results yet" className="py-8" />
            ) : (
              <div className="p-4">
                <BarsChart data={latest.result.subjects.map((s) => ({ subject: s.subjectName, score: s.percent ?? 0 }))} xKey="subject" series={[{ key: "score", label: "Score", color: "var(--chart-1)" }]} unit="%" yDomain={[0, 100]} height={220} />
                <p className="mt-2 text-center text-sm text-muted-foreground">{latest.exam.name}: {latest.result.totalObtained}/{latest.result.totalMax} · Rank {latest.rank ?? "—"} of {latest.classSize}</p>
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Attendance by month" icon={<CalendarCheck2 />} />
            <div className="p-4">
              {data.attendance.monthly.length ? (
                <BarsChart
                  stacked
                  height={200}
                  xKey="label"
                  data={data.attendance.monthly.map((m) => ({ label: new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), Present: m.PRESENT, Late: m.LATE, Absent: m.ABSENT }))}
                  series={[{ key: "Present", label: "Present", color: ATTENDANCE_COLORS.PRESENT }, { key: "Late", label: "Late", color: ATTENDANCE_COLORS.LATE }, { key: "Absent", label: "Absent", color: ATTENDANCE_COLORS.ABSENT }]}
                />
              ) : (
                <EmptyState title="No attendance yet" className="py-6" />
              )}
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <TodayTimetable lessons={data.lessons} mode="student" />
          <UpcomingExams papers={data.papers} showClass={false} />
          <RecentNotices notices={data.notices} />
        </div>
      </div>
    </div>
  );
}
