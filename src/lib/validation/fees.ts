import { z } from "zod";
import { dateString, id, idList, isNum, money, optionalId, optionalString, requiredString } from "./common";

export const FEE_CATEGORY_TYPES = ["TUITION", "TRANSPORT", "EXAMINATION", "LIBRARY", "ACTIVITY", "OTHER"] as const;
export const PAYMENT_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "CHEQUE", "ONLINE"] as const;

export const feeCategorySchema = z.object({
  name: requiredString("Name", 80),
  type: z.enum(FEE_CATEGORY_TYPES, { error: "Choose a type." }),
  description: optionalString(300),
  defaultAmount: z.preprocess((v) => (v === "" ? undefined : v), money("Default amount").optional()),
});

export const assignFeeSchema = z
  .object({
    categoryId: id("Category"),
    title: requiredString("Title", 120),
    amount: money("Amount").refine((n) => n > 0, { error: "Amount must be greater than zero." }),
    discount: z.preprocess((v) => (v === "" ? 0 : v), money("Discount")),
    dueDate: dateString("Due date"),
    target: z.enum(["CLASS", "SECTION", "STUDENTS"]),
    classId: optionalId,
    sectionId: optionalId,
    studentIds: idList,
    notes: optionalString(500),
  })
  .superRefine((d, ctx) => {
    if (isNum(d.discount) && isNum(d.amount) && d.discount > d.amount) ctx.addIssue({ code: "custom", path: ["discount"], message: "Discount cannot exceed the amount." });
    if (d.target === "CLASS" && !d.classId) ctx.addIssue({ code: "custom", path: ["classId"], message: "Choose a class." });
    if (d.target === "SECTION" && !d.sectionId) ctx.addIssue({ code: "custom", path: ["sectionId"], message: "Choose a section." });
    if (d.target === "STUDENTS" && d.studentIds.length === 0) ctx.addIssue({ code: "custom", path: ["studentIds"], message: "Choose at least one student." });
  });

export const editFeeSchema = z
  .object({
    title: requiredString("Title", 120),
    amount: money("Amount"),
    discount: z.preprocess((v) => (v === "" ? 0 : v), money("Discount")),
    dueDate: dateString("Due date"),
    notes: optionalString(500),
  })
  .refine((d) => !isNum(d.discount) || !isNum(d.amount) || d.discount <= d.amount, { error: "Discount cannot exceed the amount.", path: ["discount"] });

export const paymentSchema = z.object({
  amount: money("Amount").refine((n) => n > 0, { error: "Amount must be greater than zero." }),
  method: z.enum(PAYMENT_METHODS, { error: "Choose a payment method." }),
  reference: optionalString(80),
  paidAt: dateString("Payment date"),
  notes: optionalString(300),
});
