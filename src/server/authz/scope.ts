import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { type Actor, requireSchoolId } from "./guards";

/**
 * Row-level access rules. Permissions (guards.ts) answer "may this role do X at all?";
 * the helpers here answer "may this user touch *this* record?". Every service that
 * reads or writes per-student/per-section data must go through these helpers so that
 * changing an id in a URL or request can never expose another student's information.
 */

/** Administrators see everything inside their (effective) school. */
export function isSchoolWide(actor: Pick<Actor, "role">) {
  return actor.role === "SUPER_ADMIN" || actor.role === "SCHOOL_ADMIN";
}

export async function getCurrentAcademicYear(schoolId: string) {
  return (
    (await db.academicYear.findFirst({ where: { schoolId, isCurrent: true } })) ??
    (await db.academicYear.findFirst({ where: { schoolId }, orderBy: { startDate: "desc" } }))
  );
}

/** Sections a teacher is responsible for: class teacher of, or teaching a subject in. */
export async function teacherSectionIds(teacherId: string, academicYearId?: string): Promise<string[]> {
  const sections = await db.section.findMany({
    where: {
      ...(academicYearId ? { academicYearId } : {}),
      OR: [{ classTeacherId: teacherId }, { teacherSubjects: { some: { teacherId } } }],
    },
    select: { id: true },
  });
  return sections.map((s) => s.id);
}

export async function parentChildIds(parentId: string): Promise<string[]> {
  const links = await db.parentStudent.findMany({ where: { parentId }, select: { studentId: true } });
  return links.map((l) => l.studentId);
}

/** Prisma filter restricting students to those the actor may see. */
export async function studentScopeWhere(actor: Actor): Promise<Prisma.StudentWhereInput> {
  const schoolId = requireSchoolId(actor);
  if (isSchoolWide(actor)) return { schoolId };
  if (actor.teacherId) {
    const sectionIds = await teacherSectionIds(actor.teacherId);
    return { schoolId, enrollments: { some: { sectionId: { in: sectionIds } } } };
  }
  if (actor.parentId) return { schoolId, parents: { some: { parentId: actor.parentId } } };
  if (actor.studentId) return { schoolId, id: actor.studentId };
  return { id: "__none__" };
}

/** Throws unless the actor may view the given student's records. */
export async function assertCanViewStudent(actor: Actor, studentId: string) {
  const where = await studentScopeWhere(actor);
  const found = await db.student.findFirst({ where: { AND: [where, { id: studentId }] }, select: { id: true } });
  if (!found) {
    // Do not reveal whether the record exists in another school.
    throw new NotFoundError("Student");
  }
}

/** Student ids the actor may see — used for parents/students (small sets). */
export async function viewableStudentIds(actor: Actor): Promise<string[] | "ALL"> {
  if (isSchoolWide(actor)) return "ALL";
  if (actor.parentId) return parentChildIds(actor.parentId);
  if (actor.studentId) return [actor.studentId];
  if (actor.teacherId) {
    const where = await studentScopeWhere(actor);
    return (await db.student.findMany({ where, select: { id: true } })).map((s) => s.id);
  }
  return [];
}

/** Loads a section and verifies it belongs to the actor's school. */
export async function getSectionInSchool(actor: Actor, sectionId: string) {
  const schoolId = requireSchoolId(actor);
  const section = await db.section.findFirst({
    where: { id: sectionId, class: { schoolId } },
    include: { class: true, academicYear: true },
  });
  if (!section) throw new NotFoundError("Section");
  return section;
}

/**
 * Teachers may act on a section only if they teach it (or are its class teacher);
 * `overridePermission` (e.g. attendance.manage) grants school-wide access.
 */
export async function assertSectionAccess(
  actor: Actor,
  sectionId: string,
  overridePermission: "attendance.manage" | "exams.manage" | "classes.write" | "notices.manage",
) {
  const section = await getSectionInSchool(actor, sectionId);
  if (actor.permissions.has(overridePermission)) return section;
  if (actor.teacherId) {
    const ids = await teacherSectionIds(actor.teacherId);
    if (ids.includes(sectionId)) return section;
  }
  throw new ForbiddenError("You are not assigned to this class section.");
}

/** Teachers may grade a subject only in sections where they teach that subject. */
export async function assertTeachesSubject(actor: Actor, sectionId: string, subjectId: string) {
  if (!actor.teacherId) throw new ForbiddenError();
  const link = await db.teacherSubject.findFirst({
    where: { teacherId: actor.teacherId, sectionId, subjectId },
    select: { id: true },
  });
  if (link) return;
  const classTeacher = await db.section.findFirst({
    where: { id: sectionId, classTeacherId: actor.teacherId },
    select: { id: true },
  });
  if (!classTeacher) throw new ForbiddenError("You do not teach this subject in this section.");
}

/** The active enrollment (current academic year) of a student, with class/section. */
export async function currentEnrollment(studentId: string) {
  return db.enrollment.findFirst({
    where: { studentId, academicYear: { isCurrent: true } },
    include: { section: { include: { class: true } }, academicYear: true },
    orderBy: { enrolledAt: "desc" },
  });
}

/**
 * Resolves which student a "my …" page shows: students see themselves; parents see the
 * requested child (only if linked) or their first child; staff may pass any visible id.
 */
export async function resolveStudentContext(actor: Actor, requested?: string | null) {
  if (actor.studentId) return { studentId: actor.studentId, children: [] as Array<{ id: string; name: string }> };
  if (actor.parentId) {
    const links = await db.parentStudent.findMany({
      where: { parentId: actor.parentId, student: { status: { not: "ARCHIVED" } } },
      include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { student: { dateOfBirth: "asc" } },
    });
    const children = links.map((l) => ({ id: l.studentId, name: `${l.student.user.firstName} ${l.student.user.lastName}` }));
    const chosen = children.find((c) => c.id === requested) ?? children[0];
    return { studentId: chosen?.id ?? null, children };
  }
  if (requested) {
    await assertCanViewStudent(actor, requested);
    return { studentId: requested, children: [] };
  }
  return { studentId: null, children: [] };
}
