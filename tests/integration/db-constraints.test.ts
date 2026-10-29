import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

/** The database itself must refuse invalid academic and financial data. */
async function rejects(p: Promise<unknown>) {
  await expect(p).rejects.toBeTruthy();
}

describe("database constraints", () => {
  it("prevents duplicate attendance for the same student, section and date", async () => {
    const a = await db.attendance.findFirstOrThrow();
    await rejects(db.attendance.create({ data: { studentId: a.studentId, sectionId: a.sectionId, date: a.date, status: "PRESENT" } }));
  });

  it("rejects negative marks and marks for an absent student", async () => {
    const m = await db.mark.findFirstOrThrow({ where: { isAbsent: false } });
    await rejects(db.mark.update({ where: { id: m.id }, data: { marksObtained: -1 } }));
    await rejects(db.mark.update({ where: { id: m.id }, data: { isAbsent: true } }));
  });

  it("rejects passing marks above maximum marks", async () => {
    const p = await db.examSubject.findFirstOrThrow();
    await rejects(db.examSubject.update({ where: { id: p.id }, data: { passingMarks: p.maxMarks + 1 } }));
  });

  it("rejects negative fees, oversized discounts and over-payment", async () => {
    const f = await db.fee.findFirstOrThrow();
    await rejects(db.fee.update({ where: { id: f.id }, data: { amount: -1 } }));
    await rejects(db.fee.update({ where: { id: f.id }, data: { discount: 1e9 } }));
    await rejects(db.fee.update({ where: { id: f.id }, data: { amountPaid: 1e9 } }));
    await rejects(db.feePayment.create({ data: { feeId: f.id, receiptNumber: `NEG-${Date.now()}`, amount: -5, method: "CASH" } }));
  });

  it("allows only one current academic year per school and valid date ranges", async () => {
    const y = await db.academicYear.findFirstOrThrow({ where: { isCurrent: false } });
    await rejects(db.academicYear.update({ where: { id: y.id }, data: { isCurrent: true } }));
    await rejects(db.academicYear.update({ where: { id: y.id }, data: { endDate: new Date("2000-01-01") } }));
  });

  it("enforces unique emails case-insensitively and unique roll numbers per section", async () => {
    const u = await db.user.findFirstOrThrow({ where: { email: { not: null } } });
    await rejects(db.user.create({ data: { email: u.email!.toUpperCase(), firstName: "X", lastName: "Y", roleId: u.roleId } }));
    const e = await db.enrollment.findFirstOrThrow();
    const other = await db.enrollment.findFirstOrThrow({ where: { sectionId: e.sectionId, NOT: { id: e.id } } });
    await rejects(db.enrollment.update({ where: { id: other.id }, data: { rollNumber: e.rollNumber } }));
  });

  it("prevents a teacher being double-booked in the timetable", async () => {
    const t = await db.timetableEntry.findFirstOrThrow();
    const otherSection = await db.section.findFirstOrThrow({ where: { NOT: { id: t.sectionId }, academicYearId: t.academicYearId } });
    await rejects(db.timetableEntry.create({ data: { academicYearId: t.academicYearId, sectionId: otherSection.id, dayOfWeek: t.dayOfWeek, periodId: t.periodId, subjectId: t.subjectId, teacherId: t.teacherId } }));
  });
});
