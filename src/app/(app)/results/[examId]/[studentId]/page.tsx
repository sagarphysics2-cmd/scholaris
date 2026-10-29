import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PrintButton } from "@/components/ui/print-button";
import { requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { cn, formatDate, formatPercent, fullName, toNumber } from "@/lib/utils";
import { studentExamResult } from "@/server/services/exams.service";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Report card" };

export default async function ReportCardPage({ params }: { params: Promise<{ examId: string; studentId: string }> }) {
  const { examId, studentId } = await params;
  const actor = await requirePermission("results.read");
  const r = await load(studentExamResult(actor, examId, studentId));
  const school = await db.school.findUniqueOrThrow({ where: { id: actor.schoolId! } });
  const e = r.enrollment;

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap justify-between gap-2">
        <ButtonLink href="/results" variant="ghost">← Back to results</ButtonLink>
        <PrintButton />
      </div>
      <Card className="print-area mx-auto max-w-4xl p-6 sm:p-10">
        <header className="flex flex-col items-center gap-3 border-b pb-6 text-center">
          {school.logoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${school.logoFileId}`} alt="" className="size-16 object-contain" />
          ) : (
            <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><GraduationCap className="size-7" /></span>
          )}
          <div>
            <h1 className="text-2xl font-semibold">{school.name}</h1>
            <p className="text-sm text-muted-foreground">{[school.address, school.phone, school.email].filter(Boolean).join(" · ")}</p>
          </div>
          <p className="mt-2 rounded-full bg-primary-soft px-4 py-1 text-sm font-semibold uppercase tracking-wider text-accent-foreground">Report Card — {r.exam.name}</p>
        </header>

        <section className="grid gap-x-8 gap-y-2 py-6 text-sm sm:grid-cols-2">
          {[
            ["Student", fullName(r.student.user)],
            ["Student ID", r.student.studentCode],
            ["Class", `${e.section.class.name} – ${e.section.name}`],
            ["Roll number", e.rollNumber],
            ["Academic year", r.exam.academicYear.name],
            ["Exam dates", `${formatDate(r.exam.startDate)} – ${formatDate(r.exam.endDate)}`],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between gap-4 border-b border-dashed py-1.5">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </section>

        <div className="overflow-x-auto">
          <table className="w-full border text-sm">
            <thead>
              <tr className="bg-muted/60 text-left">
                <th className="border px-3 py-2">Subject</th>
                <th className="border px-3 py-2 text-right">Max</th>
                <th className="border px-3 py-2 text-right">Pass</th>
                <th className="border px-3 py-2 text-right">Obtained</th>
                <th className="border px-3 py-2 text-right">%</th>
                <th className="border px-3 py-2 text-center">Grade</th>
                <th className="border px-3 py-2 text-right">Class avg</th>
                <th className="border px-3 py-2">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {r.result.subjects.map((s) => (
                <tr key={s.subjectId}>
                  <td className="border px-3 py-2 font-medium">{s.subjectName}</td>
                  <td className="border px-3 py-2 text-right tabular-nums">{s.maxMarks}</td>
                  <td className="border px-3 py-2 text-right tabular-nums">{s.passingMarks}</td>
                  <td className={cn("border px-3 py-2 text-right font-semibold tabular-nums", !s.passed && s.marksObtained !== null && "text-danger")}>{s.isAbsent ? "AB" : s.marksObtained ?? "—"}</td>
                  <td className="border px-3 py-2 text-right tabular-nums">{s.percent === null ? "—" : `${s.percent}%`}</td>
                  <td className="border px-3 py-2 text-center font-semibold">{s.grade}</td>
                  <td className="border px-3 py-2 text-right tabular-nums">{r.subjectAverages[s.subjectId] ?? "—"}</td>
                  <td className="border px-3 py-2 text-muted-foreground">{r.remarks[s.subjectId] ?? ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td className="border px-3 py-2">Total</td>
                <td className="border px-3 py-2 text-right tabular-nums">{r.result.totalMax}</td>
                <td className="border px-3 py-2" />
                <td className="border px-3 py-2 text-right tabular-nums">{r.result.totalObtained}</td>
                <td className="border px-3 py-2 text-right tabular-nums">{formatPercent(r.result.percent)}</td>
                <td className="border px-3 py-2 text-center">{r.result.grade}</td>
                <td className="border px-3 py-2 text-right tabular-nums">{formatPercent(r.classAverage)}</td>
                <td className="border px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["Overall", formatPercent(r.result.percent)],
            ["Rank in class", r.rank ? `${r.rank} of ${r.classSize}` : "—"],
            ["Result", r.result.incomplete ? "Incomplete" : r.result.passed ? "PASS" : "NOT PASSED"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p>
              <p className={cn("mt-1 text-xl font-semibold", v === "PASS" && "text-success", v === "NOT PASSED" && "text-danger")}>{v}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Grading scale</p>
          <p className="mt-1">{r.scale.map((g) => `${g.grade}: ≥${toNumber(g.minPercent)}%`).join(" · ")} · AB = absent</p>
        </section>

        <footer className="mt-12 grid grid-cols-2 gap-10 text-center text-sm">
          <div className="border-t pt-2">{e.section.classTeacher ? fullName(e.section.classTeacher.user) : "Class teacher"}<p className="text-xs text-muted-foreground">Class teacher</p></div>
          <div className="border-t pt-2">&nbsp;<p className="text-xs text-muted-foreground">Principal</p></div>
        </footer>
        <p className="mt-8 text-center text-[11px] text-muted-foreground">Generated {formatDate(new Date())} · {r.exam.status === "PUBLISHED" ? "Official result" : "Provisional — results not yet published"}</p>
      </Card>
    </>
  );
}
