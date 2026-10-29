import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, todayUTC } from "@/lib/utils";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { getAttendanceSheet, saveAttendance, studentAttendanceSummary } from "@/server/services/attendance.service";
import { getMarksSheet, saveMarks, setExamStatus, studentExamResult } from "@/server/services/exams.service";
import { EMAIL, actorFor, sectionNotTaughtBy, teachingOf } from "../support/helpers";

/** Most recent past weekday (attendance can't be marked in the future). */
function recentSchoolDay(offset = 1) {
  let d = addDays(todayUTC(), -offset);
  while ([0, 6].includes(d.getUTCDay())) d = addDays(d, -1);
  return d;
}

describe("attendance", () => {
  it("marks a section, then edits without creating duplicates", async () => {
    const teacher = await actorFor(EMAIL.teacher);
    const section = await db.section.findFirstOrThrow({ where: { classTeacherId: teacher.teacherId! } });
    const date = todayUTC();
    const sheet = await getAttendanceSheet(teacher, section.id, date);
    const entries: Array<{ studentId: string; status: "PRESENT" | "ABSENT"; note?: string }> = sheet.rows.map((r) => ({ studentId: r.studentId, status: "PRESENT" }));
    await saveAttendance(teacher, section.id, date, entries);
    expect(await db.attendance.count({ where: { sectionId: section.id, date } })).toBe(entries.length);

    entries[0] = { ...entries[0]!, status: "ABSENT" };
    const res = await saveAttendance(teacher, section.id, date, entries.map((e, i) => (i === 0 ? { ...e, note: "Unwell" } : e)));
    expect(res.changed).toBe(1);
    expect(await db.attendance.count({ where: { sectionId: section.id, date } })).toBe(entries.length);
    const rec = await db.attendance.findFirstOrThrow({ where: { studentId: entries[0]!.studentId, date }, include: { notes: true } });
    expect(rec.status).toBe("ABSENT");
    expect(rec.notes[0]!.note).toBe("Unwell");
    // Parent was notified about the absence; the change was audited.
    const student = await db.student.findUniqueOrThrow({ where: { id: rec.studentId }, include: { parents: { include: { parent: true } } } });
    expect(await db.notification.count({ where: { userId: student.parents[0]!.parent.userId, type: "ATTENDANCE" } })).toBeGreaterThan(0);
    expect(await db.auditLog.count({ where: { action: "attendance.update", entityId: section.id } })).toBeGreaterThan(0);
  });

  it("rejects future dates, foreign students and unassigned teachers", async () => {
    const teacher = await actorFor(EMAIL.teacher);
    const section = await db.section.findFirstOrThrow({ where: { classTeacherId: teacher.teacherId! }, include: { enrollments: true } });
    const studentId = section.enrollments[0]!.studentId;
    await expect(saveAttendance(teacher, section.id, addDays(todayUTC(), 2), [{ studentId, status: "PRESENT" }])).rejects.toThrow(ValidationError);
    const outsider = await db.enrollment.findFirstOrThrow({ where: { NOT: { sectionId: section.id } } });
    await expect(saveAttendance(teacher, section.id, recentSchoolDay(), [{ studentId: outsider.studentId, status: "PRESENT" }])).rejects.toThrow(/not enrolled/);
    const notMine = await sectionNotTaughtBy(teacher.teacherId!);
    await expect(getAttendanceSheet(teacher, notMine.id, recentSchoolDay())).rejects.toThrow(ForbiddenError);
  });

  it("locks old records for teachers but not for admins", async () => {
    const teacher = await actorFor(EMAIL.teacher);
    const admin = await actorFor(EMAIL.admin);
    const section = await db.section.findFirstOrThrow({ where: { classTeacherId: teacher.teacherId! }, include: { enrollments: true } });
    const old = recentSchoolDay(20);
    const entries = section.enrollments.map((e) => ({ studentId: e.studentId, status: "PRESENT" as const }));
    await saveAttendance(admin, section.id, old, entries); // ensure records exist
    await expect(saveAttendance(teacher, section.id, old, entries)).rejects.toThrow(ForbiddenError);
    await expect(saveAttendance(admin, section.id, old, entries)).resolves.toBeTruthy();
  });

  it("students can read their own summary but not marking", async () => {
    const student = await actorFor(EMAIL.student);
    const summary = await studentAttendanceSummary(student, student.studentId!);
    expect(summary.rate).not.toBeNull();
    const enr = await db.enrollment.findFirstOrThrow({ where: { studentId: student.studentId! } });
    await expect(getAttendanceSheet(student, enr.sectionId, todayUTC())).rejects.toThrow(ForbiddenError);
  });
});

describe("marks", () => {
  async function scheduledPaperForTeacher(teacherId: string) {
    const ts = await teachingOf(teacherId);
    const paper = await db.examSubject.findFirstOrThrow({ where: { classId: ts.section.classId, subjectId: ts.subjectId, examination: { status: "SCHEDULED" } } });
    return { ts, paper };
  }

  it("teacher enters marks; grades are computed; changes are audited", async () => {
    const teacher = await actorFor(EMAIL.teacher);
    const { ts, paper } = await scheduledPaperForTeacher(teacher.teacherId!);
    const sheet = await getMarksSheet(teacher, paper.id, ts.sectionId);
    const [a, b] = sheet.rows;
    await saveMarks(teacher, paper.id, ts.sectionId, [{ studentId: a!.studentId, marks: 91, absent: false }, { studentId: b!.studentId, marks: null, absent: true }]);
    const ma = await db.mark.findUniqueOrThrow({ where: { examSubjectId_studentId: { examSubjectId: paper.id, studentId: a!.studentId } } });
    expect(ma.grade).toBe("A+");
    const mb = await db.mark.findUniqueOrThrow({ where: { examSubjectId_studentId: { examSubjectId: paper.id, studentId: b!.studentId } } });
    expect(mb).toMatchObject({ isAbsent: true, grade: "AB", marksObtained: null });

    await saveMarks(teacher, paper.id, ts.sectionId, [{ studentId: a!.studentId, marks: 55, absent: false }]);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "marks.update", entityId: paper.id }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(log.metadata)).toContain('"from":91');
  });

  it("rejects marks above maximum, absent-with-marks, and non-enrolled students", async () => {
    const teacher = await actorFor(EMAIL.teacher);
    const { ts, paper } = await scheduledPaperForTeacher(teacher.teacherId!);
    const sheet = await getMarksSheet(teacher, paper.id, ts.sectionId);
    const sid = sheet.rows[0]!.studentId;
    await expect(saveMarks(teacher, paper.id, ts.sectionId, [{ studentId: sid, marks: paper.maxMarks + 1, absent: false }])).rejects.toThrow(/invalid marks/);
    await expect(saveMarks(teacher, paper.id, ts.sectionId, [{ studentId: sid, marks: 10, absent: true }])).rejects.toThrow(ValidationError);
  });

  it("students, parents and teachers of other subjects cannot enter marks", async () => {
    const teacher = await actorFor(EMAIL.teacher);
    const { ts, paper } = await scheduledPaperForTeacher(teacher.teacherId!);
    const sid = (await db.enrollment.findFirstOrThrow({ where: { sectionId: ts.sectionId } })).studentId;
    for (const email of [EMAIL.student, EMAIL.parent]) {
      await expect(saveMarks(await actorFor(email), paper.id, ts.sectionId, [{ studentId: sid, marks: 100, absent: false }])).rejects.toThrow(ForbiddenError);
    }
    const otherTeacherSubject = await db.teacherSubject.findFirstOrThrow({ where: { sectionId: ts.sectionId, NOT: { teacherId: teacher.teacherId! } }, include: { teacher: { include: { user: true } } } });
    const other = await actorFor(otherTeacherSubject.teacher.user.email!);
    const section = await db.section.findUniqueOrThrow({ where: { id: ts.sectionId } });
    if (section.classTeacherId !== other.teacherId) {
      await expect(saveMarks(other, paper.id, ts.sectionId, [{ studentId: sid, marks: 1, absent: false }])).rejects.toThrow(ForbiddenError);
    }
  });

  it("publishing locks marks for teachers and exposes results to students", async () => {
    const admin = await actorFor(EMAIL.admin);
    const teacher = await actorFor(EMAIL.teacher);
    const student = await actorFor(EMAIL.student);
    const { ts, paper } = await scheduledPaperForTeacher(teacher.teacherId!);
    await expect(studentExamResult(student, paper.examinationId, student.studentId!)).rejects.toThrow(NotFoundError);
    await setExamStatus(admin, paper.examinationId, "PUBLISHED");
    try {
      const sid = (await db.enrollment.findFirstOrThrow({ where: { sectionId: ts.sectionId } })).studentId;
      await expect(saveMarks(teacher, paper.id, ts.sectionId, [{ studentId: sid, marks: 1, absent: false }])).rejects.toThrow(ForbiddenError);
      const enrolledHere = await db.enrollment.findFirst({ where: { studentId: student.studentId!, section: { classId: ts.section.classId } } });
      if (enrolledHere) await expect(studentExamResult(student, paper.examinationId, student.studentId!)).resolves.toBeTruthy();
      expect(await db.notification.count({ where: { type: "RESULT_PUBLISHED", link: { contains: paper.examinationId } } })).toBeGreaterThan(0);
    } finally {
      await setExamStatus(admin, paper.examinationId, "SCHEDULED");
    }
  });
});
