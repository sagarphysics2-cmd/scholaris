import { z } from "zod";
import { checkbox, dateTimeString, isDate, optionalId, requiredString } from "./common";

export const NOTICE_AUDIENCES = ["SCHOOL", "CLASS", "SECTION", "TEACHERS", "STUDENTS", "PARENTS"] as const;

export const AUDIENCE_LABELS: Record<(typeof NOTICE_AUDIENCES)[number], string> = {
  SCHOOL: "Whole school",
  CLASS: "Specific class",
  SECTION: "Specific section",
  TEACHERS: "Teachers",
  STUDENTS: "Students",
  PARENTS: "Parents",
};

export const noticeSchema = z
  .object({
    title: requiredString("Title", 150),
    message: requiredString("Message", 10000),
    audience: z.enum(NOTICE_AUDIENCES, { error: "Choose an audience." }),
    classId: optionalId,
    sectionId: optionalId,
    publishDate: dateTimeString("Publish date"),
    expiryDate: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()).transform((v) => (v ? new Date(v) : null)),
    isPinned: checkbox.optional().default(false),
  })
  .superRefine((d, ctx) => {
    if (d.audience === "CLASS" && !d.classId) ctx.addIssue({ code: "custom", path: ["classId"], message: "Choose a class." });
    if (d.audience === "SECTION" && !d.sectionId) ctx.addIssue({ code: "custom", path: ["sectionId"], message: "Choose a section." });
    if (d.expiryDate && Number.isNaN(d.expiryDate.getTime())) ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "Enter a valid date." });
    else if (d.expiryDate && isDate(d.publishDate) && d.expiryDate <= d.publishDate) ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "Expiry must be after the publish date." });
  });

export type NoticeInput = z.output<typeof noticeSchema>;
