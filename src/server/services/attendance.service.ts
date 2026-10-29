import { db } from "@/lib/db";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { attendanceRate, emptyCounts, type AttendanceCounts } from "@/lib/attendance";
import { addDays, isoWeekday, todayUTC, toISODate } from "@/lib/utils";
import { parseSettings } from "@/lib/validation/settings";
import { audit } from "@/server/audit";
import { assertCanAny, requireSchoolId, type Actor } from "@/server/authz/guards";
import { assertCanViewStudent, assertSectionAccess, getCurrentAcademicYear, isSchoolWide, teacherSectionIds } from "@/server/authz/scope";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { dispatchExternal, notifyUsers } from "@/server/notifications";

export async function schoolSettings(schoolId: string) {
  const school = await db.school.findUniqueOrThrow({ where: { id: schoolId }, select: { settings: true } });
  return parseSettings(school.settings);
}

/** Sections the actor may mark attendance for. */
export async function markableSections(actor: Actor) {
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) return [];
  const where = actor.permissions.has("attendance.manage")
    ? { academicYearId: year.id, class: { schoolId } }
    : actor.teacherId && actor.permissions.has("attendance.mark")
      ? { id: { in: await teacherSectionIds(actor.teacherId, year.id) } }
      : { id: "__none__" };
  const sections = await db.section.findMany({ where, include: { class: true }, orderBy: [{ class: { level: "asc" } }, { name: "asc" }] });
  return sections.map((s) => ({ value: s.id, label: `${s.class.name} – ${s.name}`, classTeacherId: s.classTeacherId }));
}

/** Loads the roll-call sheet for a section and date (existing marks pre-filled). */
export async function getAttendanceSheet(actor: Actor, sectionId: string, date: Date) {
  assertCanAny(actor, "attendance.mark", "attendance.manage");
  const section = await assertSectionAccess(actor, sectionId, "attendance.manage");
  const settings = await schoolSettings(section.class.schoolId);
  const [enrollments, records] = await Promise.all([
    db.enrollment.findMany({
      where: { sectionId, status: "ACTIVE" },
      orderBy: { rollNumber: "asc" },
      include: { student: { include: { user: { select: { firstName: true, lastName: true, avatarFileId: true } } } } },
    }),
    db.attendance.findMany({ where: { sectionId, date }, include: { notes: { orderBy: { createdAt: "desc" }, take: 1 } } }),
  ]);
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  const ageDays = Math.floor((todayUTC().getTime() - date.getTime()) / 86400000);
  const locked = !actor.permissions.has("attendance.manage") && records.length > 0 && ageDays > settings.attendance.teacherEditWindowDays;
  return {
    section,
    isSchoolDay: settings.schoolDays.includes(isoWeekday(date)),
    alreadyMarked: records.length > 0,
    locked,
    editWindowDays: settings.attendance.teacherEditWindowDays,
    rows: enrollments.map((e) => {
      const r = byStudent.get(e.studentId);
      return {
        studentId: e.studentId,
        rollNumber: e.rollNumber,
        name: `${e.student.user.firstName} ${e.student.user.lastName}`,
        avatarFileId: e.student.user.avatarFileId,
        status: (r?.status ?? null) as AttendanceStatus | null,
        note: r?.notes[0]?.note ?? "",
      };
    }),
  };
}

export type AttendanceEntry = { studentId: string; status: AttendanceStatus; note?: string | null };

/**
 * Saves a roll call. Uses the (student, section, date) unique key so a student can never
 * have two records for the same day — re-saving explicitly edits the existing record.
 */
export async function saveAttendance(actor: Actor, sectionId: string, date: Date, entries: AttendanceEntry[]) {
  assertCanAny(actor, "attendance.mark", "attendance.manage");
  const section = await assertSectionAccess(actor, sectionId, "attendance.manage");
  const settings = await schoolSettings(section.class.schoolId);
  const today = todayUTC();
  if (date > today) throw new ValidationError("Attendance cannot be marked for a future date.", { date: ["Choose today or a past date."] });
  if (date < section.academicYear.startDate || date > section.academicYear.endDate) {
    throw new ValidationError("The date is outside the academic year.", { date: ["Date is outside the academic year."] });
  }
  if (entries.length === 0) throw new ValidationError("Mark at least one student.");

  const enrolled = await db.enrollment.findMany({ where: { sectionId, status: "ACTIVE" }, select: { studentId: true } });
  const enrolledIds = new Set(enrolled.map((e) => e.studentId));
  const seen = new Set<string>();
  for (const e of entries) {
    if (!enrolledIds.has(e.studentId)) throw new ValidationError("One or more students are not enrolled in this section.");
    if (seen.has(e.studentId)) throw new ValidationError("A student appears twice in the submission.");
    seen.add(e.studentId);
  }

  const existing = await db.attendance.findMany({ where: { sectionId, date } });
  const ageDays = Math.floor((today.getTime() - date.getTime()) / 86400000);
  if (existing.length > 0 && !actor.permissions.has("attendance.manage") && ageDays > settings.attendance.teacherEditWindowDays) {
    throw new ForbiddenError(`Attendance older than ${settings.attendance.teacherEditWindowDays} days can only be changed by an administrator.`);
  }
  const before = new Map(existing.map((r) => [r.studentId, r.status]));

  const changed: Array<{ studentId: string; from: AttendanceStatus | null; to: AttendanceStatus }> = [];
  await db.$transaction(async (tx) => {
    for (const e of entries) {
      const record = await tx.attendance.upsert({
        where: { studentId_sectionId_date: { studentId: e.studentId, sectionId, date } },
        update: { status: e.status, markedById: actor.userId },
        create: { studentId: e.studentId, sectionId, date, status: e.status, markedById: actor.userId },
        include: { notes: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      const prev = before.get(e.studentId) ?? null;
      if (prev !== e.status) changed.push({ studentId: e.studentId, from: prev, to: e.status });
      const note = e.note?.trim();
      if (note && note !== record.notes[0]?.note) {
        await tx.attendanceNote.create({ data: { attendanceId: record.id, note: note.slice(0, 500), authorId: actor.userId } });
      }
    }
    const counts = entries.reduce((acc, e) => ((acc[e.status] += 1), acc), emptyCounts());
    await audit(
      actor,
      {
        action: existing.length ? "attendance.update" : "attendance.mark",
        entity: "Section",
        entityId: sectionId,
        metadata: { date: toISODate(date), counts, changes: existing.length ? changed : undefined },
      },
      tx,
    );
  });

  // Tell parents (and the student) about new absences.
  if (settings.attendance.notifyParentsOnAbsence) {
    const newlyAbsent = changed.filter((c) => c.to === "ABSENT").map((c) => c.studentId);
    if (newlyAbsent.length) {
      const students = await db.student.findMany({
        where: { id: { in: newlyAbsent } },
        include: { user: { select: { firstName: true, lastName: true } }, parents: { include: { parent: { select: { userId: true } } } } },
      });
      for (const s of students) {
        const parentIds = s.parents.map((p) => p.parent.userId);
        const input = {
          type: "ATTENDANCE" as const,
          title: "Absence recorded",
          body: `${s.user.firstName} ${s.user.lastName} was marked absent on ${toISODate(date)}.`,
          link: `/attendance?studentId=${s.id}`,
        };
        await notifyUsers([...parentIds, s.userId], input);
        await dispatchExternal(section.class.schoolId, parentIds, input);
      }
    }
  }
  return { saved: entries.length, changed: changed.length };
}

/** Per-student summary: totals, rate, monthly breakdown and absence history. */
export async function studentAttendanceSummary(actor: Actor, studentId: string, range?: { from?: Date; to?: Date }) {
  assertCanAny(actor, "attendance.read");
  await assertCanViewStudent(actor, studentId);
  const schoolId = requireSchoolId(actor);
  const [year, settings] = await Promise.all([getCurrentAcademicYear(schoolId), schoolSettings(schoolId)]);
  const from = range?.from ?? year?.startDate ?? addDays(todayUTC(), -180);
  const to = range?.to ?? todayUTC();
  const records = await db.attendance.findMany({
    where: { studentId, date: { gte: from, lte: to } },
    orderBy: { date: "desc" },
    include: { notes: { orderBy: { createdAt: "desc" }, take: 1 }, section: { include: { class: true } } },
  });
  const totals = emptyCounts();
  const months = new Map<string, AttendanceCounts>();
  for (const r of records) {
    totals[r.status]++;
    const key = toISODate(r.date).slice(0, 7);
    const m = months.get(key) ?? emptyCounts();
    m[r.status]++;
    months.set(key, m);
  }
  const lateOk = settings.attendance.lateCountsAsPresent;
  return {
    totals,
    rate: attendanceRate(totals, lateOk),
    threshold: settings.attendance.lowAttendanceThreshold,
    monthly: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, c]) => ({ month, ...c, rate: attendanceRate(c, lateOk) })),
    records: records.map((r) => ({ id: r.id, date: r.date, status: r.status, note: r.notes[0]?.note ?? null, section: `${r.section.class.name}-${r.section.name}` })),
  };
}

/** School-wide (admins) or own-sections (teachers) analytics. */
export async function attendanceOverview(actor: Actor, days = 30) {
  assertCanAny(actor, "attendance.read");
  const schoolId = requireSchoolId(actor);
  const [year, settings] = await Promise.all([getCurrentAcademicYear(schoolId), schoolSettings(schoolId)]);
  if (!year) return null;
  const sectionFilter = isSchoolWide(actor)
    ? { academicYearId: year.id, class: { schoolId } }
    : actor.teacherId
      ? { id: { in: await teacherSectionIds(actor.teacherId, year.id) } }
      : { id: "__none__" };
  const sections = await db.section.findMany({ where: sectionFilter, include: { class: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } });
  const sectionIds = sections.map((s) => s.id);
  const today = todayUTC();
  const from = addDays(today, -days);
  const lateOk = settings.attendance.lateCountsAsPresent;

  const [daily, bySection, todayRows, perStudent] = await Promise.all([
    db.attendance.groupBy({ by: ["date", "status"], where: { sectionId: { in: sectionIds }, date: { gte: from, lte: today } }, _count: true }),
    db.attendance.groupBy({ by: ["sectionId", "status"], where: { sectionId: { in: sectionIds }, date: { gte: year.startDate, lte: today } }, _count: true }),
    db.attendance.groupBy({ by: ["sectionId", "status"], where: { sectionId: { in: sectionIds }, date: today }, _count: true }),
    db.attendance.groupBy({ by: ["studentId", "status"], where: { sectionId: { in: sectionIds }, date: { gte: year.startDate, lte: today } }, _count: true }),
  ]);

  const dayMap = new Map<string, AttendanceCounts>();
  for (const d of daily) {
    const k = toISODate(d.date);
    const c = dayMap.get(k) ?? emptyCounts();
    c[d.status] += d._count;
    dayMap.set(k, c);
  }
  const trend = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, c]) => ({ date: new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }), rate: attendanceRate(c, lateOk), absent: c.ABSENT }));

  const secCounts = new Map<string, AttendanceCounts>();
  for (const r of bySection) {
    const c = secCounts.get(r.sectionId) ?? emptyCounts();
    c[r.status] += r._count;
    secCounts.set(r.sectionId, c);
  }
  const todayCounts = emptyCounts();
  const todayBySection = new Map<string, AttendanceCounts>();
  for (const r of todayRows) {
    todayCounts[r.status] += r._count;
    const c = todayBySection.get(r.sectionId) ?? emptyCounts();
    c[r.status] += r._count;
    todayBySection.set(r.sectionId, c);
  }

  const studentCounts = new Map<string, AttendanceCounts>();
  for (const r of perStudent) {
    const c = studentCounts.get(r.studentId) ?? emptyCounts();
    c[r.status] += r._count;
    studentCounts.set(r.studentId, c);
  }
  const low = [...studentCounts.entries()]
    .map(([studentId, c]) => ({ studentId, counts: c, rate: attendanceRate(c, lateOk) ?? 100 }))
    .filter((s) => s.rate < settings.attendance.lowAttendanceThreshold || s.counts.ABSENT >= 5)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 15);
  const lowStudents = await db.student.findMany({
    where: { id: { in: low.map((l) => l.studentId) } },
    include: { user: { select: { firstName: true, lastName: true, avatarFileId: true } }, enrollments: { where: { academicYearId: year.id }, include: { section: { include: { class: true } } } } },
  });

  const sortedSections = sections.sort((a, b) => a.class.level - b.class.level || a.name.localeCompare(b.name));
  return {
    year,
    threshold: settings.attendance.lowAttendanceThreshold,
    today: { counts: todayCounts, rate: attendanceRate(todayCounts, lateOk), marked: todayBySection.size, sections: sections.length },
    trend,
    sections: sortedSections.map((s) => ({
      id: s.id,
      label: `${s.class.name.replace("Grade ", "G")}-${s.name}`,
      fullLabel: `${s.class.name} – ${s.name}`,
      students: s._count.enrollments,
      rate: attendanceRate(secCounts.get(s.id) ?? emptyCounts(), lateOk),
      todayMarked: todayBySection.has(s.id),
      todayRate: todayBySection.has(s.id) ? attendanceRate(todayBySection.get(s.id)!, lateOk) : null,
    })),
    frequentAbsentees: low.map((l) => {
      const s = lowStudents.find((x) => x.id === l.studentId)!;
      const e = s?.enrollments[0];
      return { ...l, name: s ? `${s.user.firstName} ${s.user.lastName}` : "—", avatarFileId: s?.user.avatarFileId ?? null, section: e ? `${e.section.class.name}-${e.section.name}` : "—" };
    }),
  };
}

/** Day-level register for a section across a month (for the class attendance report). */
export async function sectionMonthRegister(actor: Actor, sectionId: string, month: string) {
  assertCanAny(actor, "attendance.read");
  const section = await assertSectionAccess(actor, sectionId, "attendance.manage");
  const start = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(start.getTime())) throw new ValidationError("Invalid month.");
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const [enrollments, records, settings] = await Promise.all([
    db.enrollment.findMany({ where: { sectionId }, orderBy: { rollNumber: "asc" }, include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } }),
    db.attendance.findMany({ where: { sectionId, date: { gte: start, lte: end } } }),
    schoolSettings(section.class.schoolId),
  ]);
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (settings.schoolDays.includes(isoWeekday(d))) days.push(d);
  const key = (s: string, d: Date) => `${s}|${toISODate(d)}`;
  const map = new Map(records.map((r) => [key(r.studentId, r.date), r.status]));
  return {
    section,
    days,
    rows: enrollments.map((e) => {
      const c = emptyCounts();
      const cells = days.map((d) => {
        const st = map.get(key(e.studentId, d)) ?? null;
        if (st) c[st]++;
        return st;
      });
      return { studentId: e.studentId, roll: e.rollNumber, name: `${e.student.user.firstName} ${e.student.user.lastName}`, cells, counts: c, rate: attendanceRate(c, settings.attendance.lateCountsAsPresent) };
    }),
  };
}

/** Sections whose attendance the actor may view (all for admins, own for teachers). */
export async function viewableSections(actor: Actor) {
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) return [];
  const where = isSchoolWide(actor)
    ? { academicYearId: year.id, class: { schoolId } }
    : { id: { in: actor.teacherId ? await teacherSectionIds(actor.teacherId, year.id) : [] } };
  const sections = await db.section.findMany({ where, include: { class: true }, orderBy: [{ class: { level: "asc" } }, { name: "asc" }] });
  return sections.map((s) => ({ value: s.id, label: `${s.class.name} – ${s.name}` }));
}

export async function exportRegisterCSV(actor: Actor, sectionId: string, month: string) {
  const reg = await sectionMonthRegister(actor, sectionId, month);
  const { toCSV } = await import("@/lib/csv");
  await audit(actor, { action: "attendance.export", entity: "Section", entityId: sectionId, metadata: { month } });
  return toCSV(
    ["Roll", "Student", ...reg.days.map((d) => toISODate(d)), "Present", "Absent", "Late", "Excused", "Rate %"],
    reg.rows.map((r) => [r.roll, r.name, ...r.cells.map((c) => c ?? ""), r.counts.PRESENT, r.counts.ABSENT, r.counts.LATE, r.counts.EXCUSED, r.rate ?? ""]),
  );
}
