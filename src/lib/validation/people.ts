import { z } from "zod";
import {
  checkbox,
  dateString,
  isDate,
  email,
  id,
  idList,
  optionalDateString,
  optionalEmail,
  optionalId,
  optionalInt,
  optionalPhone,
  optionalString,
  requiredString,
} from "./common";

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
export const STUDENT_STATUSES = ["ACTIVE", "GRADUATED", "TRANSFERRED", "SUSPENDED", "ARCHIVED"] as const;
export const RELATIONSHIPS = ["FATHER", "MOTHER", "GUARDIAN", "GRANDPARENT", "SIBLING", "OTHER"] as const;

const today = () => new Date();

export const studentSchema = z
  .object({
    firstName: requiredString("First name", 60),
    lastName: requiredString("Last name", 60),
    dateOfBirth: dateString("Date of birth"),
    gender: z.enum(GENDERS, { error: "Select a gender." }),
    email: optionalEmail,
    phone: optionalPhone,
    address: optionalString(300),
    emergencyContactName: optionalString(120),
    emergencyContactPhone: optionalPhone,
    admissionNumber: requiredString("Admission number", 40).regex(/^[A-Za-z0-9/_-]+$/, {
      error: "Use letters, numbers, / - or _ only.",
    }),
    studentCode: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z.string().trim().max(30).regex(/^[A-Za-z0-9_-]+$/, { error: "Use letters, numbers, - or _ only." }).nullable().optional(),
    ),
    admissionDate: dateString("Admission date"),
    sectionId: id("Class section"),
    rollNumber: optionalInt("Roll number", 1, 999),
    status: z.enum(STUDENT_STATUSES).default("ACTIVE"),
    bloodGroup: optionalString(5),
    notes: optionalString(2000),
    parentId: optionalId,
    relationship: z.enum(RELATIONSHIPS).optional().default("GUARDIAN"),
    sendInvite: checkbox.optional().default(false),
  })
  .superRefine((d, ctx) => {
    if (d.sendInvite && !d.email) ctx.addIssue({ code: "custom", path: ["email"], message: "An email is required to send a portal invitation." });
    if (!isDate(d.dateOfBirth) || !isDate(d.admissionDate)) return;
    const now = today();
    if (d.dateOfBirth >= now) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Date of birth must be in the past." });
    const age = (now.getTime() - d.dateOfBirth.getTime()) / (365.25 * 86400000);
    if (age > 30 || age < 2) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Please check the date of birth (age must be between 2 and 30)." });
    if (d.admissionDate < d.dateOfBirth) ctx.addIssue({ code: "custom", path: ["admissionDate"], message: "Admission date cannot be before date of birth." });
    const max = new Date(now.getTime() + 365 * 86400000);
    if (d.admissionDate > max) ctx.addIssue({ code: "custom", path: ["admissionDate"], message: "Admission date is too far in the future." });
  });

export type StudentInput = z.output<typeof studentSchema>;

/** Row schema for CSV import (section given by class name + section name). */
export const studentImportRowSchema = z.object({
  firstname: requiredString("First name", 60),
  lastname: requiredString("Last name", 60),
  dateofbirth: dateString("Date of birth"),
  gender: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), z.enum(GENDERS, { error: "Gender must be MALE, FEMALE or OTHER." })),
  admissionnumber: requiredString("Admission number", 40),
  admissiondate: dateString("Admission date"),
  class: requiredString("Class", 60),
  section: requiredString("Section", 10),
  rollnumber: optionalInt("Roll number", 1, 999),
  email: optionalEmail,
  phone: optionalPhone,
  address: optionalString(300),
  emergencycontactname: optionalString(120),
  emergencycontactphone: optionalPhone,
});

export const TEACHER_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

export const teacherSchema = z.object({
  firstName: requiredString("First name", 60),
  lastName: requiredString("Last name", 60),
  email,
  phone: optionalPhone,
  employeeId: requiredString("Employee ID", 30).regex(/^[A-Za-z0-9_-]+$/, { error: "Use letters, numbers, - or _ only." }),
  gender: z.preprocess((v) => (v === "" ? null : v), z.enum(GENDERS).nullable().optional()),
  dateOfBirth: optionalDateString("Date of birth"),
  address: optionalString(300),
  qualification: optionalString(200),
  specialization: optionalString(120),
  joiningDate: dateString("Joining date"),
  sendInvite: checkbox.optional().default(false),
});
export type TeacherInput = z.output<typeof teacherSchema>;

export const parentSchema = z.object({
  firstName: requiredString("First name", 60),
  lastName: requiredString("Last name", 60),
  email,
  phone: optionalPhone,
  address: optionalString(300),
  occupation: optionalString(120),
  childIds: idList,
  relationship: z.enum(RELATIONSHIPS, { error: "Select a relationship." }).default("GUARDIAN"),
  sendInvite: checkbox.optional().default(false),
});
export type ParentInput = z.output<typeof parentSchema>;

export const linkChildSchema = z.object({
  parentId: id("Parent"),
  studentId: id("Student"),
  relationship: z.enum(RELATIONSHIPS, { error: "Select a relationship." }),
  isPrimary: checkbox.optional().default(false),
});

export const teachingAssignmentSchema = z.object({
  teacherId: id("Teacher"),
  sectionId: id("Section"),
  subjectId: id("Subject"),
});
