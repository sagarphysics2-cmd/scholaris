import type { Metadata } from "next";
import { Download } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { sp } from "@/components/ui/pagination";
import { PrintButton } from "@/components/ui/print-button";
import { DateParam, FilterSelect } from "@/components/ui/url-controls";
import { requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { cn, formatCurrency, formatDate, formatPercent, toISODate, todayUTC } from "@/lib/utils";
import { AppError } from "@/server/errors";
import { schoolSettings } from "@/server/services/attendance.service";
import { runReport, type ReportColumn, type ReportFilter, type ReportParams } from "@/server/services/reports.service";
import { classOptions, sectionOptions } from "@/server/services/students.service";

export const metadata: Metadata = { title: "Report" };

const FILTERS: ReportFilter[] = ["date", "month", "from", "to", "classId", "sectionId", "examId", "status"];

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { key } = await params;
  const q = await searchParams;
  const actor = await requirePermission("reports.view");
  const p: ReportParams = Object.fromEntries(FILTERS.map((f) => [f, sp(q, f)]).filter(([, v]) => v));
  const { currency } = await schoolSettings(actor.schoolId!);
  let result: Awaited<ReturnType<typeof runReport>> | null = null;
  let error: string | null = null;
  try {
    result = await runReport(actor, key, p);
  } catch (e) {
    if (e instanceof AppError && e.status !== 403) error = e.message;
    else throw e;
  }
  const def = result?.def;
  const filters = def?.filters ?? [];
  const [classes, sections, exams] = await Promise.all([
    classOptions(actor.schoolId!),
    sectionOptions(actor.schoolId!),
    filters.includes("examId") ? db.examination.findMany({ where: { schoolId: actor.schoolId! }, orderBy: { startDate: "desc" } }) : [],
  ]);
  const fmt = (v: string | number | null | undefined, f?: ReportColumn["format"]) => {
    if (v === null || v === undefined || v === "") return "—";
    if (f === "percent") return typeof v === "number" ? formatPercent(v) : v;
    if (f === "money") return typeof v === "number" ? formatCurrency(v, currency) : v;
    if (f === "date") return formatDate(String(v));
    return v;
  };
  const qs = new URLSearchParams(p as Record<string, string>).toString();
  const months = Array.from({ length: 12 }, (_, i) => {
    const dt = new Date(Date.UTC(todayUTC().getUTCFullYear(), todayUTC().getUTCMonth() - i, 1));
    return { value: toISODate(dt).slice(0, 7), label: dt.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) };
  });

  return (
    <>
      <PageHeader
        title={def?.title ?? "Report"}
        description={def?.description}
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: def?.title ?? key }]}
        actions={result && (
          <>
            <PrintButton />
            <ButtonLink href={`/api/reports/${key}${qs ? `?${qs}` : ""}`} variant="outline" prefetch={false}><Download /> Export CSV</ButtonLink>
          </>
        )}
      />
      {filters.length > 0 && (
        <Card className="no-print mb-6">
          <Toolbar>
            {filters.includes("date") && <DateParam param="date" label="Date" fallback={toISODate(todayUTC())} />}
            {filters.includes("month") && <FilterSelect param="month" label="Month" placeholder="This month" options={months} />}
            {filters.includes("from") && <><span className="text-sm text-muted-foreground">From</span><DateParam param="from" label="From" /></>}
            {filters.includes("to") && <><span className="text-sm text-muted-foreground">To</span><DateParam param="to" label="To" /></>}
            {filters.includes("examId") && <FilterSelect param="examId" label="Examination" placeholder="Latest examination" options={exams.map((e) => ({ value: e.id, label: e.name }))} />}
            {filters.includes("classId") && <FilterSelect param="classId" label="Class" placeholder="All classes" options={classes} />}
            {filters.includes("sectionId") && <FilterSelect param="sectionId" label="Section" placeholder={key === "exam-results" ? "First section" : "All sections"} options={sections.filter((s) => !p.classId || s.classId === p.classId)} />}
            {filters.includes("status") && <FilterSelect param="status" label="Status" placeholder="Current students" options={["ACTIVE", "SUSPENDED", "GRADUATED", "TRANSFERRED", "ARCHIVED"].map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() }))} />}
          </Toolbar>
        </Card>
      )}
      {error ? (
        <Card><EmptyState title="Can't run this report" description={error} /></Card>
      ) : result && (
        <Card className="print-area">
          <div className="hidden border-b p-4 print:block">
            <p className="text-lg font-semibold">{def!.title}</p>
            <p className="text-xs text-muted-foreground">Generated {formatDate(new Date())}</p>
          </div>
          {result.output.summary && (
            <div className="flex flex-wrap gap-x-8 gap-y-2 border-b px-5 py-3 text-sm">
              {result.output.summary.map((s) => (
                <span key={s.label}><span className="text-muted-foreground">{s.label}: </span><strong className="tabular-nums">{fmt(s.value, s.format)}</strong></span>
              ))}
            </div>
          )}
          {result.output.rows.length === 0 ? (
            <EmptyState title="No data for these filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {result.output.columns.map((c) => (
                      <th key={c.key} className={cn("whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.output.rows.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      {result!.output.columns.map((c) => (
                        <td key={c.key} className={cn("whitespace-nowrap px-4 py-2", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center")}>{fmt(r[c.key], c.format)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t px-5 py-2 text-xs text-muted-foreground">{result.output.rows.length} row{result.output.rows.length === 1 ? "" : "s"}</p>
        </Card>
      )}
    </>
  );
}
