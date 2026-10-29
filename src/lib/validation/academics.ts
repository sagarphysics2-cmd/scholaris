import { z } from "zod";
import { dateString, id, idList, intField, isDate, isNum, optionalId, optionalInt, optionalString, requiredString } from "./common";

export const academicYearSchema = z
  .object({
    name: requiredString("Name", 30).regex(/^\d{4}\s*[–-]\s*\d{4}$/, { error: "Use the format 2026–2027." }),
    startDate: dateString("Start date"),
    endDate: dateString("End date"),
  })
  .refine((d) => !isDate(d.startDate) || !isDate(d.endDate) || d.endDate > d.startDate, { error: "End date must be after start date.", path: ["endDate"] })
  .refine((d) => !isDate(d.startDate) || !isDate(d.endDate) || d.endDate.getTime() - d.startDate.getTime() <= 400 * 86400000, { error: "An academic year cannot be longer than about 13 months.", path: ["endDate"] });

export const classSchema = z.object({
  name: requiredString("Class name", 60),
  level: intField("Level", 0, 20),
});

export const sectionSchema = z.object({
  classId: id("Class"),
  name: requiredString("Section name", 10).regex(/^[A-Za-z0-9 -]+$/, { error: "Use letters, numbers, spaces or dashes." }),
  room: optionalString(30),
  capacity: optionalInt("Capacity", 1, 200),
  classTeacherId: optionalId,
});

export const curriculumSchema = z.object({
  classId: id("Class"),
  subjectIds: idList,
});

export const subjectSchema = z.object({
  name: requiredString("Subject name", 80),
  code: requiredString("Subject code", 12)
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9_-]+$/, { error: "Use letters, numbers, - or _ only." })),
  description: optionalString(500),
});

export const attendanceSaveSchema = z.object({
  sectionId: id("Section"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a valid date." })
    .transform((s) => new Date(`${s}T00:00:00.000Z`)),
  records: z.preprocess(
    (v) => {
      if (typeof v !== "string") return v;
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    },
    z
      .array(
        z.object({
          studentId: z.string().min(1).max(64),
          status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
          note: z.string().max(500).nullable().optional(),
        }),
        { error: "Attendance data is invalid." },
      )
      .min(1, { error: "Mark at least one student." })
      .max(300),
  ),
});

export const periodSchema = z
  .object({
    name: requiredString("Name", 40),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use HH:MM." }),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use HH:MM." }),
    sortOrder: intField("Order", 1, 30),
    isBreak: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  })
  .refine((d) => typeof d.startTime !== "string" || typeof d.endTime !== "string" || d.endTime > d.startTime, { error: "End time must be after start time.", path: ["endTime"] });

export const timetableEntrySchema = z.object({
  sectionId: id("Section"),
  dayOfWeek: intField("Day", 1, 7),
  periodId: id("Period"),
  subjectId: id("Subject"),
  teacherId: id("Teacher"),
  room: optionalString(30),
});

export const assignmentSchema = z.object({
  title: requiredString("Title", 150),
  description: requiredString("Description", 5000),
  sectionId: id("Class section"),
  subjectId: id("Subject"),
  dueDate: z
    .string({ error: "Due date is required." })
    .min(1, { error: "Due date is required." })
    .refine((s) => !Number.isNaN(new Date(s).getTime()), { error: "Enter a valid due date." })
    .transform((s) => new Date(s)),
  maxMarks: intField("Maximum marks", 1, 1000),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).default("PUBLISHED"),
});

export const submissionSchema = z.object({
  content: optionalString(5000),
});

export const gradeSubmissionSchema = z.object({
  marks: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v)) : v),
    z.number({ error: (i) => (i.input === undefined ? "Marks are required." : "Marks must be a number.") }).min(0, { error: "Marks cannot be negative." }),
  ),
  feedback: optionalString(2000),
});

export const EXAM_STATUSES = ["DRAFT", "SCHEDULED", "ONGOING", "COMPLETED", "PUBLISHED"] as const;

export const examSchema = z
  .object({
    name: requiredString("Name", 120),
    term: optionalString(60),
    description: optionalString(1000),
    startDate: dateString("Start date"),
    endDate: dateString("End date"),
    status: z.enum(["DRAFT", "SCHEDULED", "ONGOING", "COMPLETED"]).default("SCHEDULED"),
  })
  .refine((d) => !isDate(d.startDate) || !isDate(d.endDate) || d.endDate >= d.startDate, { error: "End date cannot be before the start date.", path: ["endDate"] })
  .refine((d) => !isDate(d.startDate) || !isDate(d.endDate) || d.endDate.getTime() - d.startDate.getTime() <= 60 * 86400000, { error: "An examination can span at most 60 days.", path: ["endDate"] });

export const examSubjectSchema = z
  .object({
    classId: id("Class"),
    subjectId: id("Subject"),
    examDate: dateString("Exam date"),
    startTime: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use HH:MM." }).nullable().optional()),
    endTime: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use HH:MM." }).nullable().optional()),
    maxMarks: intField("Maximum marks", 1, 1000),
    passingMarks: intField("Passing marks", 0, 1000),
    room: optionalString(40),
  })
  .refine((d) => !isNum(d.passingMarks) || !isNum(d.maxMarks) || d.passingMarks <= d.maxMarks, { error: "Passing marks cannot exceed maximum marks.", path: ["passingMarks"] })
  .refine((d) => !d.startTime || !d.endTime || d.endTime > d.startTime, { error: "End time must be after start time.", path: ["endTime"] });

export const marksEntrySchema = z.object({
  examSubjectId: id("Paper"),
  sectionId: id("Section"),
  records: z.preprocess(
    (v) => {
      try {
        return typeof v === "string" ? JSON.parse(v) : v;
      } catch {
        return null;
      }
    },
    z
      .array(
        z.object({
          studentId: z.string().min(1).max(64),
          marks: z.number().min(0, { error: "Marks cannot be negative." }).nullable(),
          absent: z.boolean(),
          remarks: z.string().max(300).nullable().optional(),
        }),
        { error: "Marks data is invalid." },
      )
      .max(300),
  ),
});
