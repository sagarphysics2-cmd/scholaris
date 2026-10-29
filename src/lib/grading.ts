import { round2, toNumber } from "./utils";

/**
 * Pure academic calculations (no DB access) — unit tested in tests/unit/grading.test.ts.
 */

export type GradeBand = { grade: string; minPercent: number | { toString(): string }; gradePoint?: unknown; remark?: string | null };

export const DEFAULT_GRADE_SCALE: Array<{ grade: string; minPercent: number; gradePoint: number; remark: string }> = [
  { grade: "A+", minPercent: 90, gradePoint: 4.0, remark: "Outstanding" },
  { grade: "A", minPercent: 80, gradePoint: 3.7, remark: "Excellent" },
  { grade: "B+", minPercent: 70, gradePoint: 3.3, remark: "Very good" },
  { grade: "B", minPercent: 60, gradePoint: 3.0, remark: "Good" },
  { grade: "C", minPercent: 50, gradePoint: 2.0, remark: "Satisfactory" },
  { grade: "D", minPercent: 40, gradePoint: 1.0, remark: "Needs improvement" },
  { grade: "F", minPercent: 0, gradePoint: 0, remark: "Fail" },
];

export function percentage(obtained: number, max: number) {
  if (max <= 0) return 0;
  return round2((obtained / max) * 100);
}

/** Highest band whose minimum the percentage reaches. */
export function gradeFor(percent: number, scale: GradeBand[]): string {
  const sorted = [...scale].sort((a, b) => toNumber(b.minPercent) - toNumber(a.minPercent));
  for (const band of sorted) if (percent >= toNumber(band.minPercent)) return band.grade;
  return sorted.at(-1)?.grade ?? "—";
}

export type SubjectMark = {
  subjectId: string;
  subjectName: string;
  maxMarks: number;
  passingMarks: number;
  marksObtained: number | null;
  isAbsent: boolean;
};

export type SubjectResult = SubjectMark & { percent: number | null; grade: string; passed: boolean };

export type ExamResult = {
  subjects: SubjectResult[];
  totalObtained: number;
  totalMax: number;
  percent: number;
  grade: string;
  passed: boolean;
  /** True when at least one subject has no mark entered yet. */
  incomplete: boolean;
};

/**
 * Computes a student's result for one examination.
 * A student passes when every subject meets its passing marks (absent = fail) AND the
 * overall percentage meets the school's overall pass percentage.
 */
export function computeResult(marks: SubjectMark[], scale: GradeBand[], overallPassPercent = 40): ExamResult {
  let totalObtained = 0;
  let totalMax = 0;
  let incomplete = false;
  const subjects = marks.map((m) => {
    totalMax += m.maxMarks;
    if (m.isAbsent) return { ...m, percent: 0, grade: "AB", passed: false };
    if (m.marksObtained === null) {
      incomplete = true;
      return { ...m, percent: null, grade: "—", passed: false };
    }
    totalObtained += m.marksObtained;
    const pct = percentage(m.marksObtained, m.maxMarks);
    return { ...m, percent: pct, grade: gradeFor(pct, scale), passed: m.marksObtained >= m.passingMarks };
  });
  const pct = percentage(totalObtained, totalMax);
  return {
    subjects,
    totalObtained: round2(totalObtained),
    totalMax,
    percent: pct,
    grade: gradeFor(pct, scale),
    passed: !incomplete && subjects.length > 0 && subjects.every((s) => s.passed) && pct >= overallPassPercent,
    incomplete,
  };
}

export function average(values: number[]) {
  if (values.length === 0) return null;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Assigns competition-style ranks (1, 2, 2, 4) by descending score. */
export function rank<T>(items: T[], score: (t: T) => number): Array<T & { rank: number }> {
  const sorted = [...items].sort((a, b) => score(b) - score(a));
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((item, i) => {
    const s = score(item);
    if (s !== lastScore) {
      lastRank = i + 1;
      lastScore = s;
    }
    return { ...item, rank: lastRank };
  });
}
