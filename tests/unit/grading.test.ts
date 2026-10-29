import { describe, expect, it } from "vitest";
import { DEFAULT_GRADE_SCALE, average, computeResult, gradeFor, percentage, rank, type SubjectMark } from "@/lib/grading";

const mark = (marksObtained: number | null, over: Partial<SubjectMark> = {}): SubjectMark => ({
  subjectId: Math.random().toString(),
  subjectName: "S",
  maxMarks: 100,
  passingMarks: 35,
  marksObtained,
  isAbsent: false,
  ...over,
});

describe("grading", () => {
  it("computes percentages with 2-decimal rounding", () => {
    expect(percentage(45, 60)).toBe(75);
    expect(percentage(1, 3)).toBe(33.33);
    expect(percentage(5, 0)).toBe(0);
  });

  it("assigns the highest band reached", () => {
    expect(gradeFor(95, DEFAULT_GRADE_SCALE)).toBe("A+");
    expect(gradeFor(90, DEFAULT_GRADE_SCALE)).toBe("A+");
    expect(gradeFor(89.99, DEFAULT_GRADE_SCALE)).toBe("A");
    expect(gradeFor(40, DEFAULT_GRADE_SCALE)).toBe("D");
    expect(gradeFor(0, DEFAULT_GRADE_SCALE)).toBe("F");
  });

  it("passes only when every subject and the overall percentage pass", () => {
    const ok = computeResult([mark(80), mark(60)], DEFAULT_GRADE_SCALE, 40);
    expect(ok).toMatchObject({ totalObtained: 140, totalMax: 200, percent: 70, grade: "B+", passed: true, incomplete: false });

    const failedSubject = computeResult([mark(90), mark(30)], DEFAULT_GRADE_SCALE, 40);
    expect(failedSubject.percent).toBe(60);
    expect(failedSubject.passed).toBe(false);

    const lowOverall = computeResult([mark(36), mark(36)], DEFAULT_GRADE_SCALE, 40);
    expect(lowOverall.passed).toBe(false);
  });

  it("treats absence as a fail with zero and missing marks as incomplete", () => {
    const absent = computeResult([mark(null, { isAbsent: true }), mark(90)], DEFAULT_GRADE_SCALE);
    expect(absent.subjects[0]).toMatchObject({ grade: "AB", passed: false });
    expect(absent.percent).toBe(45);
    expect(absent.passed).toBe(false);

    const pending = computeResult([mark(null), mark(90)], DEFAULT_GRADE_SCALE);
    expect(pending.incomplete).toBe(true);
    expect(pending.passed).toBe(false);
  });

  it("ranks with ties sharing a position", () => {
    const r = rank([{ n: "a", s: 90 }, { n: "b", s: 95 }, { n: "c", s: 90 }, { n: "d", s: 70 }], (x) => x.s);
    expect(r.map((x) => [x.n, x.rank])).toEqual([["b", 1], ["a", 2], ["c", 2], ["d", 4]]);
  });

  it("averages safely", () => {
    expect(average([])).toBeNull();
    expect(average([1, 2, 2])).toBe(1.67);
  });
});
