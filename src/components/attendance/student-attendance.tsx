import { CalendarCheck2, CalendarX2, Clock, ShieldCheck } from "lucide-react";
import { BarsChart } from "@/components/charts/charts";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ATTENDANCE_COLORS } from "@/lib/attendance";
import { formatDate, formatPercent } from "@/lib/utils";
import type { studentAttendanceSummary } from "@/server/services/attendance.service";

type Summary = Awaited<ReturnType<typeof studentAttendanceSummary>>;

export function StudentAttendance({ summary }: { summary: Summary }) {
  const exceptions = summary.records.filter((r) => r.status !== "PRESENT");
  const low = summary.rate !== null && summary.rate < summary.threshold;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Attendance rate" value={formatPercent(summary.rate)} hint={low ? `Below the ${summary.threshold}% requirement` : `Requirement: ${summary.threshold}%`} icon={<ShieldCheck />} tone={low ? "danger" : "success"} />
        <StatCard label="Days present" value={summary.totals.PRESENT} icon={<CalendarCheck2 />} tone="success" />
        <StatCard label="Days absent" value={summary.totals.ABSENT} hint={`${summary.totals.EXCUSED} excused`} icon={<CalendarX2 />} tone="danger" />
        <StatCard label="Late arrivals" value={summary.totals.LATE} icon={<Clock />} tone="warning" />
      </div>
      <Card>
        <CardHeader title="Monthly attendance" description="Days per status, by month" />
        <div className="p-4">
          {summary.monthly.length === 0 ? (
            <EmptyState title="No attendance recorded yet" />
          ) : (
            <BarsChart
              stacked
              xKey="label"
              data={summary.monthly.map((m) => ({ label: new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }), PRESENT: m.PRESENT, LATE: m.LATE, EXCUSED: m.EXCUSED, ABSENT: m.ABSENT }))}
              series={[
                { key: "PRESENT", label: "Present", color: ATTENDANCE_COLORS.PRESENT },
                { key: "LATE", label: "Late", color: ATTENDANCE_COLORS.LATE },
                { key: "EXCUSED", label: "Excused", color: ATTENDANCE_COLORS.EXCUSED },
                { key: "ABSENT", label: "Absent", color: ATTENDANCE_COLORS.ABSENT },
              ]}
              unit=" d"
            />
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Absence & lateness history" description={`${exceptions.length} record${exceptions.length === 1 ? "" : "s"} this academic year`} />
        {exceptions.length === 0 ? (
          <EmptyState title="Perfect attendance" description="No absences or late arrivals recorded." />
        ) : (
          <Table>
            <THead><TR><TH>Date</TH><TH>Status</TH><TH>Note</TH></TR></THead>
            <TBody>
              {exceptions.map((r) => (
                <TR key={r.id}>
                  <TD label="Date" className="whitespace-nowrap">{formatDate(r.date)}</TD>
                  <TD label="Status"><StatusBadge status={r.status} /></TD>
                  <TD label="Note" className="text-muted-foreground">{r.note ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
