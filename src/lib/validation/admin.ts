import { z } from "zod";
import { NOTIFICATION_TYPES } from "./settings";
import { checkbox, email, intField, optionalEmail, optionalPhone, optionalString, requiredString } from "./common";

export const schoolProfileSchema = z.object({
  name: requiredString("School name", 150),
  address: optionalString(300),
  phone: optionalPhone,
  email: optionalEmail,
  website: z.preprocess((v) => (v === "" ? null : v), z.url({ error: "Enter a full URL, e.g. https://school.example" }).max(200).nullable().optional()),
});

export const generalSettingsSchema = z.object({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, { error: "Use a 3-letter currency code, e.g. USD." }),
  timezone: requiredString("Time zone", 60),
  schoolDays: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.coerce.number().int().min(1).max(7)).min(1, { error: "Choose at least one school day." })),
});

export const attendanceSettingsSchema = z.object({
  lowAttendanceThreshold: intField("Threshold", 0, 100),
  teacherEditWindowDays: intField("Edit window", 0, 365),
  lateCountsAsPresent: checkbox,
  notifyParentsOnAbsence: checkbox,
});

export const examSettingsSchema = z.object({
  overallPassPercent: intField("Overall pass percentage", 0, 100),
  grades: z.preprocess(
    (v) => {
      try {
        return typeof v === "string" ? JSON.parse(v) : v;
      } catch {
        return null;
      }
    },
    z
      .array(z.object({ grade: z.string().trim().min(1).max(5), minPercent: z.number().min(0).max(100), gradePoint: z.number().min(0).max(10).nullable(), remark: z.string().max(60).nullable() }), { error: "Grading scale is invalid." })
      .min(2, { error: "Add at least two grades." })
      .max(15)
      .refine((g) => new Set(g.map((x) => x.grade.toUpperCase())).size === g.length, { error: "Grade names must be unique." })
      .refine((g) => new Set(g.map((x) => x.minPercent)).size === g.length, { error: "Each grade needs a different minimum percentage." })
      .refine((g) => g.some((x) => x.minPercent === 0), { error: "One grade must start at 0% so every score has a grade." }),
  ),
});

export const feeSettingsSchema = z.object({
  receiptPrefix: requiredString("Receipt prefix", 10).regex(/^[A-Za-z0-9-]+$/, { error: "Letters, numbers and dashes only." }),
  reminderDaysBeforeDue: intField("Reminder days", 0, 60),
  showFeesToStudents: checkbox,
});

export const notificationSettingsSchema = z.object(Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, checkbox])) as Record<(typeof NOTIFICATION_TYPES)[number], typeof checkbox>);

export const adminUserSchema = z.object({
  firstName: requiredString("First name", 60),
  lastName: requiredString("Last name", 60),
  email,
  phone: optionalPhone,
  role: z.enum(["SCHOOL_ADMIN", "SUPER_ADMIN"]),
  schoolId: z.preprocess((v) => (v === "" ? null : v), z.string().max(64).nullable().optional()),
});

export const schoolSchema = schoolProfileSchema.extend({
  code: requiredString("Code", 12).transform((s) => s.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9-]+$/, { error: "Letters, numbers and dashes only." })),
});
