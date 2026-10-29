import { z } from "zod";

/**
 * Typed shape of `schools.settings` (JSONB). Always read through `parseSettings` so
 * missing keys fall back to sensible defaults and old rows stay compatible.
 */
export const NOTIFICATION_TYPES = [
  "ASSIGNMENT_NEW",
  "ASSIGNMENT_DUE",
  "ASSIGNMENT_GRADED",
  "RESULT_PUBLISHED",
  "ATTENDANCE",
  "NOTICE",
  "FEE_REMINDER",
] as const;

export const schoolSettingsSchema = z.object({
  currency: z.string().length(3).default("USD"),
  locale: z.string().default("en-US"),
  timezone: z.string().default("UTC"),
  schoolDays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
  attendance: z
    .object({
      lowAttendanceThreshold: z.number().min(0).max(100).default(75),
      lateCountsAsPresent: z.boolean().default(true),
      teacherEditWindowDays: z.number().int().min(0).max(365).default(7),
      notifyParentsOnAbsence: z.boolean().default(true),
    })
    .default({ lowAttendanceThreshold: 75, lateCountsAsPresent: true, teacherEditWindowDays: 7, notifyParentsOnAbsence: true }),
  exams: z
    .object({
      /** Minimum overall percentage to pass an examination (in addition to per-subject passing marks). */
      overallPassPercent: z.number().min(0).max(100).default(40),
    })
    .default({ overallPassPercent: 40 }),
  fees: z
    .object({
      receiptPrefix: z.string().max(10).default("RCPT"),
      reminderDaysBeforeDue: z.number().int().min(0).max(60).default(7),
      showFeesToStudents: z.boolean().default(true),
    })
    .default({ receiptPrefix: "RCPT", reminderDaysBeforeDue: 7, showFeesToStudents: true }),
  notifications: z
    .object({
      email: z.partialRecord(z.enum(NOTIFICATION_TYPES), z.boolean()).default({}),
    })
    .default({ email: {} }),
});

export type SchoolSettings = z.infer<typeof schoolSettingsSchema>;

export function parseSettings(raw: unknown): SchoolSettings {
  const res = schoolSettingsSchema.safeParse(raw ?? {});
  return res.success ? res.data : schoolSettingsSchema.parse({});
}
