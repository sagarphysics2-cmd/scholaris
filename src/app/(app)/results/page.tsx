import type { Metadata } from "next";
import Link from "next/link";
import { Award, Download, FileText, Percent, Trophy, Users } from "lucide-react";
import { BarsChart } from "@/components/charts/charts";
import { ChildSwitcher } from "@/components/people/child-switcher";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { sp } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterSelect } from "@/components/ui/url-controls";
import { requirePermission } from "@/lib/auth/actor";
import { formatDate, formatPercent } from "@/lib/utils";
import { resolveStudentContext } from "@/server/authz/scope";
import { viewableSections } from "@/server/services/attendance.service";
import { listExams, sectionResults, studentResultsOverview } from "@/server/services/exams.service";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Results" };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("results.read");
  const params = await searchParams;

  if (actor.studentId || actor.parentId || sp(params, "studentId")) {
    const ctx = await load(resolveStudentContext(actor, sp(params, "studentId")));
    if (!ctx.studentId) return <><PageHeader title="Results" /><Card><EmptyState title="No linked students" /></Card></>;
    const overview = await studentResultsOverview(actor, ctx.studentId);
    const latest = overview[0];
    return (
      <>
        <PageHeader title={actor.studentId ? "My Results" : "Results"} description="Published examination results and report cards." />
        <ChildSwitcher items={ctx.children} active={ctx.studentId} basePath="/results" />
        {overview.length === 0 ? (
          <Card><EmptyState icon={<Trophy />} title="No published results yet" description="Results appear here once your school publishes them." /></Card>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label={`Latest: ${latest!.exam.name}`} value={formatPercent(latest!.result.percent)} hint={`Grade ${latest!.result.grade}`} icon={<Percent />} tone="primary" />
              <StatCard label="Class rank" value={latest!.rank ? `${latest!.rank} / ${latest!.classSize}` : "—"} icon={<Award />} tone="success" />
              <StatCard label="Result" value={latest!.result.incomplete ? "Pending" : latest!.result.passed ? "Pass" : "Needs improvement"} icon={<Trophy />} tone={latest!.result.passed ? "success" : "warning"} />
            </div>
            <Card>
              <CardHeader title={`${latest!.exam.name} — by subject`} description="Percentage scored per subject" />
              <div className="p-4">
                <BarsChart data={latest!.result.subjects.map((s) => ({ subject: s.subjectName, score: s.percent ?? 0 }))} xKey="subject" series={[{ key: "score", label: "Score", color: "var(--chart-1)" }]} unit="%" yDomain={[0, 100]} />
              </div>
            </Card>
            <Card>
              <CardHeader title="All examinations" />
              <ul className="divide-y">
                {overview.map((o) => (
                  <li key={o.exam.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{o.exam.name}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(o.exam.startDate)} · {o.result.totalObtained}/{o.result.totalMax}</p>
                    </div>
                    <Badge tone="primary">{formatPercent(o.result.percent)}</Badge>
                    <Badge>Grade {o.result.grade}</Badge>
                    <StatusBadge status={o.result.incomplete ? "PENDING" : o.result.passed ? "PASS" : "FAIL"} />
                    <ButtonLink size="sm" variant="outline" href={`/results/${o.exam.id}/${ctx.studentId}`}><FileText /> Report card</ButtonLink>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </>
    );
  }

  const [exams, sections] = await Promise.all([listExams(actor), viewableSections(actor)]);
  const examId = sp(params, "examId") ?? exams.find((e) => e.status === "PUBLISHED")?.id ?? exams[0]?.id;
  const sectionId = sp(params, "sectionId") ?? sections[0]?.value;
  const data = examId && sectionId ? await load(sectionResults(actor, examId, sectionId)) : null;

  return (
    <>
      <PageHeader
        title="Results"
        description="Class result sheets, subject performance and report cards."
        actions={data && <ButtonLink variant="outline" href={`/api/export/results?examId=${examId}&sectionId=${sectionId}`} prefetch={false}><Download /> Export CSV</ButtonLink>}
      />
      <Card className="mb-6">
        <Toolbar>
          <FilterSelect param="examId" label="Examination" placeholder="Choose exam" options={exams.map((e) => ({ value: e.id, label: e.name }))} fallback={examId} />
          <FilterSelect param="sectionId" label="Section" placeholder="Choose section" options={sections} fallback={sectionId} />
          {data && <StatusBadge status={data.exam.status} label={data.exam.status === "PUBLISHED" ? "Published" : "Not yet published"} />}
        </Toolbar>
      </Card>
      {!data ? (
        <Card><EmptyState icon={<Trophy />} title="Choose an examination and section" /></Card>
      ) : data.papers.length === 0 ? (
        <Card><EmptyState title="No papers for this class in this examination" /></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Class average" value={formatPercent(data.classAverage)} icon={<Percent />} />
            <StatCard label="Pass rate" value={formatPercent(data.passRate)} icon={<Trophy />} tone="success" />
            <StatCard label="Top score" value={formatPercent(Math.max(0, ...data.rows.map((r) => r.percent)))} hint={data.rows.find((r) => r.rank === 1)?.name} icon={<Award />} tone="warning" />
            <StatCard label="Students" value={data.rows.length} hint={`${data.rows.filter((r) => r.incomplete).length} with missing marks`} icon={<Users />} tone="info" />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Subject averages" description="Average score as % of maximum" />
              <div className="p-4"><BarsChart data={data.subjectStats.map((s) => ({ subject: s.name, avg: s.averagePct }))} xKey="subject" series={[{ key: "avg", label: "Average", color: "var(--chart-1)" }]} unit="%" yDomain={[0, 100]} /></div>
            </Card>
            <Card>
              <CardHeader title="Grade distribution" description="Students per overall grade" />
              <div className="p-4"><BarsChart data={data.gradeDistribution} xKey="grade" series={[{ key: "count", label: "Students", color: "var(--chart-6)" }]} /></div>
            </Card>
          </div>
          <Card>
            <CardHeader title={`Result sheet — ${data.section.class.name} ${data.section.name}`} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2">Roll</th>
                    <th className="px-4 py-2">Student</th>
                    {data.papers.map((p) => <th key={p.id} className="px-3 py-2 text-right">{p.subject.name.split(" ")[0]}</th>)}
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">%</th>
                    <th className="px-3 py-2">Grade</th>
                    <th className="px-3 py-2 text-right">Rank</th>
                    <th className="px-3 py-2">Result</th>
                    <th className="px-3 py-2"><span className="sr-only">Report card</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.studentId} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.roll}</td>
                      <td className="whitespace-nowrap px-4 py-2 font-medium">{r.name}</td>
                      {r.subjects.map((s) => (
                        <td key={s.subjectId} className={`px-3 py-2 text-right tabular-nums ${!s.passed && s.marksObtained !== null ? "text-danger" : ""}`}>{s.isAbsent ? "AB" : s.marksObtained ?? "—"}</td>
                      ))}
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{r.totalObtained}/{r.totalMax}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPercent(r.percent)}</td>
                      <td className="px-3 py-2"><Badge>{r.grade}</Badge></td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.incomplete ? "—" : r.rank}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.incomplete ? "PENDING" : r.passed ? "PASS" : "FAIL"} label={r.incomplete ? "Incomplete" : undefined} /></td>
                      <td className="px-3 py-2"><Link href={`/results/${data.exam.id}/${r.studentId}`} className="text-primary hover:underline">Card</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Subject performance" />
            <Table>
              <THead><TR><TH>Subject</TH><TH>Average</TH><TH>Highest</TH><TH>Pass rate</TH><TH>Marks entered</TH></TR></THead>
              <TBody>
                {data.subjectStats.map((s) => (
                  <TR key={s.subjectId}>
                    <TD className="font-medium">{s.name}</TD>
                    <TD label="Average" className="tabular-nums">{s.average ?? "—"} / {s.maxMarks}</TD>
                    <TD label="Highest" className="tabular-nums">{s.highest ?? "—"}</TD>
                    <TD label="Pass rate">{formatPercent(s.passRate)}</TD>
                    <TD label="Entered" className="tabular-nums">{s.entered}/{data.rows.length}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
