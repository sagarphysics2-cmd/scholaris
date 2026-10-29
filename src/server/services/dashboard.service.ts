import { db } from "@/lib/db";
import { attendanceRate, emptyCounts } from "@/lib/attendance";
import { addDays, round2, todayUTC, toNumber } from "@/lib/utils";
import { requireSchoolId, type Actor } from "@/server/authz/guards";
import { getCurrentAcademicYear, teacherSectionIds } from "@/server/authz/scope";
import { attendanceOverview, schoolSettings, studentAttendanceSummary } from "./attendance.service";
import { pendingGradingForTeacher, upcomingForStudent } from "./assignments.service";
import { studentResultsOverview, upcomingPapers } from "./exams.service";
import { feeOverview, studentFeeSummary } from "./fees.service";
import { recentNotices } from "./notices.service";
import { todaysLessons } from "./timetable.service";

export async function adminDashboard(actor: Actor) {
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  const [students, teachers, parents, sections, classes, attendance, fees, papers, notices, assignments, byClass] = await Promise.all([
    db.student.count({ where: { schoolId, status: "ACTIVE" } }),
    db.teacher.count({ where: { schoolId, status: "ACTIVE" } }),
    db.parent.count({ where: { schoolId, status: "ACTIVE" } }),
    db.section.count({ where: { academicYearId: year?.id ?? "__none__" } }),
    db.class.count({ where: { schoolId } }),
    attendanceOverview(actor, 14),
    actor.permissions.has("fees.manage") ? feeOverview(actor) : null,
    upcomingPapers(actor, 6),
    recentNotices(actor, 5),
    db.assignment.findMany({ where: { schoolId, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 5, include: { subject: true, section: { include: { class: true } }, _count: { select: { submissions: true } } } }),
    db.class.findMany({
      where: { schoolId },
      orderBy: { level: "asc" },
      include: { sections: { where: { academicYearId: year?.id ?? "__none__" }, include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } } },
    }),
  ]);
  return {
    year,
    counts: { students, teachers, parents, sections, classes },
    attendance,
    fees,
    papers,
    notices,
    assignments,
    distribution: byClass.map((c) => ({ class: c.name, students: c.sections.reduce((n, s) => n + s._count.enrollments, 0) })),
  };
}

export async function teacherDashboard(actor: Actor) {
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  const sectionIds = actor.teacherId ? await teacherSectionIds(actor.teacherId, year?.id) : [];
  const today = todayUTC();
  const [sections, lessons, pending, papers, notices, todayAttendance] = await Promise.all([
    db.section.findMany({
      where: { id: { in: sectionIds } },
      include: { class: true, teacherSubjects: { where: { teacherId: actor.teacherId ?? "" }, include: { subject: true } }, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
      orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
    }),
    todaysLessons(actor),
    actor.teacherId ? pendingGradingForTeacher(actor.teacherId) : [],
    upcomingPapers(actor, 5),
    recentNotices(actor, 5),
    db.attendance.groupBy({ by: ["sectionId", "status"], where: { sectionId: { in: sectionIds }, date: today }, _count: true }),
  ]);
  const marked = new Map<string, ReturnType<typeof emptyCounts>>();
  for (const r of todayAttendance) {
    const c = marked.get(r.sectionId) ?? emptyCounts();
    c[r.status] += r._count;
    marked.set(r.sectionId, c);
  }
  const settings = await schoolSettings(schoolId);
  return {
    sections: sections.map((s) => ({
      id: s.id,
      label: `${s.class.name} – ${s.name}`,
      students: s._count.enrollments,
      subjects: s.teacherSubjects.map((t) => t.subject.name),
      isClassTeacher: s.classTeacherId === actor.teacherId,
      todayRate: marked.has(s.id) ? attendanceRate(marked.get(s.id)!, settings.attendance.lateCountsAsPresent) : null,
      todayMarked: marked.has(s.id),
    })),
    lessons,
    pending,
    papers,
    notices,
  };
}

/** Student dashboard — also used per child on the parent dashboard. */
export async function learnerDashboard(actor: Actor, studentId: string) {
  const schoolId = requireSchoolId(actor);
  const settings = await schoolSettings(schoolId);
  const feesVisible = actor.permissions.has("fees.read") && (Boolean(actor.parentId) || settings.fees.showFeesToStudents);
  const [attendance, lessons, assignments, results, papers, notices, fees] = await Promise.all([
    studentAttendanceSummary(actor, studentId, { from: addDays(todayUTC(), -365) }),
    todaysLessons(actor, studentId),
    upcomingForStudent(studentId, 5),
    studentResultsOverview(actor, studentId),
    upcomingPapers(actor, 5, studentId),
    recentNotices(actor, 4),
    feesVisible ? studentFeeSummary(actor, studentId) : null,
  ]);
  return { attendance, lessons, assignments, results: results.slice(0, 3), papers, notices, fees, currency: settings.currency };
}

export async function parentChildrenCards(actor: Actor) {
  if (!actor.parentId) return [];
  const links = await db.parentStudent.findMany({
    where: { parentId: actor.parentId, student: { status: { not: "ARCHIVED" } } },
    include: { student: { include: { user: { select: { firstName: true, lastName: true, avatarFileId: true } }, enrollments: { where: { academicYear: { isCurrent: true } }, include: { section: { include: { class: true } } } } } } },
  });
  const settings = await schoolSettings(requireSchoolId(actor));
  const cards = [];
  for (const l of links) {
    const [att, fees] = await Promise.all([
      studentAttendanceSummary(actor, l.studentId),
      db.fee.aggregate({ where: { studentId: l.studentId, status: { in: ["PENDING", "PARTIALLY_PAID"] } }, _sum: { amount: true, discount: true, amountPaid: true } }),
    ]);
    const e = l.student.enrollments[0];
    cards.push({
      id: l.studentId,
      name: `${l.student.user.firstName} ${l.student.user.lastName}`,
      avatarFileId: l.student.user.avatarFileId,
      section: e ? `${e.section.class.name} – ${e.section.name}` : "Not enrolled",
      attendance: att.rate,
      outstanding: round2(toNumber(fees._sum.amount) - toNumber(fees._sum.discount) - toNumber(fees._sum.amountPaid)),
      currency: settings.currency,
    });
  }
  return cards;
}
