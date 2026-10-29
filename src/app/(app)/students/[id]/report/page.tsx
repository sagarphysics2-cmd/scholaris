import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PrintButton } from "@/components/ui/print-button";
import { can, requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { formatCurrency, formatDate, formatPercent, fullName, titleCase } from "@/lib/utils";
import { schoolSettings, studentAttendanceSummary } from "@/server/services/attendance.service";
import { studentResultsOverview } from "@/server/services/exams.service";
import { studentFeeSummary } from "@/server/services/fees.service";
import { getStudentProfile } from "@/server/services/students.service";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Student report" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="mb-3 border-b pb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** Printable one-page summary of a student: profile, attendance, results and fees. */
export default async function StudentReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("students.read");
  const s = await load(getStudentProfile(actor, id));
  const [school, settings, attendance, results, fees] = await Promise.all([
    db.school.findUniqueOrThrow({ where: { id: actor.schoolId! } }),
    schoolSettings(actor.schoolId!),
    can(actor, "attendance.read") ? studentAttendanceSummary(actor, id) : null,
    can(actor, "results.read") ? studentResultsOverview(actor, id) : [],
    can(actor, "fees.manage") ? studentFeeSummary(actor, id) : null,
  ]);
  const e = s.enrollments.find((x) => x.academicYear.isCurrent) ?? s.enrollments[0];
  const money = (v: number) => formatCurrency(v, settings.currency);
  return (
    <>
      <div className="no-print mb-4 flex justify-between gap-2">
        <ButtonLink href={`/students/${id}`} variant="ghost">← Back to profile</ButtonLink>
        <PrintButton />
      </div>
      <Card className="print-area mx-auto max-w-4xl p-6 sm:p-10">
        <header className="flex items-center gap-4 border-b pb-5">
          <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground"><GraduationCap className="size-6" /></span>
          <div className="flex-1">
            <p className="text-lg font-semibold">{school.name}</p>
            <p className="text-xs text-muted-foreground">Student report · generated {formatDate(new Date())}</p>
          </div>
        </header>
        <Section title="Student">
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {[
              ["Name", fullName(s.user)], ["Student ID", s.studentCode], ["Admission no.", s.admissionNumber], ["Class", e ? `${e.section.class.name} – ${e.section.name} (Roll ${e.rollNumber})` : "—"],
              ["Date of birth", formatDate(s.dateOfBirth)], ["Gender", titleCase(s.gender)], ["Admitted", formatDate(s.admissionDate)], ["Status", titleCase(s.status)],
              ["Guardian", s.parents[0] ? `${fullName(s.parents[0].parent.user)} (${titleCase(s.parents[0].relationship)})` : "—"], ["Guardian phone", s.parents[0]?.parent.user.phone ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-dashed py-1"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
        </Section>
        {attendance && (
          <Section title="Attendance (this academic year)">
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
              {[["Rate", formatPercent(attendance.rate)], ["Present", attendance.totals.PRESENT], ["Absent", attendance.totals.ABSENT], ["Late", attendance.totals.LATE], ["Excused", attendance.totals.EXCUSED]].map(([k, v]) => (
                <div key={k as string} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="text-lg font-semibold">{v}</p></div>
              ))}
            </div>
          </Section>
        )}
        <Section title="Examination results">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results recorded.</p>
          ) : (
            <table className="w-full border text-sm">
              <thead><tr className="bg-muted/60 text-left"><th className="border px-3 py-1.5">Examination</th><th className="border px-3 py-1.5 text-right">Total</th><th className="border px-3 py-1.5 text-right">%</th><th className="border px-3 py-1.5 text-center">Grade</th><th className="border px-3 py-1.5 text-right">Rank</th><th className="border px-3 py-1.5">Result</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.exam.id}>
                    <td className="border px-3 py-1.5">{r.exam.name}</td>
                    <td className="border px-3 py-1.5 text-right tabular-nums">{r.result.totalObtained}/{r.result.totalMax}</td>
                    <td className="border px-3 py-1.5 text-right tabular-nums">{formatPercent(r.result.percent)}</td>
                    <td className="border px-3 py-1.5 text-center">{r.result.grade}</td>
                    <td className="border px-3 py-1.5 text-right">{r.rank ? `${r.rank}/${r.classSize}` : "—"}</td>
                    <td className="border px-3 py-1.5">{r.result.incomplete ? "Incomplete" : r.result.passed ? "Pass" : "Not passed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        {fees && (
          <Section title="Fees">
            <p className="text-sm">Total {money(fees.totalDue)} · Paid {money(fees.totalPaid)} · <strong>Outstanding {money(fees.outstanding)}</strong>{fees.overdue.length > 0 && ` · ${fees.overdue.length} overdue`}</p>
          </Section>
        )}
        {s.notes && !actor.parentId && !actor.studentId && <Section title="Notes"><p className="whitespace-pre-line text-sm">{s.notes}</p></Section>}
      </Card>
    </>
  );
}
