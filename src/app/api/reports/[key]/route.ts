import type { NextRequest } from "next/server";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { toCSV } from "@/lib/csv";
import { csvResponse, handleRouteError } from "@/server/http";
import { auditReportExport, runReport, type ReportFilter, type ReportParams } from "@/server/services/reports.service";

const FILTERS: ReportFilter[] = ["date", "month", "from", "to", "classId", "sectionId", "examId", "status"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const actor = await requireActorOrThrow();
    const { key } = await params;
    const p: ReportParams = Object.fromEntries(FILTERS.map((f) => [f, req.nextUrl.searchParams.get(f)?.slice(0, 64)]).filter(([, v]) => v));
    const { output } = await runReport(actor, key, p);
    await auditReportExport(actor, key, p, output.rows.length);
    const csv = toCSV(output.columns.map((c) => c.label), output.rows.map((r) => output.columns.map((c) => r[c.key] ?? "")));
    return csvResponse(csv, `${key}-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (err) {
    return handleRouteError(err);
  }
}
