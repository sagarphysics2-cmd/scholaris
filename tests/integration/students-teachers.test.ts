import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { fromDatabaseError, ConflictError } from "@/server/errors";
import { createStudent, deleteStudent, getStudentProfile, importStudents, listStudents, setStudentArchived, updateStudent } from "@/server/services/students.service";
import { assignTeaching, createTeacher, setTeacherArchived, updateTeacher } from "@/server/services/teachers.service";
import { EMAIL, actorFor, uniq } from "../support/helpers";

async function baseInput() {
  const section = await db.section.findFirstOrThrow({ where: { academicYear: { isCurrent: true } }, include: { class: true } });
  return {
    section,
    input: {
      firstName: "Ivy",
      lastName: uniq("Test"),
      dateOfBirth: new Date("2014-03-03T00:00:00Z"),
      gender: "FEMALE" as const,
      admissionNumber: uniq("ADM-"),
      admissionDate: new Date("2026-08-01T00:00:00Z"),
      sectionId: section.id,
      rollNumber: null,
      status: "ACTIVE" as const,
      relationship: "GUARDIAN" as const,
      sendInvite: false,
      email: `${uniq("ivy").toLowerCase()}@test.example`,
    },
  };
}

describe("student CRUD", () => {
  it("creates a student with user, enrollment, generated ID and audit entry", async () => {
    const admin = await actorFor(EMAIL.admin);
    const { input, section } = await baseInput();
    const s = await createStudent(admin, input);
    const profile = await getStudentProfile(admin, s.id);
    expect(profile.studentCode).toMatch(/^STU-\d{4}-\d{4}$/);
    expect(profile.user.status).toBe("INVITED");
    expect(profile.enrollments[0]!.sectionId).toBe(section.id);
    expect(await db.auditLog.count({ where: { action: "student.create", entityId: s.id } })).toBe(1);
  });

  it("prevents duplicate admission numbers (friendly conflict error)", async () => {
    const admin = await actorFor(EMAIL.admin);
    const { input } = await baseInput();
    await createStudent(admin, input);
    const dup = { ...input, email: null, lastName: "Dup" };
    const err = await createStudent(admin, dup).catch((e) => e);
    const mapped = fromDatabaseError(err);
    expect(mapped).toBeInstanceOf(ConflictError);
    expect(mapped!.message).toMatch(/admission number/);
  });

  it("updates details, moves section and records the changes", async () => {
    const admin = await actorFor(EMAIL.admin);
    const { input } = await baseInput();
    const s = await createStudent(admin, input);
    const other = await db.section.findFirstOrThrow({ where: { academicYear: { isCurrent: true }, NOT: { id: input.sectionId } } });
    await updateStudent(admin, s.id, { ...input, firstName: "Ivana", sectionId: other.id });
    const p = await getStudentProfile(admin, s.id);
    expect(p.user.firstName).toBe("Ivana");
    expect(p.enrollments.find((e) => e.academicYear.isCurrent)!.sectionId).toBe(other.id);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "student.update", entityId: s.id } });
    expect(JSON.stringify(log.metadata)).toContain("Ivana");
  });

  it("archives (disabling login) and only deletes students without records", async () => {
    const admin = await actorFor(EMAIL.admin);
    const { input } = await baseInput();
    const s = await createStudent(admin, input);
    await setStudentArchived(admin, s.id, true);
    expect((await db.user.findUniqueOrThrow({ where: { id: s.userId } })).status).toBe("DISABLED");
    expect((await listStudents(admin, { q: input.lastName })).total).toBe(0); // hidden from default list
    expect((await listStudents(admin, { q: input.lastName, status: "ARCHIVED" })).total).toBe(1);

    const withHistory = await db.attendance.findFirstOrThrow({ select: { studentId: true } });
    await expect(deleteStudent(admin, withHistory.studentId)).rejects.toThrow(/cannot be deleted/);
    await deleteStudent(admin, s.id);
    expect(await db.student.findUnique({ where: { id: s.id } })).toBeNull();
  });

  it("imports CSV all-or-nothing with row-level errors", async () => {
    const admin = await actorFor(EMAIL.admin);
    const a1 = uniq("IMP-");
    const bad = `First Name,Last Name,Date of Birth,Gender,Admission Number,Admission Date,Class,Section\nAna,One,2014-01-01,FEMALE,${a1},2026-08-01,Grade 6,A\nBen,Two,not-a-date,MALE,${uniq("IMP-")},2026-08-01,Grade 6,Z\n`;
    const r1 = await importStudents(admin, bad);
    expect(r1.created).toBe(0);
    expect(r1.errors.map((e) => e.row)).toEqual([3]);
    expect(await db.student.count({ where: { admissionNumber: a1 } })).toBe(0);

    const good = `First Name,Last Name,Date of Birth,Gender,Admission Number,Admission Date,Class,Section\nAna,One,2014-01-01,female,${a1},2026-08-01,grade 6,a\n`;
    expect((await importStudents(admin, good)).created).toBe(1);
    expect((await importStudents(admin, good)).errors[0]!.messages.join()).toMatch(/already exists/);
  });
});

describe("teacher CRUD", () => {
  it("creates, updates, assigns and archives a teacher", async () => {
    const admin = await actorFor(EMAIL.admin);
    const employeeId = uniq("EMP-");
    const t = await createTeacher(admin, { firstName: "Tess", lastName: "Ng", email: `${employeeId.toLowerCase()}@test.example`, employeeId, joiningDate: new Date("2020-01-01"), sendInvite: false });
    await updateTeacher(admin, t.id, { firstName: "Tessa", lastName: "Ng", email: `${employeeId.toLowerCase()}@test.example`, employeeId, joiningDate: new Date("2020-01-01"), qualification: "M.Ed.", sendInvite: false });
    expect((await db.teacher.findUniqueOrThrow({ where: { id: t.id } })).qualification).toBe("M.Ed.");

    const cs = await db.classSubject.findFirstOrThrow({ where: { academicYear: { isCurrent: true } }, include: { class: { include: { sections: true } } } });
    const section = cs.class.sections[0]!;
    await assignTeaching(admin, { teacherId: t.id, sectionId: section.id, subjectId: cs.subjectId });
    expect((await db.teacherSubject.findUniqueOrThrow({ where: { subjectId_sectionId: { subjectId: cs.subjectId, sectionId: section.id } } })).teacherId).toBe(t.id);

    await setTeacherArchived(admin, t.id, true);
    expect(await db.teacherSubject.count({ where: { teacherId: t.id } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: t.userId } })).status).toBe("DISABLED");
  });

  it("rejects duplicate employee IDs", async () => {
    const admin = await actorFor(EMAIL.admin);
    const err = await createTeacher(admin, { firstName: "A", lastName: "B", email: `${uniq().toLowerCase()}@t.example`, employeeId: "EMP-1001", joiningDate: new Date(), sendInvite: false }).catch((e) => e);
    expect(fromDatabaseError(err)?.message).toMatch(/employee ID/);
  });
});
