import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { assertCan, requireSchoolId, type Actor } from "@/server/authz/guards";
import { getCurrentAcademicYear, isSchoolWide, teacherSectionIds } from "@/server/authz/scope";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

// ─── Academic years ────────────────────────────────────────────────────────

export async function listAcademicYears(actor: Actor) {
  const schoolId = requireSchoolId(actor);
  return db.academicYear.findMany({
    where: { schoolId },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { sections: true, enrollments: true, examinations: true } } },
  });
}

export async function saveAcademicYear(actor: Actor, input: { name: string; startDate: Date; endDate: Date }, id?: string) {
  assertCan(actor, "academic_years.manage");
  const schoolId = requireSchoolId(actor);
  const name = input.name.replace(/\s*[-–]\s*/, "–");
  const overlap = await db.academicYear.findFirst({
    where: { schoolId, NOT: id ? { id } : undefined, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } },
  });
  if (overlap) throw new ConflictError(`Dates overlap with ${overlap.name}.`, { startDate: [`Overlaps with ${overlap.name}.`] });
  if (id) {
    const existing = await db.academicYear.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundError("Academic year");
    await db.academicYear.update({ where: { id }, data: { ...input, name } });
    await audit(actor, { action: "academic_year.update", entity: "AcademicYear", entityId: id, metadata: { name } });
    return id;
  }
  const hasCurrent = await db.academicYear.count({ where: { schoolId, isCurrent: true } });
  const year = await db.academicYear.create({ data: { schoolId, ...input, name, isCurrent: hasCurrent === 0 } });
  await audit(actor, { action: "academic_year.create", entity: "AcademicYear", entityId: year.id, metadata: { name } });
  return year.id;
}

export async function setCurrentAcademicYear(actor: Actor, id: string) {
  assertCan(actor, "academic_years.manage");
  const schoolId = requireSchoolId(actor);
  await db.$transaction(async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { id, schoolId } });
    if (!year) throw new NotFoundError("Academic year");
    await tx.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
    await tx.academicYear.update({ where: { id }, data: { isCurrent: true } });
    await audit(actor, { action: "academic_year.set_current", entity: "AcademicYear", entityId: id, metadata: { name: year.name } }, tx);
  });
}

export async function deleteAcademicYear(actor: Actor, id: string) {
  assertCan(actor, "academic_years.manage");
  const schoolId = requireSchoolId(actor);
  const year = await db.academicYear.findFirst({ where: { id, schoolId }, include: { _count: { select: { sections: true, enrollments: true, examinations: true, fees: true } } } });
  if (!year) throw new NotFoundError("Academic year");
  if (year.isCurrent) throw new ConflictError("The current academic year cannot be deleted.");
  const c = year._count;
  if (c.sections + c.enrollments + c.examinations + c.fees > 0) throw new ConflictError("This academic year has sections, enrollments, exams or fees and cannot be deleted.");
  await db.academicYear.delete({ where: { id } });
  await audit(actor, { action: "academic_year.delete", entity: "AcademicYear", entityId: id, metadata: { name: year.name } });
}

/**
 * Copies the class/section structure and curriculum of one year into another
 * (class teachers and teaching assignments are copied too) — a quick start for a new year.
 */
export async function copyStructure(actor: Actor, fromYearId: string, toYearId: string) {
  assertCan(actor, "academic_years.manage");
  const schoolId = requireSchoolId(actor);
  const [from, to] = await Promise.all([
    db.academicYear.findFirst({ where: { id: fromYearId, schoolId } }),
    db.academicYear.findFirst({ where: { id: toYearId, schoolId }, include: { _count: { select: { sections: true } } } }),
  ]);
  if (!from || !to) throw new NotFoundError("Academic year");
  if (to._count.sections > 0) throw new ConflictError("The target year already has sections.");
  await db.$transaction(async (tx) => {
    const sections = await tx.section.findMany({ where: { academicYearId: from.id }, include: { teacherSubjects: true } });
    for (const s of sections) {
      const created = await tx.section.create({ data: { classId: s.classId, academicYearId: to.id, name: s.name, room: s.room, capacity: s.capacity, classTeacherId: s.classTeacherId } });
      if (s.teacherSubjects.length) {
        await tx.teacherSubject.createMany({ data: s.teacherSubjects.map((ts) => ({ teacherId: ts.teacherId, subjectId: ts.subjectId, sectionId: created.id })) });
      }
    }
    const curriculum = await tx.classSubject.findMany({ where: { academicYearId: from.id } });
    if (curriculum.length) {
      await tx.classSubject.createMany({ data: curriculum.map((c) => ({ classId: c.classId, subjectId: c.subjectId, academicYearId: to.id })), skipDuplicates: true });
    }
    await audit(actor, { action: "academic_year.copy_structure", entity: "AcademicYear", entityId: to.id, metadata: { from: from.name, sections: sections.length } }, tx);
  });
}

// ─── Classes & sections ─────────────────────────────────────────────────────

/** Classes with sections for the current year — teachers only see sections they teach. */
export async function listClassesWithSections(actor: Actor) {
  assertCan(actor, "classes.read");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  const restrictTo = !isSchoolWide(actor) && actor.teacherId ? await teacherSectionIds(actor.teacherId, year?.id) : null;
  const classes = await db.class.findMany({
    where: { schoolId, ...(restrictTo ? { sections: { some: { id: { in: restrictTo } } } } : {}) },
    orderBy: { level: "asc" },
    include: {
      sections: {
        where: { academicYearId: year?.id ?? "__none__", ...(restrictTo ? { id: { in: restrictTo } } : {}) },
        orderBy: { name: "asc" },
        include: {
          classTeacher: { include: { user: { select: { firstName: true, lastName: true } } } },
          _count: { select: { enrollments: { where: { status: "ACTIVE" } }, teacherSubjects: true } },
        },
      },
      classSubjects: { where: { academicYearId: year?.id ?? "__none__" }, include: { subject: true } },
    },
  });
  return { classes, year };
}

export async function saveClass(actor: Actor, input: { name: string; level: number }, id?: string) {
  assertCan(actor, "classes.write");
  const schoolId = requireSchoolId(actor);
  if (id) {
    const existing = await db.class.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundError("Class");
    await db.class.update({ where: { id }, data: input });
    await audit(actor, { action: "class.update", entity: "Class", entityId: id, metadata: input });
    return id;
  }
  const cls = await db.class.create({ data: { schoolId, ...input } });
  await audit(actor, { action: "class.create", entity: "Class", entityId: cls.id, metadata: input });
  return cls.id;
}

export async function deleteClass(actor: Actor, id: string) {
  assertCan(actor, "classes.write");
  const schoolId = requireSchoolId(actor);
  const cls = await db.class.findFirst({ where: { id, schoolId }, include: { _count: { select: { sections: true, examSubjects: true } } } });
  if (!cls) throw new NotFoundError("Class");
  if (cls._count.sections + cls._count.examSubjects > 0) throw new ConflictError("Remove this class's sections and exam papers before deleting it.");
  await db.class.delete({ where: { id } });
  await audit(actor, { action: "class.delete", entity: "Class", entityId: id, metadata: { name: cls.name } });
}

type SectionInput = { classId: string; name: string; room?: string | null; capacity?: number | null; classTeacherId?: string | null };

export async function saveSection(actor: Actor, input: SectionInput, id?: string) {
  assertCan(actor, "classes.write");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) throw new ValidationError("Create an academic year first.");
  const cls = await db.class.findFirst({ where: { id: input.classId, schoolId } });
  if (!cls) throw new ValidationError(undefined, { classId: ["Select a valid class."] });
  if (input.classTeacherId) {
    const t = await db.teacher.findFirst({ where: { id: input.classTeacherId, schoolId, status: "ACTIVE" } });
    if (!t) throw new ValidationError(undefined, { classTeacherId: ["Select an active teacher."] });
  }
  const data = { classId: cls.id, name: input.name.toUpperCase(), room: input.room ?? null, capacity: input.capacity ?? null, classTeacherId: input.classTeacherId ?? null };
  if (id) {
    const existing = await db.section.findFirst({ where: { id, class: { schoolId } }, include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } });
    if (!existing) throw new NotFoundError("Section");
    if (data.capacity && existing._count.enrollments > data.capacity) {
      throw new ValidationError(undefined, { capacity: [`${existing._count.enrollments} students are already enrolled.`] });
    }
    await db.section.update({ where: { id }, data });
    await audit(actor, { action: "section.update", entity: "Section", entityId: id, metadata: data });
    return id;
  }
  const s = await db.section.create({ data: { ...data, academicYearId: year.id } });
  await audit(actor, { action: "section.create", entity: "Section", entityId: s.id, metadata: data });
  return s.id;
}

export async function deleteSection(actor: Actor, id: string) {
  assertCan(actor, "classes.write");
  const schoolId = requireSchoolId(actor);
  const s = await db.section.findFirst({ where: { id, class: { schoolId } }, include: { _count: { select: { enrollments: true, attendance: true, assignments: true } } } });
  if (!s) throw new NotFoundError("Section");
  if (s._count.enrollments + s._count.attendance + s._count.assignments > 0) {
    throw new ConflictError("This section has students, attendance or assignments and cannot be deleted.");
  }
  await db.section.delete({ where: { id } });
  await audit(actor, { action: "section.delete", entity: "Section", entityId: id, metadata: { name: s.name } });
}

export async function getSectionDetail(actor: Actor, sectionId: string) {
  assertCan(actor, "classes.read");
  const schoolId = requireSchoolId(actor);
  if (!isSchoolWide(actor)) {
    const ids = actor.teacherId ? await teacherSectionIds(actor.teacherId) : [];
    if (!ids.includes(sectionId)) throw new NotFoundError("Section");
  }
  const section = await db.section.findFirst({
    where: { id: sectionId, class: { schoolId } },
    include: {
      class: { include: { classSubjects: { include: { subject: true } } } },
      academicYear: true,
      classTeacher: { include: { user: true } },
      teacherSubjects: { include: { subject: true, teacher: { include: { user: true } } } },
      enrollments: {
        where: { status: "ACTIVE" },
        orderBy: { rollNumber: "asc" },
        include: { student: { include: { user: { select: { firstName: true, lastName: true, avatarFileId: true, email: true } } } } },
      },
    },
  });
  if (!section) throw new NotFoundError("Section");
  return section;
}

/** Replaces a class's subject list for the current year. Removing a subject also removes its teaching assignments. */
export async function setCurriculum(actor: Actor, classId: string, subjectIds: string[]) {
  assertCan(actor, "subjects.write");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) throw new ValidationError("Create an academic year first.");
  const cls = await db.class.findFirst({ where: { id: classId, schoolId } });
  if (!cls) throw new NotFoundError("Class");
  const valid = await db.subject.findMany({ where: { id: { in: subjectIds }, schoolId }, select: { id: true } });
  const wanted = new Set(valid.map((s) => s.id));
  await db.$transaction(async (tx) => {
    const current = await tx.classSubject.findMany({ where: { classId, academicYearId: year.id } });
    const removed = current.filter((c) => !wanted.has(c.subjectId)).map((c) => c.subjectId);
    const added = [...wanted].filter((id) => !current.some((c) => c.subjectId === id));
    if (removed.length) {
      await tx.classSubject.deleteMany({ where: { classId, academicYearId: year.id, subjectId: { in: removed } } });
      await tx.teacherSubject.deleteMany({ where: { subjectId: { in: removed }, section: { classId, academicYearId: year.id } } });
      await tx.timetableEntry.deleteMany({ where: { subjectId: { in: removed }, academicYearId: year.id, section: { classId } } });
    }
    if (added.length) await tx.classSubject.createMany({ data: added.map((subjectId) => ({ classId, subjectId, academicYearId: year.id })) });
    await audit(actor, { action: "curriculum.update", entity: "Class", entityId: classId, metadata: { added, removed } }, tx);
  });
}

// ─── Subjects ───────────────────────────────────────────────────────────────

export async function listSubjects(actor: Actor, q?: string) {
  assertCan(actor, "subjects.read");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  return db.subject.findMany({
    where: { schoolId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      classSubjects: { where: { academicYearId: year?.id ?? "__none__" }, include: { class: true }, orderBy: { class: { level: "asc" } } },
      teacherSubjects: { where: { section: { academicYearId: year?.id ?? "__none__" } }, include: { teacher: { include: { user: true } } } },
    },
  });
}

export async function saveSubject(actor: Actor, input: { name: string; code: string; description?: string | null }, id?: string) {
  assertCan(actor, "subjects.write");
  const schoolId = requireSchoolId(actor);
  const data = { name: input.name, code: input.code, description: input.description ?? null };
  if (id) {
    const existing = await db.subject.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundError("Subject");
    await db.subject.update({ where: { id }, data });
    await audit(actor, { action: "subject.update", entity: "Subject", entityId: id, metadata: data });
    return id;
  }
  const s = await db.subject.create({ data: { schoolId, ...data } });
  await audit(actor, { action: "subject.create", entity: "Subject", entityId: s.id, metadata: data });
  return s.id;
}

export async function setSubjectArchived(actor: Actor, id: string, archived: boolean) {
  assertCan(actor, "subjects.write");
  const schoolId = requireSchoolId(actor);
  const s = await db.subject.findFirst({ where: { id, schoolId } });
  if (!s) throw new NotFoundError("Subject");
  await db.subject.update({ where: { id }, data: { status: archived ? "ARCHIVED" : "ACTIVE" } });
  await audit(actor, { action: archived ? "subject.archive" : "subject.restore", entity: "Subject", entityId: id });
}

export async function deleteSubject(actor: Actor, id: string) {
  assertCan(actor, "subjects.write");
  const schoolId = requireSchoolId(actor);
  const s = await db.subject.findFirst({ where: { id, schoolId }, include: { _count: { select: { examSubjects: true, assignments: true, timetable: true, teacherSubjects: true, classSubjects: true } } } });
  if (!s) throw new NotFoundError("Subject");
  const c = s._count;
  if (c.examSubjects + c.assignments > 0) throw new ConflictError("This subject has exams or assignments. Archive it instead.");
  if (c.timetable + c.teacherSubjects + c.classSubjects > 0) throw new ConflictError("Remove this subject from classes and timetables first, or archive it.");
  await db.subject.delete({ where: { id } });
  await audit(actor, { action: "subject.delete", entity: "Subject", entityId: id, metadata: { code: s.code } });
}
