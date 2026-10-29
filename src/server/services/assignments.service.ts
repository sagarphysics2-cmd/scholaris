import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { round2, toNumber } from "@/lib/utils";
import { audit } from "@/server/audit";
import { assertCan, requireSchoolId, type Actor } from "@/server/authz/guards";
import { assertTeachesSubject, currentEnrollment, getCurrentAcademicYear, isSchoolWide, parentChildIds, teacherSectionIds } from "@/server/authz/scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { dispatchExternal, notifyUsers, sectionStudentAndParentUserIds, studentAndParentUserIds } from "@/server/notifications";
import { deleteStoredFile, storeUpload } from "./files.service";

/** Section ids whose assignments the actor may see. "ALL" = whole school. */
async function visibleSectionIds(actor: Actor): Promise<string[] | "ALL"> {
  if (isSchoolWide(actor)) return "ALL";
  if (actor.teacherId) return teacherSectionIds(actor.teacherId);
  const studentIds = actor.studentId ? [actor.studentId] : actor.parentId ? await parentChildIds(actor.parentId) : [];
  const enrollments = await db.enrollment.findMany({ where: { studentId: { in: studentIds }, academicYear: { isCurrent: true } }, select: { sectionId: true } });
  return enrollments.map((e) => e.sectionId);
}

const isLearner = (a: Actor) => Boolean(a.studentId || a.parentId);

export type AssignmentListParams = { q?: string; sectionId?: string; subjectId?: string; status?: string; when?: string; studentId?: string; skip?: number; take?: number };

export async function listAssignments(actor: Actor, p: AssignmentListParams) {
  assertCan(actor, "assignments.read");
  const schoolId = requireSchoolId(actor);
  const sections = await visibleSectionIds(actor);
  const and: Prisma.AssignmentWhereInput[] = [{ schoolId }];
  if (sections !== "ALL") and.push({ sectionId: { in: sections } });
  if (isLearner(actor)) and.push({ status: { in: ["PUBLISHED", "CLOSED"] } });
  else if (p.status && ["DRAFT", "PUBLISHED", "CLOSED"].includes(p.status)) and.push({ status: p.status as "DRAFT" });
  if (p.sectionId) and.push({ sectionId: p.sectionId });
  if (p.subjectId) and.push({ subjectId: p.subjectId });
  if (p.q) and.push({ title: { contains: p.q, mode: "insensitive" } });
  const now = new Date();
  if (p.when === "upcoming") and.push({ dueDate: { gte: now } });
  if (p.when === "past") and.push({ dueDate: { lt: now } });

  // For a learner view, show the relevant student's submission.
  let learnerId: string | null = actor.studentId;
  if (actor.parentId) {
    const kids = await parentChildIds(actor.parentId);
    learnerId = p.studentId && kids.includes(p.studentId) ? p.studentId : kids[0] ?? null;
    if (learnerId) {
      const e = await currentEnrollment(learnerId);
      and.push({ sectionId: e?.sectionId ?? "__none__" });
    }
  }
  const where = { AND: and };
  const [total, rows] = await Promise.all([
    db.assignment.count({ where }),
    db.assignment.findMany({
      where,
      orderBy: p.when === "past" ? { dueDate: "desc" } : { dueDate: "asc" },
      skip: p.skip,
      take: p.take,
      include: {
        subject: true,
        section: { include: { class: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } },
        teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
        _count: { select: { submissions: true, attachments: true } },
        submissions: learnerId ? { where: { studentId: learnerId }, select: { id: true, status: true, marks: true, submittedAt: true } } : { where: { status: "GRADED" }, select: { id: true, status: true, marks: true, submittedAt: true } },
      },
    }),
  ]);
  return { total, rows, learnerId };
}

/** Loads one assignment after checking the actor may see it. */
export async function getAssignment(actor: Actor, id: string, studentId?: string) {
  assertCan(actor, "assignments.read");
  const schoolId = requireSchoolId(actor);
  const a = await db.assignment.findFirst({
    where: { id, schoolId },
    include: {
      subject: true,
      section: { include: { class: true } },
      teacher: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!a) throw new NotFoundError("Assignment");
  const sections = await visibleSectionIds(actor);
  if (sections !== "ALL" && !sections.includes(a.sectionId)) throw new NotFoundError("Assignment");
  if (isLearner(actor) && a.status === "DRAFT") throw new NotFoundError("Assignment");

  const canManage = actor.permissions.has("assignments.write") && (isSchoolWide(actor) || a.teacherId === actor.teacherId || (actor.teacherId ? (await teacherSectionIds(actor.teacherId)).includes(a.sectionId) : false));

  let learnerId: string | null = actor.studentId;
  if (actor.parentId) {
    const kids = await parentChildIds(actor.parentId);
    const enrolled = await db.enrollment.findMany({ where: { studentId: { in: kids }, sectionId: a.sectionId }, select: { studentId: true } });
    learnerId = enrolled.find((e) => e.studentId === studentId)?.studentId ?? enrolled[0]?.studentId ?? null;
  }
  const mySubmission = learnerId
    ? await db.assignmentSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId: learnerId } }, include: { files: true } })
    : null;

  // Staff see the full roster: every enrolled student with their submission (or "missing").
  const roster = !isLearner(actor)
    ? await db.enrollment.findMany({
        where: { sectionId: a.sectionId, status: "ACTIVE" },
        orderBy: { rollNumber: "asc" },
        include: {
          student: {
            include: {
              user: { select: { firstName: true, lastName: true, avatarFileId: true } },
              submissions: { where: { assignmentId: id }, include: { files: true } },
            },
          },
        },
      })
    : [];
  return { assignment: a, canManage, mySubmission, learnerId, roster };
}

type AssignmentInput = { title: string; description: string; sectionId: string; subjectId: string; dueDate: Date; maxMarks: number; status: "DRAFT" | "PUBLISHED" | "CLOSED" };

/** The teacher for an assignment: the actor (if a teacher) or the subject's assigned teacher. */
async function resolveTeacherId(actor: Actor, sectionId: string, subjectId: string) {
  if (actor.teacherId) {
    await assertTeachesSubject(actor, sectionId, subjectId);
    return actor.teacherId;
  }
  if (!isSchoolWide(actor)) throw new ForbiddenError();
  const ts = await db.teacherSubject.findUnique({ where: { subjectId_sectionId: { subjectId, sectionId } } });
  if (!ts) throw new ValidationError(undefined, { subjectId: ["No teacher is assigned to this subject in this section."] });
  return ts.teacherId;
}

async function notifyNewAssignment(schoolId: string, a: { id: string; title: string; sectionId: string; dueDate: Date }) {
  const userIds = await sectionStudentAndParentUserIds(a.sectionId);
  const input = { type: "ASSIGNMENT_NEW" as const, title: "New assignment", body: `"${a.title}" is due ${a.dueDate.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`, link: `/assignments/${a.id}` };
  await notifyUsers(userIds, input);
  await dispatchExternal(schoolId, userIds, input);
}

export async function createAssignment(actor: Actor, input: AssignmentInput, files: File[]) {
  assertCan(actor, "assignments.write");
  const schoolId = requireSchoolId(actor);
  const section = await db.section.findFirst({ where: { id: input.sectionId, class: { schoolId } } });
  if (!section) throw new ValidationError(undefined, { sectionId: ["Select a valid section."] });
  if (input.status === "PUBLISHED" && input.dueDate < new Date()) throw new ValidationError(undefined, { dueDate: ["The due date must be in the future."] });
  if (files.length > 5) throw new ValidationError("Attach at most 5 files.");
  const teacherId = await resolveTeacherId(actor, input.sectionId, input.subjectId);
  const a = await db.assignment.create({ data: { ...input, schoolId, teacherId } });
  try {
    for (const f of files) await storeUpload(actor, f, "ASSIGNMENT_ATTACHMENT", { assignmentId: a.id });
  } catch (err) {
    await db.assignment.delete({ where: { id: a.id } }); // roll back on invalid attachment
    throw err;
  }
  await audit(actor, { action: "assignment.create", entity: "Assignment", entityId: a.id, metadata: { title: a.title, sectionId: a.sectionId, status: a.status } });
  if (a.status === "PUBLISHED") await notifyNewAssignment(schoolId, a);
  return a;
}

async function loadManageable(actor: Actor, id: string) {
  const { assignment, canManage } = await getAssignment(actor, id);
  if (!canManage) throw new ForbiddenError();
  return assignment;
}

export async function updateAssignment(actor: Actor, id: string, input: AssignmentInput, files: File[]) {
  assertCan(actor, "assignments.write");
  const existing = await loadManageable(actor, id);
  if (input.sectionId !== existing.sectionId || input.subjectId !== existing.subjectId) {
    const subs = await db.assignmentSubmission.count({ where: { assignmentId: id } });
    if (subs) throw new ConflictError("The class or subject can't change after students have submitted.");
    await resolveTeacherId(actor, input.sectionId, input.subjectId);
  }
  if (existing.attachments.length + files.length > 5) throw new ValidationError("An assignment can have at most 5 attachments.");
  await db.assignment.update({ where: { id }, data: input });
  for (const f of files) await storeUpload(actor, f, "ASSIGNMENT_ATTACHMENT", { assignmentId: id });
  await audit(actor, { action: "assignment.update", entity: "Assignment", entityId: id, metadata: { title: input.title, status: input.status } });
  if (existing.status === "DRAFT" && input.status === "PUBLISHED") await notifyNewAssignment(requireSchoolId(actor), { ...existing, ...input });
}

export async function setAssignmentStatus(actor: Actor, id: string, status: "PUBLISHED" | "CLOSED") {
  const a = await loadManageable(actor, id);
  await db.assignment.update({ where: { id }, data: { status } });
  await audit(actor, { action: `assignment.${status === "CLOSED" ? "close" : "publish"}`, entity: "Assignment", entityId: id });
  if (a.status === "DRAFT" && status === "PUBLISHED") await notifyNewAssignment(requireSchoolId(actor), a);
}

export async function deleteAssignment(actor: Actor, id: string) {
  const a = await loadManageable(actor, id);
  const subs = await db.assignmentSubmission.count({ where: { assignmentId: id } });
  if (subs) throw new ConflictError("This assignment has submissions. Close it instead of deleting.");
  for (const f of a.attachments) await deleteStoredFile(f.id);
  await db.assignment.delete({ where: { id } });
  await audit(actor, { action: "assignment.delete", entity: "Assignment", entityId: id, metadata: { title: a.title } });
}

export async function removeAttachment(actor: Actor, assignmentId: string, fileId: string) {
  const a = await loadManageable(actor, assignmentId);
  if (!a.attachments.some((f) => f.id === fileId)) throw new NotFoundError("Attachment");
  await deleteStoredFile(fileId);
  await audit(actor, { action: "assignment.attachment_remove", entity: "Assignment", entityId: assignmentId, metadata: { fileId } });
}

/** A student submits (or re-submits, until graded) their work. */
export async function submitAssignment(actor: Actor, assignmentId: string, content: string | null | undefined, files: File[]) {
  assertCan(actor, "assignments.submit");
  if (!actor.studentId) throw new ForbiddenError("Only students can submit assignments.");
  const schoolId = requireSchoolId(actor);
  const a = await db.assignment.findFirst({ where: { id: assignmentId, schoolId } });
  if (!a || a.status === "DRAFT") throw new NotFoundError("Assignment");
  const enrolled = await db.enrollment.findFirst({ where: { studentId: actor.studentId, sectionId: a.sectionId, status: "ACTIVE" } });
  if (!enrolled) throw new NotFoundError("Assignment");
  if (a.status === "CLOSED") throw new ConflictError("This assignment is closed and no longer accepts submissions.");
  if (!content?.trim() && files.length === 0) throw new ValidationError("Write an answer or attach at least one file.", { content: ["Add text or a file."] });
  if (files.length > 5) throw new ValidationError("Attach at most 5 files.");
  const existing = await db.assignmentSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: actor.studentId } }, include: { files: true } });
  if (existing && (existing.status === "GRADED" || existing.status === "RETURNED")) throw new ConflictError("This submission has already been graded.");
  const now = new Date();
  const status = now > a.dueDate ? "LATE" : "SUBMITTED";
  const submission = await db.assignmentSubmission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId: actor.studentId } },
    update: { content: content ?? null, submittedAt: now, status },
    create: { assignmentId, studentId: actor.studentId, content: content ?? null, status, submittedAt: now },
  });
  if (files.length && existing) for (const f of existing.files) await deleteStoredFile(f.id); // new files replace old ones
  for (const f of files) await storeUpload(actor, f, "SUBMISSION", { submissionId: submission.id });
  await audit(actor, { action: existing ? "submission.resubmit" : "submission.create", entity: "AssignmentSubmission", entityId: submission.id, metadata: { assignmentId, late: status === "LATE" } });
  return { late: status === "LATE" };
}

export async function gradeSubmission(actor: Actor, submissionId: string, marks: number, feedback: string | null | undefined) {
  assertCan(actor, "assignments.write");
  const sub = await db.assignmentSubmission.findUnique({ where: { id: submissionId }, include: { assignment: true } });
  if (!sub) throw new NotFoundError("Submission");
  await loadManageable(actor, sub.assignmentId);
  if (marks > sub.assignment.maxMarks) throw new ValidationError(undefined, { marks: [`Marks cannot exceed ${sub.assignment.maxMarks}.`] });
  if (Math.abs(Math.round(marks * 100) - marks * 100) > 1e-6) throw new ValidationError(undefined, { marks: ["Use at most 2 decimals."] });
  await db.assignmentSubmission.update({ where: { id: submissionId }, data: { marks: round2(marks), feedback: feedback ?? null, status: "GRADED", gradedAt: new Date(), gradedById: actor.userId } });
  await audit(actor, { action: sub.marks === null ? "submission.grade" : "submission.regrade", entity: "AssignmentSubmission", entityId: submissionId, metadata: { from: sub.marks === null ? null : toNumber(sub.marks), to: marks } });
  const userIds = await studentAndParentUserIds([sub.studentId]);
  await notifyUsers(userIds, { type: "ASSIGNMENT_GRADED", title: "Assignment graded", body: `"${sub.assignment.title}" was graded: ${marks}/${sub.assignment.maxMarks}.`, link: `/assignments/${sub.assignmentId}` });
}

/** For dashboards: open assignments for a student, with their submission state. */
export async function upcomingForStudent(studentId: string, limit = 5) {
  const e = await currentEnrollment(studentId);
  if (!e) return [];
  return db.assignment.findMany({
    where: { sectionId: e.sectionId, status: "PUBLISHED", dueDate: { gte: new Date(Date.now() - 86400000) } },
    orderBy: { dueDate: "asc" },
    take: limit,
    include: { subject: true, submissions: { where: { studentId }, select: { status: true } } },
  });
}

/** For teacher dashboards: assignments with ungraded submissions. */
export async function pendingGradingForTeacher(teacherId: string, limit = 6) {
  const year = await db.academicYear.findFirst({ where: { isCurrent: true, sections: { some: { OR: [{ classTeacherId: teacherId }, { teacherSubjects: { some: { teacherId } } }] } } } });
  return db.assignment.findMany({
    where: { teacherId, ...(year ? { section: { academicYearId: year.id } } : {}), submissions: { some: { status: { in: ["SUBMITTED", "LATE"] } } } },
    orderBy: { dueDate: "asc" },
    take: limit,
    include: { subject: true, section: { include: { class: true } }, _count: { select: { submissions: { where: { status: { in: ["SUBMITTED", "LATE"] } } } } } },
  });
}

export async function assignmentFormOptions(actor: Actor) {
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  const where: Prisma.TeacherSubjectWhereInput = { section: { academicYearId: year?.id ?? "__none__", class: { schoolId } } };
  if (!isSchoolWide(actor)) where.teacherId = actor.teacherId ?? "__none__";
  const links = await db.teacherSubject.findMany({ where, include: { subject: true, section: { include: { class: true } } }, orderBy: [{ section: { class: { level: "asc" } } }, { section: { name: "asc" } }] });
  const sections = new Map<string, string>();
  const pairs: Record<string, Array<{ value: string; label: string }>> = {};
  for (const l of links) {
    sections.set(l.sectionId, `${l.section.class.name} – ${l.section.name}`);
    (pairs[l.sectionId] ??= []).push({ value: l.subjectId, label: l.subject.name });
  }
  return { sections: [...sections.entries()].map(([value, label]) => ({ value, label })), subjectsBySection: pairs };
}
