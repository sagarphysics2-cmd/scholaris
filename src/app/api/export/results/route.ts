import type { NextRequest } from "next/server";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { toCSV } from "@/lib/csv";
import { audit } from "@/server/audit";
import { csvResponse, handleRouteError } from "@/server/http";
import { sectionResults } from "@/server/services/exams.service";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActorOrThrow();
    const examId = req.nextUrl.searchParams.get("examId") ?? "";
    const sectionId = req.nextUrl.searchParams.get("sectionId") ?? "";
    const d = await sectionResults(actor, examId, sectionId);
    await audit(actor, { action: "results.export", entity: "Examination", entityId: examId, metadata: { sectionId } });
    const csv = toCSV(
      ["Roll", "Student", ...d.papers.map((p) => `${p.subject.name} (/${p.maxMarks})`), "Total", "Max", "Percent", "Grade", "Rank", "Result"],
      d.rows.map((r) => [r.roll, r.name, ...r.subjects.map((s) => (s.isAbsent ? "AB" : s.marksObtained ?? "")), r.totalObtained, r.totalMax, r.percent, r.grade, r.incomplete ? "" : r.rank, r.incomplete ? "Incomplete" : r.passed ? "Pass" : "Fail"]),
    );
    return csvResponse(csv, `results-${d.section.class.name}-${d.section.name}.csv`);
  } catch (err) {
    return handleRouteError(err);
  }
}
