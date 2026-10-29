import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { TeacherInput } from "@/lib/validation/people";
import { toCSV } from "@/lib/csv";
import { audit, diff } from "@/server/audit";
import { assertCan, requireSchoolId, type Actor } from "@/server/authz/guards";
import { getCurrentAcademicYear } from "@/server/authz/scope";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { createUser, disableUser, enableUser } from "./users.service";

export type TeacherListParams = { q?: string; status?: string; subjectId?: string; sort?: string; dir?: string; skip?: number; take?: number };

export async function listTeachers(actor: Actor, p: TeacherListParams) {
  assertCan(actor, "teachers.read");
  const schoolId = requireSchoolId(actor);
  const and: Prisma.TeacherWhereInput[] = [{ schoolId }];
  and.push(p.status === "ARCHIVED" ? { status: "ARCHIVED" } : { status: "ACTIVE" });
  if (p.q) {
    for (const t of p.q.split(/\s+/).filter(Boolean).slice(0, 4)) {
      and.push({
        OR: [
          { user: { firstName: { contains: t, mode: "insensitive" } } },
          { user: { lastName: { contains: t, mode: "insensitive" } } },
          { user: { email: { contains: t, mode: "insensitive" } } },
          { employeeId: { contains: t, mode: "insensitive" } },
          { specialization: { contains: t, mode: "insensitive" } },
        ],
      });
    }
  }
  if (p.subjectId) and.push({ teacherSubjects: { some: { subjectId: p.subjectId } } });
  const where = { AND: and };
  const d = p.dir === "desc" ? "desc" : "asc";
  const orderBy: Prisma.TeacherOrderByWithRelationInput[] =
    p.sort === "employee" ? [{ employeeId: d }] : p.sort === "joined" ? [{ joiningDate: d }] : [{ user: { firstName: d } }, { user: { lastName: d } }];
  const year = await getCurrentAcademicYear(schoolId);
  const [total, rows] = await Promise.all([
    db.teacher.count({ where }),
    db.teacher.findMany({
      where,
      orderBy,
      skip: p.skip,
      take: p.take,
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true, avatarFileId: true, status: true } },
        teacherSubjects: { where: year ? { section: { academicYearId: year.id } } : undefined, include: { subject: true, section: { include: { class: true } } } },
        classTeacherOf: { where: year ? { academicYearId: year.id } : undefined, include: { class: true } },
      },
    }),
  ]);
  return { total, rows };
}

export async function getTeacher(actor: Actor, teacherId: string) {
  assertCan(actor, "teachers.read");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  const teacher = await db.teacher.findFirst({
    where: { id: teacherId, schoolId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarFileId: true, status: true, lastLoginAt: true } },
      teacherSubjects: {
        where: year ? { section: { academicYearId: year.id } } : undefined,
        include: { subject: true, section: { include: { class: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } } },
        orderBy: [{ section: { class: { level: "asc" } } }, { section: { name: "asc" } }],
      },
      classTeacherOf: { where: year ? { academicYearId: year.id } : undefined, include: { class: true } },
    },
  });
  if (!teacher) throw new NotFoundError("Teacher");
  return teacher;
}

export async function createTeacher(actor: Actor, input: TeacherInput) {
  assertCan(actor, "teachers.write");
  const schoolId = requireSchoolId(actor);
  return db.$transaction(async (tx) => {
    const user = await createUser(tx, "TEACHER", schoolId, input);
    const teacher = await tx.teacher.create({
      data: {
        userId: user.id,
        schoolId,
        employeeId: input.employeeId,
        gender: input.gender ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        address: input.address ?? null,
        qualification: input.qualification ?? null,
        specialization: input.specialization ?? null,
        joiningDate: input.joiningDate,
      },
    });
    await audit(actor, { action: "teacher.create", entity: "Teacher", entityId: teacher.id, metadata: { employeeId: input.employeeId } }, tx);
    return { ...teacher, userId: user.id };
  });
}

export async function updateTeacher(actor: Actor, teacherId: string, input: TeacherInput) {
  assertCan(actor, "teachers.write");
  const schoolId = requireSchoolId(actor);
  return db.$transaction(async (tx) => {
    const existing = await tx.teacher.findFirst({ where: { id: teacherId, schoolId }, include: { user: true } });
    if (!existing) throw new NotFoundError("Teacher");
    const data = {
      employeeId: input.employeeId,
      gender: input.gender ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      address: input.address ?? null,
      qualification: input.qualification ?? null,
      specialization: input.specialization ?? null,
      joiningDate: input.joiningDate,
    };
    const userData = { firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone ?? null };
    await tx.teacher.update({ where: { id: teacherId }, data });
    await tx.user.update({ where: { id: existing.userId }, data: userData });
    await audit(actor, { action: "teacher.update", entity: "Teacher", entityId: teacherId, metadata: { changes: { ...diff(existing as unknown as Record<string, unknown>, data), ...diff(existing.user as unknown as Record<string, unknown>, userData) } } }, tx);
    return { userId: existing.userId };
  });
}

/** Archiving keeps history (assignments, marks entered) but frees their timetable slots and class-teacher roles. */
export async function setTeacherArchived(actor: Actor, teacherId: string, archived: boolean) {
  assertCan(actor, "teachers.write");
  const schoolId = requireSchoolId(actor);
  await db.$transaction(async (tx) => {
    const t = await tx.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!t) throw new NotFoundError("Teacher");
    if (archived) {
      const year = await getCurrentAcademicYear(schoolId);
      if (year) {
        await tx.timetableEntry.deleteMany({ where: { teacherId, academicYearId: year.id } });
        await tx.teacherSubject.deleteMany({ where: { teacherId, section: { academicYearId: year.id } } });
        await tx.section.updateMany({ where: { classTeacherId: teacherId, academicYearId: year.id }, data: { classTeacherId: null } });
      }
      await disableUser(tx, t.userId);
    } else {
      await enableUser(tx, t.userId);
    }
    await tx.teacher.update({ where: { id: teacherId }, data: { status: archived ? "ARCHIVED" : "ACTIVE" } });
    await audit(actor, { action: archived ? "teacher.archive" : "teacher.restore", entity: "Teacher", entityId: teacherId }, tx);
  });
}

/** Assigns a teacher to teach a subject in a section (replacing any previous teacher). */
export async function assignTeaching(actor: Actor, input: { teacherId: string; sectionId: string; subjectId: string }) {
  assertCan(actor, "subjects.write");
  const schoolId = requireSchoolId(actor);
  await db.$transaction(async (tx) => {
    const [teacher, section, subject] = await Promise.all([
      tx.teacher.findFirst({ where: { id: input.teacherId, schoolId, status: "ACTIVE" } }),
      tx.section.findFirst({ where: { id: input.sectionId, class: { schoolId } } }),
      tx.subject.findFirst({ where: { id: input.subjectId, schoolId } }),
    ]);
    if (!teacher) throw new ValidationError(undefined, { teacherId: ["Select an active teacher."] });
    if (!section) throw new ValidationError(undefined, { sectionId: ["Select a valid section."] });
    if (!subject) throw new ValidationError(undefined, { subjectId: ["Select a valid subject."] });
    const inCurriculum = await tx.classSubject.findFirst({ where: { classId: section.classId, subjectId: subject.id, academicYearId: section.academicYearId } });
    if (!inCurriculum) {
      await tx.classSubject.create({ data: { classId: section.classId, subjectId: subject.id, academicYearId: section.academicYearId } });
    }
    const existing = await tx.teacherSubject.findUnique({ where: { subjectId_sectionId: { subjectId: subject.id, sectionId: section.id } } });
    if (existing?.teacherId === teacher.id) throw new ConflictError("This teacher already teaches this subject in this section.");
    await tx.teacherSubject.upsert({
      where: { subjectId_sectionId: { subjectId: subject.id, sectionId: section.id } },
      update: { teacherId: teacher.id },
      create: { teacherId: teacher.id, subjectId: subject.id, sectionId: section.id },
    });
    await audit(actor, { action: "teaching.assign", entity: "TeacherSubject", entityId: section.id, metadata: { ...input, replacedTeacherId: existing?.teacherId ?? null } }, tx);
  });
}

export async function unassignTeaching(actor: Actor, teacherSubjectId: string) {
  assertCan(actor, "subjects.write");
  const schoolId = requireSchoolId(actor);
  const ts = await db.teacherSubject.findFirst({ where: { id: teacherSubjectId, teacher: { schoolId } } });
  if (!ts) throw new NotFoundError("Teaching assignment");
  await db.teacherSubject.delete({ where: { id: ts.id } });
  await audit(actor, { action: "teaching.unassign", entity: "TeacherSubject", entityId: ts.id, metadata: { teacherId: ts.teacherId, subjectId: ts.subjectId, sectionId: ts.sectionId } });
}

export async function teacherOptions(schoolId: string) {
  const teachers = await db.teacher.findMany({ where: { schoolId, status: "ACTIVE" }, include: { user: true }, orderBy: { user: { firstName: "asc" } } });
  return teachers.map((t) => ({ value: t.id, label: `${t.user.firstName} ${t.user.lastName}${t.specialization ? ` · ${t.specialization}` : ""}` }));
}

export async function exportTeachersCSV(actor: Actor, p: TeacherListParams) {
  assertCan(actor, "teachers.write");
  const { rows } = await listTeachers(actor, { ...p, skip: 0, take: 2000 });
  await audit(actor, { action: "teacher.export", entity: "Teacher", metadata: { count: rows.length } });
  return toCSV(
    ["Employee ID", "First Name", "Last Name", "Email", "Phone", "Specialization", "Qualification", "Joining Date", "Subjects", "Class Teacher Of", "Status"],
    rows.map((t) => [
      t.employeeId, t.user.firstName, t.user.lastName, t.user.email ?? "", t.user.phone ?? "", t.specialization ?? "", t.qualification ?? "", t.joiningDate,
      [...new Set(t.teacherSubjects.map((s) => s.subject.name))].join("; "),
      t.classTeacherOf.map((s) => `${s.class.name}-${s.name}`).join("; "),
      t.status,
    ]),
  );
}
