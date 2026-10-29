import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { assertCan, requireSchoolId, type Actor } from "@/server/authz/guards";
import { currentEnrollment, getCurrentAcademicYear, isSchoolWide, parentChildIds } from "@/server/authz/scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { isoWeekday, todayUTC } from "@/lib/utils";
import { schoolSettings } from "./attendance.service";

export async function listPeriods(schoolId: string) {
  return db.period.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } });
}

type PeriodInput = { name: string; startTime: string; endTime: string; sortOrder: number; isBreak: boolean };

export async function savePeriod(actor: Actor, input: PeriodInput, id?: string) {
  assertCan(actor, "timetable.manage");
  const schoolId = requireSchoolId(actor);
  const others = await db.period.findMany({ where: { schoolId, NOT: id ? { id } : undefined } });
  const overlap = others.find((p) => input.startTime < p.endTime && input.endTime > p.startTime);
  if (overlap) throw new ConflictError(`Overlaps with ${overlap.name} (${overlap.startTime}–${overlap.endTime}).`, { startTime: [`Overlaps with ${overlap.name}.`] });
  if (others.some((p) => p.sortOrder === input.sortOrder)) throw new ConflictError("Another period already uses this order.", { sortOrder: ["Order already used."] });
  if (id) {
    const p = await db.period.findFirst({ where: { id, schoolId } });
    if (!p) throw new NotFoundError("Period");
    if (input.isBreak && !p.isBreak && (await db.timetableEntry.count({ where: { periodId: id } }))) {
      throw new ConflictError("This period has lessons scheduled; remove them before turning it into a break.");
    }
    await db.period.update({ where: { id }, data: input });
  } else {
    await db.period.create({ data: { ...input, schoolId } });
  }
  await audit(actor, { action: id ? "period.update" : "period.create", entity: "Period", entityId: id, metadata: input });
}

export async function deletePeriod(actor: Actor, id: string) {
  assertCan(actor, "timetable.manage");
  const schoolId = requireSchoolId(actor);
  const p = await db.period.findFirst({ where: { id, schoolId }, include: { _count: { select: { entries: true } } } });
  if (!p) throw new NotFoundError("Period");
  if (p._count.entries) throw new ConflictError(`${p._count.entries} lesson(s) use this period. Clear them from the timetable first.`);
  await db.period.delete({ where: { id } });
  await audit(actor, { action: "period.delete", entity: "Period", entityId: id, metadata: { name: p.name } });
}

const entryInclude = {
  subject: true,
  teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
  section: { include: { class: true } },
  period: true,
} as const;

/**
 * Returns the timetable to show and whether the actor may edit it.
 * Students → their section; parents → chosen child's section; teachers → their own
 * schedule (or a section they teach); admins → any section or teacher.
 */
export async function getTimetable(actor: Actor, q: { sectionId?: string; teacherId?: string; studentId?: string }) {
  assertCan(actor, "timetable.read");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) return null;
  let sectionId = q.sectionId;
  let teacherId = q.teacherId;

  if (actor.studentId || actor.parentId) {
    let sid = actor.studentId;
    if (actor.parentId) {
      const kids = await parentChildIds(actor.parentId);
      sid = q.studentId && kids.includes(q.studentId) ? q.studentId : kids[0] ?? null;
    }
    const e = sid ? await currentEnrollment(sid) : null;
    sectionId = e?.sectionId;
    teacherId = undefined;
    if (!sectionId) return { year, entries: [], mode: "section" as const, title: "No class assigned", canEdit: false, sectionId: null, teacherId: null };
  } else if (!isSchoolWide(actor)) {
    // Staff may view (read-only) any timetable in their school — e.g. to find a colleague.
    if (!actor.teacherId) throw new ForbiddenError();
    if (!sectionId && !teacherId) teacherId = actor.teacherId;
  }

  if (sectionId) {
    const section = await db.section.findFirst({ where: { id: sectionId, class: { schoolId } }, include: { class: true } });
    if (!section) throw new NotFoundError("Section");
    const entries = await db.timetableEntry.findMany({ where: { sectionId, academicYearId: year.id }, include: entryInclude });
    return { year, entries, mode: "section" as const, title: `${section.class.name} – ${section.name}`, canEdit: actor.permissions.has("timetable.manage"), sectionId, teacherId: null };
  }
  if (teacherId) {
    const teacher = await db.teacher.findFirst({ where: { id: teacherId, schoolId }, include: { user: true } });
    if (!teacher) throw new NotFoundError("Teacher");
    const entries = await db.timetableEntry.findMany({ where: { teacherId, academicYearId: year.id }, include: entryInclude });
    return { year, entries, mode: "teacher" as const, title: `${teacher.user.firstName} ${teacher.user.lastName}`, canEdit: false, sectionId: null, teacherId };
  }
  return { year, entries: [], mode: "none" as const, title: "", canEdit: false, sectionId: null, teacherId: null };
}

type EntryInput = { sectionId: string; dayOfWeek: number; periodId: string; subjectId: string; teacherId: string; room?: string | null };

/**
 * Creates or replaces the lesson in a section's slot, preventing double-booking of the
 * teacher or the room in the same slot (the DB also enforces teacher/section uniqueness).
 */
export async function saveTimetableEntry(actor: Actor, input: EntryInput) {
  assertCan(actor, "timetable.manage");
  const schoolId = requireSchoolId(actor);
  const settings = await schoolSettings(schoolId);
  if (!settings.schoolDays.includes(input.dayOfWeek)) throw new ValidationError("That day is not a school day.");
  const [section, period, subject, teacher] = await Promise.all([
    db.section.findFirst({ where: { id: input.sectionId, class: { schoolId } } }),
    db.period.findFirst({ where: { id: input.periodId, schoolId } }),
    db.subject.findFirst({ where: { id: input.subjectId, schoolId } }),
    db.teacher.findFirst({ where: { id: input.teacherId, schoolId, status: "ACTIVE" }, include: { user: true } }),
  ]);
  if (!section) throw new NotFoundError("Section");
  if (!period || period.isBreak) throw new ValidationError(undefined, { periodId: ["Choose a teaching period."] });
  if (!subject) throw new ValidationError(undefined, { subjectId: ["Choose a valid subject."] });
  if (!teacher) throw new ValidationError(undefined, { teacherId: ["Choose an active teacher."] });
  const inCurriculum = await db.classSubject.findFirst({ where: { classId: section.classId, subjectId: subject.id, academicYearId: section.academicYearId } });
  if (!inCurriculum) throw new ValidationError(undefined, { subjectId: ["This subject is not part of the class curriculum."] });

  const slot = { academicYearId: section.academicYearId, dayOfWeek: input.dayOfWeek, periodId: period.id };
  const teacherClash = await db.timetableEntry.findFirst({ where: { ...slot, teacherId: teacher.id, NOT: { sectionId: section.id } }, include: { section: { include: { class: true } } } });
  if (teacherClash) {
    const msg = `${teacher.user.firstName} ${teacher.user.lastName} already teaches ${teacherClash.section.class.name}-${teacherClash.section.name} in this slot.`;
    throw new ConflictError(msg, { teacherId: [msg] });
  }
  const room = input.room?.trim() || null;
  if (room) {
    const roomClash = await db.timetableEntry.findFirst({ where: { ...slot, room: { equals: room, mode: "insensitive" }, NOT: { sectionId: section.id } }, include: { section: { include: { class: true } } } });
    if (roomClash) {
      const msg = `${room} is already booked by ${roomClash.section.class.name}-${roomClash.section.name} in this slot.`;
      throw new ConflictError(msg, { room: [msg] });
    }
  }
  const entry = await db.timetableEntry.upsert({
    where: { sectionId_dayOfWeek_periodId: { sectionId: section.id, dayOfWeek: input.dayOfWeek, periodId: period.id } },
    update: { subjectId: subject.id, teacherId: teacher.id, room },
    create: { ...slot, sectionId: section.id, subjectId: subject.id, teacherId: teacher.id, room },
  });
  await audit(actor, { action: "timetable.save", entity: "TimetableEntry", entityId: entry.id, metadata: { ...input, room } });
}

export async function deleteTimetableEntry(actor: Actor, id: string) {
  assertCan(actor, "timetable.manage");
  const schoolId = requireSchoolId(actor);
  const e = await db.timetableEntry.findFirst({ where: { id, section: { class: { schoolId } } } });
  if (!e) throw new NotFoundError("Lesson");
  await db.timetableEntry.delete({ where: { id } });
  await audit(actor, { action: "timetable.delete", entity: "TimetableEntry", entityId: id, metadata: { sectionId: e.sectionId, dayOfWeek: e.dayOfWeek, periodId: e.periodId } });
}

/** Today's lessons for dashboards (teacher: own; student/parent: section). */
export async function todaysLessons(actor: Actor, studentId?: string | null) {
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) return [];
  const day = isoWeekday(todayUTC());
  let where: Record<string, unknown> | null = null;
  if (actor.teacherId && !studentId) where = { teacherId: actor.teacherId };
  else if (studentId) {
    const e = await currentEnrollment(studentId);
    if (e) where = { sectionId: e.sectionId };
  }
  if (!where) return [];
  return db.timetableEntry.findMany({ where: { ...where, academicYearId: year.id, dayOfWeek: day }, include: entryInclude, orderBy: { period: { sortOrder: "asc" } } });
}
