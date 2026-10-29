import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays } from "@/lib/utils";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { createAssignment, getAssignment, gradeSubmission, listAssignments, submitAssignment } from "@/server/services/assignments.service";
import { authorizeFileAccess, validateUpload } from "@/server/services/files.service";
import { EMAIL, actorFor, uniq } from "../support/helpers";

const pdf = (name = "work.pdf") => new File([Buffer.from("%PDF-1.4\n%test\n")], name, { type: "application/pdf" });

async function studentSection() {
  const student = await actorFor(EMAIL.student);
  const e = await db.enrollment.findFirstOrThrow({ where: { studentId: student.studentId!, academicYear: { isCurrent: true } } });
  const ts = await db.teacherSubject.findFirstOrThrow({ where: { sectionId: e.sectionId }, include: { teacher: { include: { user: true } } } });
  return { student, sectionId: e.sectionId, ts, teacher: await actorFor(ts.teacher.user.email!) };
}

describe("assignments", () => {
  it("teacher creates; student sees, submits (with file) and is graded", async () => {
    const { student, sectionId, ts, teacher } = await studentSection();
    const a = await createAssignment(teacher, { title: uniq("Essay "), description: "Write.", sectionId, subjectId: ts.subjectId, dueDate: addDays(new Date(), 3), maxMarks: 20, status: "PUBLISHED" }, [pdf("brief.pdf")]);
    expect((await listAssignments(student, {})).rows.map((r) => r.id)).toContain(a.id);
    expect(await db.notification.count({ where: { userId: student.userId, type: "ASSIGNMENT_NEW", link: `/assignments/${a.id}` } })).toBe(1);

    const res = await submitAssignment(student, a.id, "My answer", [pdf()]);
    expect(res.late).toBe(false);
    const sub = await db.assignmentSubmission.findUniqueOrThrow({ where: { assignmentId_studentId: { assignmentId: a.id, studentId: student.studentId! } }, include: { files: true } });
    expect(sub.files).toHaveLength(1);

    await expect(gradeSubmission(teacher, sub.id, 25, null)).rejects.toThrow(ValidationError);
    await gradeSubmission(teacher, sub.id, 17.5, "Good work");
    const graded = await db.assignmentSubmission.findUniqueOrThrow({ where: { id: sub.id } });
    expect(graded.status).toBe("GRADED");
    await expect(submitAssignment(student, a.id, "again", [])).rejects.toThrow(ConflictError);
  });

  it("students cannot grade, nor submit to other sections; drafts are hidden", async () => {
    const { student, sectionId, ts, teacher } = await studentSection();
    const draft = await createAssignment(teacher, { title: uniq("Draft "), description: "x", sectionId, subjectId: ts.subjectId, dueDate: addDays(new Date(), 3), maxMarks: 10, status: "DRAFT" }, []);
    await expect(getAssignment(student, draft.id)).rejects.toThrow(NotFoundError);
    await expect(submitAssignment(student, draft.id, "x", [])).rejects.toThrow(NotFoundError);

    const foreign = await db.assignment.findFirstOrThrow({ where: { NOT: { sectionId }, status: "PUBLISHED" } });
    await expect(submitAssignment(student, foreign.id, "x", [])).rejects.toThrow(NotFoundError);
    const anySub = await db.assignmentSubmission.findFirstOrThrow();
    await expect(gradeSubmission(student, anySub.id, 1, null)).rejects.toThrow(ForbiddenError);
  });

  it("only the owner, their parents and staff can download a submission file", async () => {
    const { student, sectionId, ts, teacher } = await studentSection();
    const a = await createAssignment(teacher, { title: uniq("Files "), description: "x", sectionId, subjectId: ts.subjectId, dueDate: addDays(new Date(), 3), maxMarks: 10, status: "PUBLISHED" }, []);
    await submitAssignment(student, a.id, null, [pdf()]);
    const file = await db.file.findFirstOrThrow({ where: { submission: { assignmentId: a.id } } });

    await expect(authorizeFileAccess(student, file.id)).resolves.toBeTruthy();
    await expect(authorizeFileAccess(teacher, file.id)).resolves.toBeTruthy();
    await expect(authorizeFileAccess(await actorFor(EMAIL.parent), file.id)).resolves.toBeTruthy();

    const classmate = await db.enrollment.findFirstOrThrow({ where: { sectionId, NOT: { studentId: student.studentId! }, student: { user: { email: { not: null } } } }, include: { student: { include: { user: true } } } });
    await expect(authorizeFileAccess(await actorFor(classmate.student.user.email!), file.id)).rejects.toThrow(NotFoundError);
  });
});

describe("upload validation", () => {
  it("rejects disallowed types, mismatched extensions and spoofed content", () => {
    const content = Buffer.from("MZ\x90\x00 executable");
    expect(() => validateUpload({ name: "x.exe", type: "application/x-msdownload", size: 10 }, content, "document")).toThrow(/not allowed/);
    expect(() => validateUpload({ name: "x.png", type: "application/pdf", size: 10 }, content, "document")).toThrow(/extension/);
    expect(() => validateUpload({ name: "x.pdf", type: "application/pdf", size: 10 }, content, "document")).toThrow(/content does not match/);
    expect(() => validateUpload({ name: "x.pdf", type: "application/pdf", size: 12 }, Buffer.from("%PDF-1.7 ok"), "image")).toThrow(/not allowed/);
    expect(validateUpload({ name: "x.pdf", type: "application/pdf", size: 12 }, Buffer.from("%PDF-1.7 ok"), "document")).toBe("application/pdf");
  });
  it("enforces the size limit", () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 0x25);
    expect(() => validateUpload({ name: "x.pdf", type: "application/pdf", size: big.length }, big, "document")).toThrow(/smaller than/);
  });
});
