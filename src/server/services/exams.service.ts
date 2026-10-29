import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_GRADE_SCALE, average, computeResult, gradeFor, percentage, rank, type GradeBand, type SubjectMark } from "@/lib/grading";
import { round2, toNumber } from "@/lib/utils";
import { audit } from "@/server/audit";
import { assertCan, assertCanAny, requireSchoolId, type Actor } from "@/server/authz/guards";
import { assertCanViewStudent, assertSectionAccess, assertTeachesSubject, currentEnrollment, getCurrentAcademicYear, isSchoolWide, parentChildIds, teacherSectionIds } from "@/server/authz/scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { dispatchExternal, notifyUsers, studentAndParentUserIds } from "@/server/notifications";
import { schoolSettings } from "./attendance.service";

export async function gradeScale(schoolId: string): Promise<GradeBand[]> {
  const rows = await db.gradeScale.findMany({ where: { schoolId }, orderBy: { minPercent: "desc" } });
  return rows.length ? rows : DEFAULT_GRADE_SCALE;
}

const isLearner = (a: Actor) => Boolean(a.studentId || a.parentId);

/** Class ids relevant to a learner (own / children's classes). */
async function learnerClassIds(actor: Actor) {
  const ids = actor.studentId ? [actor.studentId] : actor.parentId ? await parentChildIds(actor.parentId) : [];
  const enr = await db.enrollment.findMany({ where: { studentId: { in: ids }, academicYear: { isCurrent: true } }, include: { section: true } });
  return [...new Set(enr.map((e) => e.section.classId))];
}

export async function listExams(actor: Actor) {
  assertCan(actor, "exams.read");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  const where: Prisma.ExaminationWhereInput = { schoolId, academicYearId: year?.id ?? "__none__" };
  if (!actor.permissions.has("exams.manage")) where.status = { not: "DRAFT" };
  if (isLearner(actor)) where.subjects = { some: { classId: { in: await learnerClassIds(actor) } } };
  return db.examination.findMany({
    where,
    orderBy: { startDate: "desc" },
    include: { _count: { select: { subjects: true } }, subjects: { select: { classId: true }, distinct: ["classId"] } },
  });
}

export async function getExam(actor: Actor, id: string) {
  assertCan(actor, "exams.read");
  const schoolId = requireSchoolId(actor);
  const exam = await db.examination.findFirst({ where: { id, schoolId }, include: { academicYear: true } });
  if (!exam || (exam.status === "DRAFT" && !actor.permissions.has("exams.manage"))) throw new NotFoundError("Examination");
  const subjectWhere: Prisma.ExamSubjectWhereInput = { examinationId: id };
  if (isLearner(actor)) subjectWhere.classId = { in: await learnerClassIds(actor) };
  const papers = await db.examSubject.findMany({
    where: subjectWhere,
    orderBy: [{ examDate: "asc" }, { startTime: "asc" }],
    include: { class: true, subject: true, _count: { select: { marks: true } } },
  });
  return { exam, papers, canManage: actor.permissions.has("exams.manage") };
}

type ExamInput = { name: string; term?: string | null; description?: string | null; startDate: Date; endDate: Date; status: "DRAFT" | "SCHEDULED" | "ONGOING" | "COMPLETED" };

export async function saveExam(actor: Actor, input: ExamInput, id?: string) {
  assertCan(actor, "exams.manage");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) throw new ValidationError("Create an academic year first.");
  if (input.startDate < year.startDate || input.endDate > year.endDate) throw new ValidationError(undefined, { startDate: [`Dates must fall within ${year.name}.`] });
  const data = { ...input, term: input.term ?? null, description: input.description ?? null };
  if (id) {
    const existing = await db.examination.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundError("Examination");
    const outside = await db.examSubject.count({ where: { examinationId: id, OR: [{ examDate: { lt: input.startDate } }, { examDate: { gt: input.endDate } }] } });
    if (outside) throw new ValidationError(undefined, { startDate: [`${outside} scheduled paper(s) fall outside these dates.`] });
    await db.examination.update({ where: { id }, data: existing.status === "PUBLISHED" ? { ...data, status: "PUBLISHED" } : data });
    await audit(actor, { action: "exam.update", entity: "Examination", entityId: id, metadata: { name: input.name } });
    return id;
  }
  const exam = await db.examination.create({ data: { ...data, schoolId, academicYearId: year.id } });
  await audit(actor, { action: "exam.create", entity: "Examination", entityId: exam.id, metadata: { name: input.name } });
  return exam.id;
}

export async function deleteExam(actor: Actor, id: string) {
  assertCan(actor, "exams.manage");
  const schoolId = requireSchoolId(actor);
  const exam = await db.examination.findFirst({ where: { id, schoolId } });
  if (!exam) throw new NotFoundError("Examination");
  const marks = await db.mark.count({ where: { examSubject: { examinationId: id } } });
  if (marks) throw new ConflictError("Marks have been entered for this examination; it cannot be deleted.");
  await db.examination.delete({ where: { id } });
  await audit(actor, { action: "exam.delete", entity: "Examination", entityId: id, metadata: { name: exam.name } });
}

type PaperInput = { classId: string; subjectId: string; examDate: Date; startTime?: string | null; endTime?: string | null; maxMarks: number; passingMarks: number; room?: string | null };

export async function saveExamSubject(actor: Actor, examId: string, input: PaperInput, paperId?: string) {
  assertCan(actor, "exams.manage");
  const schoolId = requireSchoolId(actor);
  const exam = await db.examination.findFirst({ where: { id: examId, schoolId } });
  if (!exam) throw new NotFoundError("Examination");
  if (exam.status === "PUBLISHED") throw new ConflictError("Results are published; the schedule is locked.");
  if (input.examDate < exam.startDate || input.examDate > exam.endDate) throw new ValidationError(undefined, { examDate: ["The paper must be within the examination dates."] });
  const inCurriculum = await db.classSubject.findFirst({ where: { classId: input.classId, subjectId: input.subjectId, academicYearId: exam.academicYearId, class: { schoolId } } });
  if (!inCurriculum) throw new ValidationError(undefined, { subjectId: ["This subject is not taught in the selected class."] });
  // A class can't sit two papers at overlapping times on the same day.
  const sameDay = await db.examSubject.findMany({ where: { examinationId: examId, classId: input.classId, examDate: input.examDate, NOT: paperId ? { id: paperId } : undefined }, include: { subject: true } });
  const clash = sameDay.find((p) => !input.startTime || !p.startTime || (input.startTime < (p.endTime ?? "23:59") && (input.endTime ?? "23:59") > p.startTime));
  if (clash) throw new ConflictError(`This class already sits ${clash.subject.name} at that time.`, { startTime: [`Clashes with ${clash.subject.name}.`] });
  const data = { ...input, startTime: input.startTime ?? null, endTime: input.endTime ?? null, room: input.room ?? null };
  if (paperId) {
    const p = await db.examSubject.findFirst({ where: { id: paperId, examinationId: examId }, include: { marks: { select: { marksObtained: true } } } });
    if (!p) throw new NotFoundError("Paper");
    const maxEntered = Math.max(0, ...p.marks.map((m) => toNumber(m.marksObtained)));
    if (input.maxMarks < maxEntered) throw new ValidationError(undefined, { maxMarks: [`A student already has ${maxEntered} marks.`] });
    if (p.marks.length && (p.classId !== input.classId || p.subjectId !== input.subjectId)) throw new ConflictError("Marks exist for this paper; the class and subject can't change.");
    await db.examSubject.update({ where: { id: paperId }, data });
  } else {
    await db.examSubject.create({ data: { ...data, examinationId: examId } });
  }
  await audit(actor, { action: paperId ? "exam_subject.update" : "exam_subject.create", entity: "Examination", entityId: examId, metadata: data });
}

export async function deleteExamSubject(actor: Actor, paperId: string) {
  assertCan(actor, "exams.manage");
  const schoolId = requireSchoolId(actor);
  const p = await db.examSubject.findFirst({ where: { id: paperId, examination: { schoolId } }, include: { _count: { select: { marks: true } } } });
  if (!p) throw new NotFoundError("Paper");
  if (p._count.marks) throw new ConflictError("Marks have been entered for this paper; it cannot be removed.");
  await db.examSubject.delete({ where: { id: paperId } });
  await audit(actor, { action: "exam_subject.delete", entity: "Examination", entityId: p.examinationId, metadata: { paperId } });
}

export async function setExamStatus(actor: Actor, id: string, status: "SCHEDULED" | "ONGOING" | "COMPLETED" | "PUBLISHED") {
  assertCan(actor, "exams.manage");
  const schoolId = requireSchoolId(actor);
  const exam = await db.examination.findFirst({ where: { id, schoolId } });
  if (!exam) throw new NotFoundError("Examination");
  await db.examination.update({ where: { id }, data: { status, resultsPublishedAt: status === "PUBLISHED" ? new Date() : null } });
  await audit(actor, { action: status === "PUBLISHED" ? "exam.publish_results" : "exam.status", entity: "Examination", entityId: id, metadata: { from: exam.status, to: status } });
  if (status === "PUBLISHED" && exam.status !== "PUBLISHED") {
    const students = await db.mark.findMany({ where: { examSubject: { examinationId: id } }, select: { studentId: true }, distinct: ["studentId"] });
    const userIds = await studentAndParentUserIds(students.map((s) => s.studentId));
    const input = { type: "RESULT_PUBLISHED" as const, title: "Results published", body: `Results for ${exam.name} are now available.`, link: `/results?examId=${id}` };
    await notifyUsers(userIds, input);
    await dispatchExternal(schoolId, userIds, input);
  }
}

/** Papers for which the actor may enter marks, paired with sections. */
export async function markablePapers(actor: Actor, examId: string) {
  assertCanAny(actor, "marks.enter", "exams.manage");
  const { exam, papers } = await getExam(actor, examId);
  const year = exam.academicYearId;
  const sections = await db.section.findMany({ where: { academicYearId: year, classId: { in: papers.map((p) => p.classId) } }, include: { teacherSubjects: true }, orderBy: { name: "asc" } });
  const result: Array<{ paperId: string; sectionId: string; label: string }> = [];
  for (const p of papers) {
    for (const s of sections.filter((x) => x.classId === p.classId)) {
      const allowed = actor.permissions.has("exams.manage") || s.classTeacherId === actor.teacherId || s.teacherSubjects.some((t) => t.teacherId === actor.teacherId && t.subjectId === p.subjectId);
      if (allowed) result.push({ paperId: p.id, sectionId: s.id, label: `${p.class.name}-${s.name} · ${p.subject.name}` });
    }
  }
  return result;
}

async function loadPaperForEntry(actor: Actor, examSubjectId: string, sectionId: string) {
  assertCanAny(actor, "marks.enter", "exams.manage");
  const schoolId = requireSchoolId(actor);
  const paper = await db.examSubject.findFirst({ where: { id: examSubjectId, examination: { schoolId } }, include: { examination: true, subject: true, class: true } });
  if (!paper) throw new NotFoundError("Paper");
  const section = await assertSectionAccess(actor, sectionId, "exams.manage");
  if (section.classId !== paper.classId) throw new ValidationError("This section does not sit this paper.");
  if (!actor.permissions.has("exams.manage")) await assertTeachesSubject(actor, sectionId, paper.subjectId);
  return { paper, section };
}

export async function getMarksSheet(actor: Actor, examSubjectId: string, sectionId: string) {
  const { paper, section } = await loadPaperForEntry(actor, examSubjectId, sectionId);
  const enrollments = await db.enrollment.findMany({
    where: { sectionId, academicYearId: paper.examination.academicYearId },
    orderBy: { rollNumber: "asc" },
    include: { student: { include: { user: { select: { firstName: true, lastName: true, avatarFileId: true } }, marks: { where: { examSubjectId } } } } },
  });
  const locked = paper.examination.status === "PUBLISHED" && !actor.permissions.has("exams.manage");
  return {
    paper,
    section,
    locked,
    rows: enrollments.map((e) => {
      const m = e.student.marks[0];
      return { studentId: e.studentId, roll: e.rollNumber, name: `${e.student.user.firstName} ${e.student.user.lastName}`, avatarFileId: e.student.user.avatarFileId, marks: m?.marksObtained == null ? null : toNumber(m.marksObtained), absent: m?.isAbsent ?? false, remarks: m?.remarks ?? "", grade: m?.grade ?? null };
    }),
  };
}

export type MarkEntry = { studentId: string; marks: number | null; absent: boolean; remarks?: string | null };

/** Saves marks for one paper and section. Every change is written to the audit log. */
export async function saveMarks(actor: Actor, examSubjectId: string, sectionId: string, entries: MarkEntry[]) {
  const { paper } = await loadPaperForEntry(actor, examSubjectId, sectionId);
  if (paper.examination.status === "PUBLISHED" && !actor.permissions.has("exams.manage")) {
    throw new ForbiddenError("Results are published. Only an administrator can change marks now.");
  }
  if (paper.examination.status === "DRAFT") throw new ConflictError("Marks can't be entered for a draft examination.");
  const enrolled = new Set((await db.enrollment.findMany({ where: { sectionId }, select: { studentId: true } })).map((e) => e.studentId));
  const errors: Record<string, string[]> = {};
  for (const e of entries) {
    if (!enrolled.has(e.studentId)) throw new ValidationError("A student is not enrolled in this section.");
    if (e.absent && e.marks !== null) errors[e.studentId] = ["A student marked absent cannot have marks."];
    else if (e.marks !== null && e.marks > paper.maxMarks) errors[e.studentId] = [`Marks cannot exceed ${paper.maxMarks}.`];
    else if (e.marks !== null && Math.abs(Math.round(e.marks * 100) - e.marks * 100) > 1e-6) errors[e.studentId] = ["Use at most 2 decimals."];
  }
  if (Object.keys(errors).length) throw new ValidationError(`${Object.keys(errors).length} entr${Object.keys(errors).length === 1 ? "y has" : "ies have"} invalid marks.`, errors);

  const scale = await gradeScale(paper.examination.schoolId);
  const existing = new Map((await db.mark.findMany({ where: { examSubjectId, studentId: { in: entries.map((e) => e.studentId) } } })).map((m) => [m.studentId, m]));
  const changes: Array<{ studentId: string; from: unknown; to: unknown }> = [];
  await db.$transaction(async (tx) => {
    for (const e of entries) {
      const prev = existing.get(e.studentId);
      if (e.marks === null && !e.absent) {
        if (prev) {
          await tx.mark.delete({ where: { id: prev.id } });
          changes.push({ studentId: e.studentId, from: prev.isAbsent ? "AB" : toNumber(prev.marksObtained), to: null });
        }
        continue;
      }
      const marks = e.absent ? null : round2(e.marks!);
      const grade = e.absent ? "AB" : gradeFor(percentage(marks!, paper.maxMarks), scale);
      const prevValue = prev ? (prev.isAbsent ? "AB" : toNumber(prev.marksObtained)) : null;
      const nextValue = e.absent ? "AB" : marks;
      if (prev && prevValue === nextValue && (prev.remarks ?? "") === (e.remarks ?? "")) continue;
      await tx.mark.upsert({
        where: { examSubjectId_studentId: { examSubjectId, studentId: e.studentId } },
        update: { marksObtained: marks, isAbsent: e.absent, grade, remarks: e.remarks || null, enteredById: actor.userId },
        create: { examSubjectId, studentId: e.studentId, marksObtained: marks, isAbsent: e.absent, grade, remarks: e.remarks || null, enteredById: actor.userId },
      });
      if (prevValue !== nextValue) changes.push({ studentId: e.studentId, from: prevValue, to: nextValue });
    }
    if (changes.length || entries.length) {
      await audit(actor, { action: existing.size ? "marks.update" : "marks.enter", entity: "ExamSubject", entityId: examSubjectId, metadata: { sectionId, exam: paper.examination.name, subject: paper.subject.name, changes } }, tx);
    }
  });
  return { changed: changes.length };
}

// ─── Results ──────────────────────────────────────────────────────────────

/** A student's full result for one exam, with class context (rank, averages). */
export async function studentExamResult(actor: Actor, examId: string, studentId: string) {
  assertCan(actor, "results.read");
  await assertCanViewStudent(actor, studentId);
  const schoolId = requireSchoolId(actor);
  const exam = await db.examination.findFirst({ where: { id: examId, schoolId }, include: { academicYear: true } });
  if (!exam) throw new NotFoundError("Examination");
  if (isLearner(actor) && exam.status !== "PUBLISHED") throw new NotFoundError("Result");
  const enrollment = await db.enrollment.findFirst({ where: { studentId, academicYearId: exam.academicYearId }, include: { section: { include: { class: true, classTeacher: { include: { user: true } } } } } });
  if (!enrollment) throw new NotFoundError("Result");
  const [scale, settings, student, papers] = await Promise.all([
    gradeScale(schoolId),
    schoolSettings(schoolId),
    db.student.findUniqueOrThrow({ where: { id: studentId }, include: { user: true } }),
    db.examSubject.findMany({ where: { examinationId: examId, classId: enrollment.section.classId }, include: { subject: true, marks: { where: { student: { enrollments: { some: { sectionId: enrollment.sectionId } } } } } }, orderBy: { examDate: "asc" } }),
  ]);
  const toMarks = (sid: string): SubjectMark[] =>
    papers.map((p) => {
      const m = p.marks.find((x) => x.studentId === sid);
      return { subjectId: p.subjectId, subjectName: p.subject.name, maxMarks: p.maxMarks, passingMarks: p.passingMarks, marksObtained: m?.marksObtained == null ? null : toNumber(m.marksObtained), isAbsent: m?.isAbsent ?? false };
    });
  const result = computeResult(toMarks(studentId), scale, settings.exams.overallPassPercent);
  const classmates = await db.enrollment.findMany({ where: { sectionId: enrollment.sectionId }, select: { studentId: true } });
  const ranked = rank(classmates.map((c) => ({ id: c.studentId, pct: computeResult(toMarks(c.studentId), scale).percent })), (x) => x.pct);
  const subjectAverages = Object.fromEntries(
    papers.map((p) => [p.subjectId, average(p.marks.filter((m) => !m.isAbsent && m.marksObtained !== null).map((m) => toNumber(m.marksObtained)))]),
  );
  const remarks = Object.fromEntries(papers.map((p) => [p.subjectId, p.marks.find((m) => m.studentId === studentId)?.remarks ?? null]));
  return {
    exam,
    student,
    enrollment,
    result,
    remarks,
    subjectAverages,
    classAverage: average(ranked.map((r) => r.pct)),
    rank: ranked.find((r) => r.id === studentId)?.rank ?? null,
    classSize: classmates.length,
    scale,
  };
}

/** All published results for a student (learner overview). */
export async function studentResultsOverview(actor: Actor, studentId: string) {
  assertCan(actor, "results.read");
  await assertCanViewStudent(actor, studentId);
  const schoolId = requireSchoolId(actor);
  const exams = await db.examination.findMany({
    where: { schoolId, status: isLearner(actor) ? "PUBLISHED" : undefined, subjects: { some: { marks: { some: { studentId } } } } },
    orderBy: { startDate: "desc" },
  });
  const out = [];
  for (const e of exams) {
    const r = await studentExamResult(actor, e.id, studentId);
    out.push({ exam: e, result: r.result, rank: r.rank, classSize: r.classSize });
  }
  return out;
}

/** Class result sheet: every student's totals, plus subject and class averages. */
export async function sectionResults(actor: Actor, examId: string, sectionId: string) {
  assertCan(actor, "results.read");
  if (isLearner(actor)) throw new ForbiddenError();
  const schoolId = requireSchoolId(actor);
  if (!isSchoolWide(actor)) {
    const mine = actor.teacherId ? await teacherSectionIds(actor.teacherId) : [];
    if (!mine.includes(sectionId)) throw new NotFoundError("Section");
  }
  const [exam, section] = await Promise.all([
    db.examination.findFirst({ where: { id: examId, schoolId } }),
    db.section.findFirst({ where: { id: sectionId, class: { schoolId } }, include: { class: true } }),
  ]);
  if (!exam || !section) throw new NotFoundError("Result");
  const [scale, settings, papers, enrollments] = await Promise.all([
    gradeScale(schoolId),
    schoolSettings(schoolId),
    db.examSubject.findMany({ where: { examinationId: examId, classId: section.classId }, include: { subject: true, marks: true }, orderBy: { examDate: "asc" } }),
    db.enrollment.findMany({ where: { sectionId, academicYearId: exam.academicYearId }, orderBy: { rollNumber: "asc" }, include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } }),
  ]);
  const rows = enrollments.map((e) => {
    const marks: SubjectMark[] = papers.map((p) => {
      const m = p.marks.find((x) => x.studentId === e.studentId);
      return { subjectId: p.subjectId, subjectName: p.subject.name, maxMarks: p.maxMarks, passingMarks: p.passingMarks, marksObtained: m?.marksObtained == null ? null : toNumber(m.marksObtained), isAbsent: m?.isAbsent ?? false };
    });
    return { studentId: e.studentId, roll: e.rollNumber, name: `${e.student.user.firstName} ${e.student.user.lastName}`, ...computeResult(marks, scale, settings.exams.overallPassPercent) };
  });
  const ranked = rank(rows, (r) => r.percent);
  const sectionStudentIds = new Set(enrollments.map((e) => e.studentId));
  const subjectStats = papers.map((p) => {
    const vals = p.marks.filter((m) => sectionStudentIds.has(m.studentId) && !m.isAbsent && m.marksObtained !== null).map((m) => toNumber(m.marksObtained));
    return {
      subjectId: p.subjectId,
      name: p.subject.name,
      maxMarks: p.maxMarks,
      average: average(vals),
      averagePct: vals.length ? round2((average(vals)! / p.maxMarks) * 100) : null,
      highest: vals.length ? Math.max(...vals) : null,
      passRate: vals.length ? round2((vals.filter((v) => v >= p.passingMarks).length / vals.length) * 100) : null,
      entered: vals.length + p.marks.filter((m) => sectionStudentIds.has(m.studentId) && m.isAbsent).length,
    };
  });
  const complete = rows.filter((r) => !r.incomplete);
  return {
    exam,
    section,
    papers,
    rows: ranked.sort((a, b) => a.roll - b.roll),
    subjectStats,
    classAverage: average(complete.map((r) => r.percent)),
    passRate: complete.length ? round2((complete.filter((r) => r.passed).length / complete.length) * 100) : null,
    gradeDistribution: scale.map((g) => ({ grade: g.grade, count: complete.filter((r) => r.grade === g.grade).length })),
  };
}

/** For dashboards: upcoming exam papers relevant to the actor. */
export async function upcomingPapers(actor: Actor, limit = 6, studentId?: string | null) {
  const schoolId = requireSchoolId(actor);
  const where: Prisma.ExamSubjectWhereInput = { examination: { schoolId, status: { in: ["SCHEDULED", "ONGOING"] } }, examDate: { gte: new Date(new Date().toISOString().slice(0, 10)) } };
  if (studentId) {
    const e = await currentEnrollment(studentId);
    where.classId = e?.section.classId ?? "__none__";
  } else if (actor.teacherId && !isSchoolWide(actor)) {
    const ts = await db.teacherSubject.findMany({ where: { teacherId: actor.teacherId, section: { academicYear: { isCurrent: true } } }, include: { section: true } });
    where.OR = ts.map((t) => ({ classId: t.section.classId, subjectId: t.subjectId }));
    if (!ts.length) return [];
  }
  return db.examSubject.findMany({ where, orderBy: [{ examDate: "asc" }, { startTime: "asc" }], take: limit, include: { subject: true, class: true, examination: true }, distinct: studentId ? undefined : ["examinationId", "classId", "subjectId"] });
}
