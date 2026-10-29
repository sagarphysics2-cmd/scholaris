import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildActor } from "@/server/authz/build-actor";
import { assertCanViewStudent, resolveStudentContext } from "@/server/authz/scope";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { createStudent, getStudentProfile, listStudents } from "@/server/services/students.service";
import { getFee, listFees } from "@/server/services/fees.service";
import { listExams } from "@/server/services/exams.service";
import { globalSearch } from "@/server/services/search.service";
import { EMAIL, actorFor } from "../support/helpers";

describe("role-based permissions (server-side)", () => {
  it("loads permissions from the database, not from code", async () => {
    const teacher = await actorFor(EMAIL.teacher);
    expect(teacher.permissions.has("marks.enter")).toBe(true);
    expect(teacher.permissions.has("students.write")).toBe(false);

    // Revoke a permission in the DB → the next actor build reflects it.
    const role = await db.role.findUniqueOrThrow({ where: { key: "TEACHER" } });
    const perm = await db.permission.findUniqueOrThrow({ where: { key: "marks.enter" } });
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } } });
    try {
      const after = await buildActor(teacher.userId, "s");
      expect(after!.permissions.has("marks.enter")).toBe(false);
    } finally {
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
  });

  it("teachers, students and parents cannot create students", async () => {
    const section = await db.section.findFirstOrThrow();
    const input = { firstName: "X", lastName: "Y", dateOfBirth: new Date("2014-01-01"), gender: "MALE" as const, admissionNumber: "NOPE-1", admissionDate: new Date("2026-08-01"), sectionId: section.id, rollNumber: null, status: "ACTIVE" as const, relationship: "GUARDIAN" as const, sendInvite: false };
    for (const email of [EMAIL.teacher, EMAIL.student, EMAIL.parent]) {
      await expect(createStudent(await actorFor(email), input)).rejects.toThrow(ForbiddenError);
    }
  });

  it("a student can only see their own record — other ids look non-existent", async () => {
    const student = await actorFor(EMAIL.student);
    const other = await db.student.findFirstOrThrow({ where: { NOT: { id: student.studentId! } } });
    await expect(assertCanViewStudent(student, other.id)).rejects.toThrow(NotFoundError);
    await expect(assertCanViewStudent(student, student.studentId!)).resolves.toBeUndefined();
  });

  it("parents only see their linked children", async () => {
    const parent = await actorFor(EMAIL.parent);
    const links = await db.parentStudent.findMany({ where: { parentId: parent.parentId! } });
    const { rows, total } = await listStudents(parent, { take: 100 });
    expect(total).toBe(links.length);
    expect(rows.map((r) => r.id).sort()).toEqual(links.map((l) => l.studentId).sort());

    const stranger = await db.student.findFirstOrThrow({ where: { id: { notIn: links.map((l) => l.studentId) } } });
    await expect(getStudentProfile(parent, stranger.id)).rejects.toThrow(NotFoundError);
    // Asking for someone else's child falls back to own child, never the stranger.
    const ctx = await resolveStudentContext(parent, stranger.id);
    expect(links.map((l) => l.studentId)).toContain(ctx.studentId);
  });

  it("teachers only list students in sections they teach", async () => {
    const teacher = await actorFor(EMAIL.teacher);
    const { rows } = await listStudents(teacher, { take: 500 });
    const sectionIds = (await db.section.findMany({ where: { OR: [{ classTeacherId: teacher.teacherId }, { teacherSubjects: { some: { teacherId: teacher.teacherId! } } }] } })).map((s) => s.id);
    const enrolled = await db.enrollment.findMany({ where: { sectionId: { in: sectionIds } } });
    expect(rows.length).toBe(new Set(enrolled.map((e) => e.studentId)).size);
    expect(rows.length).toBeLessThan(100);
  });

  it("fees: teachers have no access; parents only see their children's fees", async () => {
    await expect(listFees(await actorFor(EMAIL.teacher), {})).rejects.toThrow(ForbiddenError);
    const parent = await actorFor(EMAIL.parent);
    const kids = (await db.parentStudent.findMany({ where: { parentId: parent.parentId! } })).map((l) => l.studentId);
    const { rows } = await listFees(parent, { take: 100 });
    expect(rows.every((f) => kids.includes(f.studentId))).toBe(true);
    const foreign = await db.fee.findFirstOrThrow({ where: { studentId: { notIn: kids } } });
    await expect(getFee(parent, foreign.id)).rejects.toThrow(NotFoundError);
  });

  it("students never see draft examinations", async () => {
    const admin = await actorFor(EMAIL.admin);
    const year = await db.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
    const draft = await db.examination.create({ data: { schoolId: admin.schoolId!, academicYearId: year.id, name: `Draft ${Date.now()}`, startDate: year.startDate, endDate: year.startDate, status: "DRAFT" } });
    const ids = (await listExams(await actorFor(EMAIL.student))).map((e) => e.id);
    expect(ids).not.toContain(draft.id);
    expect((await listExams(admin)).map((e) => e.id)).toContain(draft.id);
    await db.examination.delete({ where: { id: draft.id } });
  });

  it("global search respects scoping", async () => {
    const parent = await actorFor(EMAIL.parent);
    const groups = await globalSearch(parent, "a");
    expect(groups.find((g) => g.key === "teachers")).toBeUndefined();
    const kids = await db.parentStudent.count({ where: { parentId: parent.parentId! } });
    expect((groups.find((g) => g.key === "students")?.hits.length ?? 0)).toBeLessThanOrEqual(kids);
  });
});
