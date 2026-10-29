import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/utils";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { assignFees, getFee, recordPayment, updateFee } from "@/server/services/fees.service";
import { createNotice, getNotice, listNotices } from "@/server/services/notices.service";
import { EMAIL, actorFor, uniq } from "../support/helpers";

describe("fees", () => {
  it("bills a section, records partial and full payments, and blocks overpayment", async () => {
    const admin = await actorFor(EMAIL.admin);
    const section = await db.section.findFirstOrThrow({ where: { academicYear: { isCurrent: true } }, include: { _count: { select: { enrollments: true } } } });
    const category = await db.feeCategory.findFirstOrThrow();
    const title = uniq("Field trip ");
    const res = await assignFees(admin, { categoryId: category.id, title, amount: 200, discount: 20, dueDate: new Date("2026-12-01T00:00:00Z"), target: "SECTION", sectionId: section.id, studentIds: [] });
    expect(res.created).toBe(section._count.enrollments);
    expect((await assignFees(admin, { categoryId: category.id, title, amount: 200, discount: 20, dueDate: new Date("2026-12-01T00:00:00Z"), target: "SECTION", sectionId: section.id, studentIds: [] })).skipped).toBe(res.created);

    const fee = await db.fee.findFirstOrThrow({ where: { title } });
    const p1 = await recordPayment(admin, fee.id, { amount: 100, method: "CASH", paidAt: new Date() });
    expect((await getFee(admin, fee.id)).display).toBe("PARTIALLY_PAID");
    await expect(recordPayment(admin, fee.id, { amount: 81, method: "CASH", paidAt: new Date() })).rejects.toThrow(/exceeds/);
    const p2 = await recordPayment(admin, fee.id, { amount: 80, method: "BANK_TRANSFER", reference: "abc123", paidAt: new Date() });
    const after = await getFee(admin, fee.id);
    expect(after.display).toBe("PAID");
    expect(toNumber(after.amountPaid)).toBe(180);
    expect(p1.receiptNumber).not.toBe(p2.receiptNumber);
    expect(p2.reference).toBe("ABC123");
    expect(await db.auditLog.count({ where: { action: "fee.payment", entityId: fee.id } })).toBe(2);

    await expect(updateFee(admin, fee.id, { title, amount: 150, discount: 0, dueDate: fee.dueDate })).rejects.toThrow(ValidationError);
  });

  it("concurrent payments cannot overpay a fee", async () => {
    const admin = await actorFor(EMAIL.admin);
    const student = await db.student.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const category = await db.feeCategory.findFirstOrThrow();
    const title = uniq("Race ");
    await assignFees(admin, { categoryId: category.id, title, amount: 100, discount: 0, dueDate: new Date("2026-12-01T00:00:00Z"), target: "STUDENTS", studentIds: [student.id] });
    const fee = await db.fee.findFirstOrThrow({ where: { title } });
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => recordPayment(admin, fee.id, { amount: 60, method: "CASH", paidAt: new Date() })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(toNumber((await db.fee.findUniqueOrThrow({ where: { id: fee.id } })).amountPaid)).toBe(60);
  });

  it("parents and students cannot record payments", async () => {
    const fee = await db.fee.findFirstOrThrow({ where: { status: "PENDING" } });
    for (const email of [EMAIL.parent, EMAIL.student, EMAIL.teacher]) {
      await expect(recordPayment(await actorFor(email), fee.id, { amount: 1, method: "CASH", paidAt: new Date() })).rejects.toThrow(ForbiddenError);
    }
  });
});

describe("notices", () => {
  it("teachers can only announce to their own sections", async () => {
    const teacher = await actorFor(EMAIL.teacher);
    const base = { title: uniq("N "), message: "Hello", publishDate: new Date(), expiryDate: null, isPinned: false };
    await expect(createNotice(teacher, { ...base, audience: "SCHOOL" }, [])).rejects.toThrow(ForbiddenError);
    const other = await db.section.findFirstOrThrow({ where: { classTeacherId: { not: teacher.teacherId }, teacherSubjects: { none: { teacherId: teacher.teacherId! } } } });
    await expect(createNotice(teacher, { ...base, audience: "SECTION", sectionId: other.id }, [])).rejects.toThrow(ForbiddenError);
    const mine = await db.section.findFirstOrThrow({ where: { classTeacherId: teacher.teacherId } });
    const n = await createNotice(teacher, { ...base, audience: "SECTION", sectionId: mine.id }, []);
    const enrolled = await db.enrollment.findFirstOrThrow({ where: { sectionId: mine.id }, include: { student: true } });
    expect(await db.notification.count({ where: { userId: enrolled.student.userId, link: `/notices/${n.id}` } })).toBe(1);
  });

  it("audiences are enforced when reading", async () => {
    const admin = await actorFor(EMAIL.admin);
    const student = await actorFor(EMAIL.student);
    const forTeachers = await createNotice(admin, { title: uniq("Staff "), message: "Staff only", audience: "TEACHERS", publishDate: new Date(), expiryDate: null, isPinned: false }, []);
    await expect(getNotice(student, forTeachers.id)).rejects.toThrow(NotFoundError);
    await expect(getNotice(await actorFor(EMAIL.teacher), forTeachers.id)).resolves.toBeTruthy();

    const scheduled = await createNotice(admin, { title: uniq("Later "), message: "Soon", audience: "SCHOOL", publishDate: new Date(Date.now() + 86400000), expiryDate: null, isPinned: false }, []);
    expect((await listNotices(student, {})).rows.map((r) => r.id)).not.toContain(scheduled.id);
    expect(scheduled.notifiedAt).toBeNull();
  });
});
