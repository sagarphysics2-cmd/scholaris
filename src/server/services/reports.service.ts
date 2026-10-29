import { db } from "@/lib/db";
import { attendanceRate, emptyCounts } from "@/lib/attendance";
import { average, computeResult, rank, type SubjectMark } from "@/lib/grading";
import { balance, displayStatus, netAmount } from "@/lib/fees";
import { addDays, round2, todayUTC, toISODate, toNumber } from "@/lib/utils";
import { audit } from "@/server/audit";
import { assertCan, requireSchoolId, type Actor } from "@/server/authz/guards";
import { getCurrentAcademicYear } from "@/server/authz/scope";
import { ValidationError } from "@/server/errors";
import { schoolSettings } from "./attendance.service";
import { gradeScale, sectionResults } from "./exams.service";
import { listStudents } from "./students.service";

/**
 * Report registry. Every report declares its filters and returns a table
 * (columns + rows) plus summary figures. The same output drives the on-screen view,
 * the print view and CSV export, so they can never disagree.
 */

export type ReportFilter = "date" | "month" | "from" | "to" | "classId" | "sectionId" | "examId" | "status";
export type ReportColumn = { key: string; label: string; align?: "right" | "center"; format?: "percent" | "money" | "date" };
export type ReportOutput = { columns: ReportColumn[]; rows: Array<Record<string, string | number | null>>; summary?: Array<{ label: string; value: string | number; format?: ReportColumn["format"] }> };
export type ReportParams = Partial<Record<ReportFilter, string>>;

type ReportDef = {
  key: string;
  category: "Students" | "Attendance" | "Academic" | "Finance";
  title: string;
  description: string;
  filters: ReportFilter[];
  run: (actor: Actor, p: ReportParams) => Promise<ReportOutput>;
};

const d = (s: string | undefined, fallback: Date) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : fallback);

async function sectionsFor(schoolId: string, p: ReportParams) {
  const year = await getCurrentAcademicYear(schoolId);
  return db.section.findMany({
    where: { academicYearId: year?.id ?? "__none__", class: { schoolId }, ...(p.sectionId ? { id: p.sectionId } : {}), ...(p.classId ? { classId: p.classId } : {}) },
    include: { class: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
    orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
  });
}

async function requireExam(schoolId: string, examId?: string) {
  const exam = examId ? await db.examination.findFirst({ where: { id: examId, schoolId } }) : await db.examination.findFirst({ where: { schoolId, subjects: { some: { marks: { some: {} } } } }, orderBy: { startDate: "desc" } });
  if (!exam) throw new ValidationError("Choose an examination with marks.");
  return exam;
}

const REPORTS: ReportDef[] = [
  {
    key: "student-list",
    category: "Students",
    title: "Student list",
    description: "All students with class, roll number, guardian and contact details.",
    filters: ["classId", "sectionId", "status"],
    async run(actor, p) {
      const { rows } = await listStudents(actor, { classId: p.classId, sectionId: p.sectionId, status: p.status, skip: 0, take: 5000 });
      return {
        columns: [
          { key: "code", label: "Student ID" }, { key: "name", label: "Name" }, { key: "class", label: "Class" }, { key: "roll", label: "Roll", align: "right" },
          { key: "gender", label: "Gender" }, { key: "dob", label: "Date of birth", format: "date" }, { key: "guardian", label: "Guardian" }, { key: "phone", label: "Guardian phone" }, { key: "status", label: "Status" },
        ],
        rows: rows.map((s) => {
          const e = s.enrollments[0];
          const g = s.parents[0]?.parent.user;
          return { code: s.studentCode, name: `${s.user.firstName} ${s.user.lastName}`, class: e ? `${e.section.class.name}-${e.section.name}` : "", roll: e?.rollNumber ?? null, gender: s.gender, dob: toISODate(s.dateOfBirth), guardian: g ? `${g.firstName} ${g.lastName}` : "", phone: g?.phone ?? "", status: s.status };
        }),
        summary: [{ label: "Students", value: rows.length }],
      };
    },
  },
  {
    key: "daily-attendance",
    category: "Attendance",
    title: "Daily attendance",
    description: "Attendance for each section on a chosen day, including sections not yet marked.",
    filters: ["date", "classId"],
    async run(actor, p) {
      const schoolId = requireSchoolId(actor);
      const date = d(p.date, todayUTC());
      const [sections, settings] = await Promise.all([sectionsFor(schoolId, p), schoolSettings(schoolId)]);
      const grouped = await db.attendance.groupBy({ by: ["sectionId", "status"], where: { date, sectionId: { in: sections.map((s) => s.id) } }, _count: true });
      const total = emptyCounts();
      const rows = sections.map((s) => {
        const c = emptyCounts();
        grouped.filter((g) => g.sectionId === s.id).forEach((g) => ((c[g.status] += g._count), (total[g.status] += g._count)));
        const marked = c.PRESENT + c.ABSENT + c.LATE + c.EXCUSED;
        return { section: `${s.class.name}-${s.name}`, students: s._count.enrollments, present: c.PRESENT, absent: c.ABSENT, late: c.LATE, excused: c.EXCUSED, unmarked: s._count.enrollments - marked, rate: marked ? attendanceRate(c, settings.attendance.lateCountsAsPresent) : null };
      });
      return {
        columns: [{ key: "section", label: "Section" }, { key: "students", label: "Students", align: "right" }, { key: "present", label: "Present", align: "right" }, { key: "absent", label: "Absent", align: "right" }, { key: "late", label: "Late", align: "right" }, { key: "excused", label: "Excused", align: "right" }, { key: "unmarked", label: "Unmarked", align: "right" }, { key: "rate", label: "Rate", align: "right", format: "percent" }],
        rows,
        summary: [{ label: "Date", value: toISODate(date), format: "date" }, { label: "School rate", value: attendanceRate(total, settings.attendance.lateCountsAsPresent) ?? "—", format: "percent" }, { label: "Absent", value: total.ABSENT }, { label: "Sections not marked", value: rows.filter((r) => r.unmarked === r.students && r.students > 0).length }],
      };
    },
  },
  {
    key: "monthly-attendance",
    category: "Attendance",
    title: "Monthly attendance",
    description: "Attendance rate per section for a month, with total absences and late arrivals.",
    filters: ["month", "classId"],
    async run(actor, p) {
      const schoolId = requireSchoolId(actor);
      const month = p.month && /^\d{4}-\d{2}$/.test(p.month) ? p.month : toISODate(todayUTC()).slice(0, 7);
      const from = new Date(`${month}-01T00:00:00Z`);
      const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
      const [sections, settings] = await Promise.all([sectionsFor(schoolId, p), schoolSettings(schoolId)]);
      const grouped = await db.attendance.groupBy({ by: ["sectionId", "status"], where: { date: { gte: from, lte: to }, sectionId: { in: sections.map((s) => s.id) } }, _count: true });
      const days = await db.attendance.groupBy({ by: ["sectionId", "date"], where: { date: { gte: from, lte: to }, sectionId: { in: sections.map((s) => s.id) } } });
      return {
        columns: [{ key: "section", label: "Section" }, { key: "students", label: "Students", align: "right" }, { key: "days", label: "Days marked", align: "right" }, { key: "absent", label: "Absences", align: "right" }, { key: "late", label: "Late", align: "right" }, { key: "rate", label: "Rate", align: "right", format: "percent" }],
        rows: sections.map((s) => {
          const c = emptyCounts();
          grouped.filter((g) => g.sectionId === s.id).forEach((g) => (c[g.status] += g._count));
          return { section: `${s.class.name}-${s.name}`, students: s._count.enrollments, days: days.filter((x) => x.sectionId === s.id).length, absent: c.ABSENT, late: c.LATE, rate: attendanceRate(c, settings.attendance.lateCountsAsPresent) };
        }),
        summary: [{ label: "Month", value: month }],
      };
    },
  },
  {
    key: "student-attendance",
    category: "Attendance",
    title: "Student attendance",
    description: "Per-student attendance over a date range, lowest first — find students who need support.",
    filters: ["from", "to", "classId", "sectionId"],
    async run(actor, p) {
      const schoolId = requireSchoolId(actor);
      const year = await getCurrentAcademicYear(schoolId);
      const from = d(p.from, year?.startDate ?? addDays(todayUTC(), -90));
      const to = d(p.to, todayUTC());
      const [sections, settings] = await Promise.all([sectionsFor(schoolId, p), schoolSettings(schoolId)]);
      const enrollments = await db.enrollment.findMany({ where: { sectionId: { in: sections.map((s) => s.id) }, status: "ACTIVE" }, include: { student: { include: { user: true } }, section: { include: { class: true } } } });
      const grouped = await db.attendance.groupBy({ by: ["studentId", "status"], where: { date: { gte: from, lte: to }, studentId: { in: enrollments.map((e) => e.studentId) } }, _count: true });
      const rows = enrollments.map((e) => {
        const c = emptyCounts();
        grouped.filter((g) => g.studentId === e.studentId).forEach((g) => (c[g.status] += g._count));
        return { name: `${e.student.user.firstName} ${e.student.user.lastName}`, section: `${e.section.class.name}-${e.section.name}`, roll: e.rollNumber, present: c.PRESENT, absent: c.ABSENT, late: c.LATE, excused: c.EXCUSED, rate: attendanceRate(c, settings.attendance.lateCountsAsPresent) };
      });
      rows.sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
      return {
        columns: [{ key: "name", label: "Student" }, { key: "section", label: "Section" }, { key: "roll", label: "Roll", align: "right" }, { key: "present", label: "Present", align: "right" }, { key: "absent", label: "Absent", align: "right" }, { key: "late", label: "Late", align: "right" }, { key: "excused", label: "Excused", align: "right" }, { key: "rate", label: "Rate", align: "right", format: "percent" }],
        rows,
        summary: [{ label: "From", value: toISODate(from), format: "date" }, { label: "To", value: toISODate(to), format: "date" }, { label: `Below ${settings.attendance.lowAttendanceThreshold}%`, value: rows.filter((r) => r.rate !== null && r.rate < settings.attendance.lowAttendanceThreshold).length }],
      };
    },
  },
  {
    key: "exam-results",
    category: "Academic",
    title: "Exam results",
    description: "Full result sheet for one section: marks per subject, totals, grade and rank.",
    filters: ["examId", "sectionId"],
    async run(actor, p) {
      const schoolId = requireSchoolId(actor);
      const exam = await requireExam(schoolId, p.examId);
      const sectionId = p.sectionId ?? (await sectionsFor(schoolId, {}))[0]?.id;
      if (!sectionId) throw new ValidationError("Choose a section.");
      const r = await sectionResults(actor, exam.id, sectionId);
      return {
        columns: [{ key: "roll", label: "Roll", align: "right" }, { key: "name", label: "Student" }, ...r.papers.map((p) => ({ key: p.subjectId, label: p.subject.name, align: "right" as const })), { key: "total", label: "Total", align: "right" }, { key: "percent", label: "%", align: "right", format: "percent" }, { key: "grade", label: "Grade", align: "center" }, { key: "rank", label: "Rank", align: "right" }, { key: "result", label: "Result" }],
        rows: r.rows.map((row) => ({ roll: row.roll, name: row.name, ...Object.fromEntries(row.subjects.map((s) => [s.subjectId, s.isAbsent ? "AB" : s.marksObtained])), total: `${row.totalObtained}/${row.totalMax}`, percent: row.percent, grade: row.grade, rank: row.incomplete ? null : row.rank, result: row.incomplete ? "Incomplete" : row.passed ? "Pass" : "Fail" })),
        summary: [{ label: "Examination", value: exam.name }, { label: "Section", value: `${r.section.class.name}-${r.section.name}` }, { label: "Class average", value: r.classAverage ?? "—", format: "percent" }, { label: "Pass rate", value: r.passRate ?? "—", format: "percent" }],
      };
    },
  },
  {
    key: "class-performance",
    category: "Academic",
    title: "Class performance",
    description: "Average, pass rate and top scorer for every section in an examination.",
    filters: ["examId", "classId"],
    async run(actor, p) {
      const schoolId = requireSchoolId(actor);
      const exam = await requireExam(schoolId, p.examId);
      const sections = await sectionsFor(schoolId, p);
      const rows = [];
      for (const s of sections) {
        const r = await sectionResults(actor, exam.id, s.id);
        if (!r.papers.length) continue;
        const top = r.rows.filter((x) => !x.incomplete).sort((a, b) => b.percent - a.percent)[0];
        rows.push({ section: `${s.class.name}-${s.name}`, students: r.rows.length, average: r.classAverage, passRate: r.passRate, top: top ? `${top.name} (${top.percent}%)` : "—", incomplete: r.rows.filter((x) => x.incomplete).length });
      }
      return {
        columns: [{ key: "section", label: "Section" }, { key: "students", label: "Students", align: "right" }, { key: "average", label: "Average", align: "right", format: "percent" }, { key: "passRate", label: "Pass rate", align: "right", format: "percent" }, { key: "top", label: "Top scorer" }, { key: "incomplete", label: "Missing marks", align: "right" }],
        rows,
        summary: [{ label: "Examination", value: exam.name }, { label: "School average", value: average(rows.map((r) => r.average).filter((v): v is number => v !== null)) ?? "—", format: "percent" }],
      };
    },
  },
  {
    key: "subject-performance",
    category: "Academic",
    title: "Subject performance",
    description: "Average, highest, lowest and pass rate for each subject paper.",
    filters: ["examId", "classId"],
    async run(actor, p) {
      const schoolId = requireSchoolId(actor);
      const exam = await requireExam(schoolId, p.examId);
      const papers = await db.examSubject.findMany({ where: { examinationId: exam.id, ...(p.classId ? { classId: p.classId } : {}) }, include: { subject: true, class: true, marks: true }, orderBy: [{ class: { level: "asc" } }, { subject: { name: "asc" } }] });
      return {
        columns: [{ key: "class", label: "Class" }, { key: "subject", label: "Subject" }, { key: "entered", label: "Marked", align: "right" }, { key: "average", label: "Average %", align: "right", format: "percent" }, { key: "highest", label: "Highest", align: "right" }, { key: "lowest", label: "Lowest", align: "right" }, { key: "passRate", label: "Pass rate", align: "right", format: "percent" }],
        rows: papers.map((pp) => {
          const vals = pp.marks.filter((m) => !m.isAbsent && m.marksObtained !== null).map((m) => toNumber(m.marksObtained));
          return { class: pp.class.name, subject: pp.subject.name, entered: vals.length, average: vals.length ? round2((average(vals)! / pp.maxMarks) * 100) : null, highest: vals.length ? Math.max(...vals) : null, lowest: vals.length ? Math.min(...vals) : null, passRate: vals.length ? round2((vals.filter((v) => v >= pp.passingMarks).length / vals.length) * 100) : null };
        }),
        summary: [{ label: "Examination", value: exam.name }],
      };
    },
  },
  {
    key: "student-performance",
    category: "Academic",
    title: "Student performance",
    description: "Every student ranked by overall percentage across the school (or a class).",
    filters: ["examId", "classId"],
    async run(actor, p) {
      const schoolId = requireSchoolId(actor);
      const exam = await requireExam(schoolId, p.examId);
      const [scale, settings] = await Promise.all([gradeScale(schoolId), schoolSettings(schoolId)]);
      const papers = await db.examSubject.findMany({ where: { examinationId: exam.id, ...(p.classId ? { classId: p.classId } : {}) }, include: { subject: true, marks: true } });
      const enrollments = await db.enrollment.findMany({ where: { academicYearId: exam.academicYearId, section: { classId: { in: [...new Set(papers.map((x) => x.classId))] } } }, include: { student: { include: { user: true } }, section: { include: { class: true } } } });
      const results = enrollments.map((e) => {
        const marks: SubjectMark[] = papers.filter((pp) => pp.classId === e.section.classId).map((pp) => {
          const m = pp.marks.find((x) => x.studentId === e.studentId);
          return { subjectId: pp.subjectId, subjectName: pp.subject.name, maxMarks: pp.maxMarks, passingMarks: pp.passingMarks, marksObtained: m?.marksObtained == null ? null : toNumber(m.marksObtained), isAbsent: m?.isAbsent ?? false };
        });
        const r = computeResult(marks, scale, settings.exams.overallPassPercent);
        return { name: `${e.student.user.firstName} ${e.student.user.lastName}`, section: `${e.section.class.name}-${e.section.name}`, percent: r.percent, grade: r.grade, result: r.incomplete ? "Incomplete" : r.passed ? "Pass" : "Fail" };
      });
      return {
        columns: [{ key: "rank", label: "Rank", align: "right" }, { key: "name", label: "Student" }, { key: "section", label: "Section" }, { key: "percent", label: "%", align: "right", format: "percent" }, { key: "grade", label: "Grade", align: "center" }, { key: "result", label: "Result" }],
        rows: rank(results, (r) => r.percent),
        summary: [{ label: "Examination", value: exam.name }, { label: "Students", value: results.length }, { label: "Passed", value: results.filter((r) => r.result === "Pass").length }],
      };
    },
  },
  ...(["paid", "pending", "overdue"] as const).map(
    (kind): ReportDef => ({
      key: `${kind}-fees`,
      category: "Finance",
      title: kind === "paid" ? "Paid fees" : kind === "pending" ? "Pending fees" : "Overdue fees",
      description: kind === "paid" ? "Payments received in a period, with receipt numbers." : kind === "pending" ? "Unpaid or partly paid fees that are not yet due." : "Fees past their due date with an outstanding balance.",
      filters: kind === "paid" ? ["from", "to"] : ["classId"],
      async run(actor, p) {
        const schoolId = requireSchoolId(actor);
        if (kind === "paid") {
          const from = d(p.from, addDays(todayUTC(), -30));
          const to = d(p.to, todayUTC());
          const payments = await db.feePayment.findMany({ where: { fee: { schoolId }, paidAt: { gte: from, lt: addDays(to, 1) } }, orderBy: { paidAt: "asc" }, include: { fee: { include: { category: true, student: { include: { user: true } } } } } });
          const sum = payments.reduce((a, x) => a + toNumber(x.amount), 0);
          return {
            columns: [{ key: "receipt", label: "Receipt" }, { key: "date", label: "Date", format: "date" }, { key: "student", label: "Student" }, { key: "fee", label: "Fee" }, { key: "method", label: "Method" }, { key: "amount", label: "Amount", align: "right", format: "money" }],
            rows: payments.map((x) => ({ receipt: x.receiptNumber, date: toISODate(x.paidAt), student: `${x.fee.student.user.firstName} ${x.fee.student.user.lastName}`, fee: x.fee.title, method: x.method, amount: toNumber(x.amount) })),
            summary: [{ label: "Payments", value: payments.length }, { label: "Total collected", value: round2(sum), format: "money" }],
          };
        }
        const today = todayUTC();
        const year = await getCurrentAcademicYear(schoolId);
        const fees = await db.fee.findMany({
          where: { schoolId, status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: kind === "overdue" ? { lt: today } : { gte: today }, ...(p.classId ? { student: { enrollments: { some: { section: { classId: p.classId }, academicYearId: year?.id } } } } : {}) },
          orderBy: { dueDate: "asc" },
          include: { student: { include: { user: true, parents: { include: { parent: { include: { user: true } } }, take: 1 }, enrollments: { where: { academicYearId: year?.id }, include: { section: { include: { class: true } } } } } } },
        });
        const total = fees.reduce((a, f) => a + balance(f), 0);
        return {
          columns: [{ key: "student", label: "Student" }, { key: "class", label: "Class" }, { key: "fee", label: "Fee" }, { key: "due", label: "Due date", format: "date" }, { key: "net", label: "Net", align: "right", format: "money" }, { key: "paid", label: "Paid", align: "right", format: "money" }, { key: "balance", label: "Balance", align: "right", format: "money" }, { key: "guardian", label: "Guardian phone" }],
          rows: fees.map((f) => {
            const e = f.student.enrollments[0];
            return { student: `${f.student.user.firstName} ${f.student.user.lastName}`, class: e ? `${e.section.class.name}-${e.section.name}` : "", fee: f.title, due: toISODate(f.dueDate), net: netAmount(f), paid: toNumber(f.amountPaid), balance: balance(f), guardian: f.student.parents[0]?.parent.user.phone ?? "" };
          }),
          summary: [{ label: "Fees", value: fees.length }, { label: "Total outstanding", value: round2(total), format: "money" }],
        };
      },
    }),
  ),
  {
    key: "fee-collection-summary",
    category: "Finance",
    title: "Fee collection summary",
    description: "Billed, collected and outstanding by fee category and by status for the academic year.",
    filters: [],
    async run(actor) {
      const schoolId = requireSchoolId(actor);
      const year = await getCurrentAcademicYear(schoolId);
      const fees = await db.fee.findMany({ where: { schoolId, academicYearId: year?.id }, include: { category: true } });
      const groups = new Map<string, { billed: number; collected: number; overdue: number; count: number }>();
      for (const f of fees) {
        const g = groups.get(f.category.name) ?? { billed: 0, collected: 0, overdue: 0, count: 0 };
        g.billed += netAmount(f);
        g.collected += toNumber(f.amountPaid);
        if (displayStatus(f) === "OVERDUE") g.overdue += balance(f);
        g.count++;
        groups.set(f.category.name, g);
      }
      const rows = [...groups.entries()].map(([category, g]) => ({ category, items: g.count, billed: round2(g.billed), collected: round2(g.collected), outstanding: round2(g.billed - g.collected), overdue: round2(g.overdue), rate: g.billed ? round2((g.collected / g.billed) * 100) : null }));
      const t = rows.reduce((a, r) => ({ billed: a.billed + r.billed, collected: a.collected + r.collected }), { billed: 0, collected: 0 });
      return {
        columns: [{ key: "category", label: "Category" }, { key: "items", label: "Items", align: "right" }, { key: "billed", label: "Billed", align: "right", format: "money" }, { key: "collected", label: "Collected", align: "right", format: "money" }, { key: "outstanding", label: "Outstanding", align: "right", format: "money" }, { key: "overdue", label: "Overdue", align: "right", format: "money" }, { key: "rate", label: "Collected %", align: "right", format: "percent" }],
        rows,
        summary: [{ label: "Billed", value: round2(t.billed), format: "money" }, { label: "Collected", value: round2(t.collected), format: "money" }, { label: "Collection rate", value: t.billed ? round2((t.collected / t.billed) * 100) : "—", format: "percent" }],
      };
    },
  },
];

export function reportCatalog() {
  return REPORTS.map(({ key, category, title, description, filters }) => ({ key, category, title, description, filters }));
}

export async function runReport(actor: Actor, key: string, params: ReportParams) {
  assertCan(actor, "reports.view");
  const def = REPORTS.find((r) => r.key === key);
  if (!def) throw new ValidationError("Unknown report.");
  // Finance reports additionally need fee access; academic ones need results access.
  if (def.category === "Finance") assertCan(actor, "fees.manage");
  const output = await def.run(actor, params);
  return { def: { key: def.key, title: def.title, description: def.description, filters: def.filters, category: def.category }, output };
}

export async function auditReportExport(actor: Actor, key: string, params: ReportParams, rows: number) {
  await audit(actor, { action: "report.export", entity: "Report", entityId: key, metadata: { params, rows } });
}
