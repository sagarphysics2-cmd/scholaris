import { describe, expect, it } from "vitest";
import { parseCSV, parseCSVObjects, toCSV } from "@/lib/csv";
import { examSubjectSchema, marksEntrySchema } from "@/lib/validation/academics";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { money, phone } from "@/lib/validation/common";
import { assignFeeSchema, paymentSchema } from "@/lib/validation/fees";
import { parseWith } from "@/lib/validation/form";
import { noticeSchema } from "@/lib/validation/notices";
import { studentSchema } from "@/lib/validation/people";

const validStudent = {
  firstName: "Jamie",
  lastName: "Rivera",
  dateOfBirth: "2014-05-12",
  gender: "FEMALE",
  admissionNumber: "GIS/2026/0901",
  admissionDate: "2026-08-01",
  sectionId: "sec_1",
};

describe("student validation", () => {
  it("accepts a valid student and normalises empty optionals to null", () => {
    const r = parseWith(studentSchema, { ...validStudent, email: "", phone: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBeNull();
      expect(r.data.dateOfBirth.toISOString()).toBe("2014-05-12T00:00:00.000Z");
    }
  });

  it("reports required fields, bad email and impossible dates", () => {
    const r = parseWith(studentSchema, { ...validStudent, firstName: " ", email: "nope", dateOfBirth: "2014-02-30" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.fieldErrors.firstName?.[0]).toMatch(/required/);
      expect(r.fieldErrors.email?.[0]).toMatch(/valid email/);
      expect(r.fieldErrors.dateOfBirth?.[0]).toMatch(/valid date/);
    }
  });

  it("rejects a future date of birth and admission before birth", () => {
    const r = parseWith(studentSchema, { ...validStudent, dateOfBirth: "2099-01-01", admissionDate: "2010-01-01" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.fieldErrors.dateOfBirth).toBeDefined();
  });

  it("requires an email to send an invitation", () => {
    const r = parseWith(studentSchema, { ...validStudent, sendInvite: "on" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.fieldErrors.email?.[0]).toMatch(/required/);
  });
});

describe("common fields", () => {
  it("validates phone numbers", () => {
    expect(phone.safeParse("+44 20 7946 0958").success).toBe(true);
    expect(phone.safeParse("(555) 123-4567").success).toBe(true);
    expect(phone.safeParse("call me").success).toBe(false);
  });
  it("rejects negative money and more than 2 decimals", () => {
    expect(money().safeParse("-1").success).toBe(false);
    expect(money().safeParse("10.005").success).toBe(false);
    expect(money().safeParse("1,250.50").success).toBe(true);
  });
  it("enforces the password policy and matching confirmation", () => {
    expect(resetPasswordSchema.safeParse({ token: "x".repeat(20), password: "short", confirmPassword: "short" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "x".repeat(20), password: "GoodPassw0rd", confirmPassword: "Different1A" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "x".repeat(20), password: "GoodPassw0rd", confirmPassword: "GoodPassw0rd" }).success).toBe(true);
  });
});

describe("academic validation", () => {
  it("rejects passing marks above maximum marks", () => {
    const r = parseWith(examSubjectSchema, { classId: "c", subjectId: "s", examDate: "2026-11-10", maxMarks: "50", passingMarks: "60" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.fieldErrors.passingMarks).toBeDefined();
  });
  it("rejects negative marks in a marks submission", () => {
    const r = marksEntrySchema.safeParse({ examSubjectId: "p", sectionId: "s", records: JSON.stringify([{ studentId: "a", marks: -3, absent: false }]) });
    expect(r.success).toBe(false);
  });
});

describe("fees and notices validation", () => {
  it("rejects a discount larger than the amount", () => {
    const r = parseWith(assignFeeSchema, { categoryId: "c", title: "T", amount: "100", discount: "150", dueDate: "2026-12-01", target: "CLASS", classId: "x" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.fieldErrors.discount).toBeDefined();
  });
  it("rejects zero payments", () => {
    expect(paymentSchema.safeParse({ amount: "0", method: "CASH", paidAt: "2026-10-01" }).success).toBe(false);
  });
  it("requires a section for section notices and expiry after publish", () => {
    const r = parseWith(noticeSchema, { title: "T", message: "M", audience: "SECTION", publishDate: "2026-10-10T10:00", expiryDate: "2026-10-01T10:00" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.fieldErrors.sectionId).toBeDefined();
      expect(r.fieldErrors.expiryDate).toBeDefined();
    }
  });
});

describe("CSV", () => {
  it("round-trips quotes, commas and newlines", () => {
    const csv = toCSV(["a", "b"], [["x, y", 'say "hi"'], ["line\nbreak", 3]]);
    expect(parseCSV(csv)).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["line\nbreak", "3"]]);
  });
  it("neutralises spreadsheet formula injection but keeps negative numbers", () => {
    const csv = toCSV(["v"], [["=HYPERLINK(\"http://evil\")"], ["@SUM(A1)"], [-5]]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'@SUM");
    expect(csv).toContain("\r\n-5\r\n");
  });
  it("maps headers to normalised keys", () => {
    expect(parseCSVObjects("﻿First Name,Date of Birth\nAva,2014-01-01\n")).toEqual([{ firstname: "Ava", dateofbirth: "2014-01-01" }]);
  });
});

describe("open redirect protection", async () => {
  const { safeNext } = await import("@/lib/auth/redirect");
  it("only allows same-site paths", () => {
    expect(safeNext("/attendance?tab=mark")).toBe("/attendance?tab=mark");
    for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "https://evil.com", "javascript:alert(1)", "/\n/evil.com", null]) {
      expect(safeNext(bad as string | null)).toBe("/dashboard");
    }
  });
});
