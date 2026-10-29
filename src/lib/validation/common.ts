import { z } from "zod";

/**
 * Reusable field schemas. Forms submit strings; these coerce and normalise them so the
 * same schema validates on the client (instant feedback) and on the server (enforcement).
 * Empty optional inputs become `null` so that clearing a field on an edit form works.
 */

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const requiredString = (label: string, max = 120) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(max, { error: `${label} must be at most ${max} characters.` });

export const optionalString = (max = 500) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, { error: `Must be at most ${max} characters.` }).nullable().optional());

export const email = z
  .string({ error: "Email is required." })
  .trim()
  .toLowerCase()
  .min(1, { error: "Email is required." })
  .max(254)
  .pipe(z.email({ error: "Enter a valid email address." }));

export const optionalEmail = z.preprocess(
  emptyToNull,
  z.string().trim().toLowerCase().max(254).pipe(z.email({ error: "Enter a valid email address." })).nullable().optional(),
);

// Accepts international formats: +44 20 7946 0958, (555) 123-4567, 9876543210 …
const PHONE_RE = /^\+?[0-9(][0-9\s\-().]{5,18}[0-9]$/;
export const phone = z.string().trim().regex(PHONE_RE, { error: "Enter a valid phone number." });
export const optionalPhone = z.preprocess(emptyToNull, phone.nullable().optional());

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string) {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** "YYYY-MM-DD" → Date at UTC midnight (matches @db.Date columns). */
export const dateString = (label = "Date") =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, { error: `${label} is required.` })
    .regex(DATE_RE, { error: `${label} must be a valid date.` })
    .refine(isRealDate, { error: `${label} must be a valid date.` })
    .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const optionalDateString = (label = "Date") => z.preprocess(emptyToNull, dateString(label).nullable().optional());

/** "YYYY-MM-DDTHH:mm" (datetime-local) → Date. */
export const dateTimeString = (label = "Date") =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, { error: `${label} is required.` })
    .refine((s) => !Number.isNaN(new Date(s).getTime()), { error: `${label} must be a valid date and time.` })
    .transform((s) => new Date(s));

export const time = (label = "Time") =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: `${label} must be in HH:MM format.` });

export const optionalTime = (label = "Time") => z.preprocess(emptyToNull, time(label).nullable().optional());

const toNumberOrEmpty = (v: unknown) => {
  if (typeof v === "string") {
    const t = v.trim().replace(/,/g, "");
    return t === "" ? undefined : Number(t);
  }
  return v === null ? undefined : v;
};

const numberError = (label: string) => ({
  error: (issue: { input?: unknown }) =>
    issue.input === undefined ? `${label} is required.` : `${label} must be a number.`,
});

export const intField = (label: string, min = 0, max = 1_000_000) =>
  z.preprocess(
    toNumberOrEmpty,
    z
      .number(numberError(label))
      .int({ error: `${label} must be a whole number.` })
      .min(min, { error: `${label} must be at least ${min}.` })
      .max(max, { error: `${label} must be at most ${max}.` }),
  );

export const optionalInt = (label: string, min = 0, max = 1_000_000) =>
  z.preprocess(
    (v) => toNumberOrEmpty(v) ?? null,
    z
      .number(numberError(label))
      .int({ error: `${label} must be a whole number.` })
      .min(min, { error: `${label} must be at least ${min}.` })
      .max(max, { error: `${label} must be at most ${max}.` })
      .nullable(),
  );

/** Decimal number such as marks (up to 2 decimals). */
export const decimalField = (label: string, min = 0, max = 1_000_000) =>
  z.preprocess(
    toNumberOrEmpty,
    z
      .number(numberError(label))
      .min(min, { error: `${label} cannot be less than ${min}.` })
      .max(max, { error: `${label} cannot exceed ${max}.` })
      .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, {
        error: `${label} can have at most 2 decimal places.`,
      }),
  );

/** Non-negative money amount with at most 2 decimals. */
export const money = (label = "Amount") =>
  z.preprocess(
    toNumberOrEmpty,
    z
      .number(numberError(label))
      .min(0, { error: `${label} cannot be negative.` })
      .max(10_000_000, { error: `${label} is too large.` })
      .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, {
        error: `${label} can have at most 2 decimal places.`,
      }),
  );

export const id = (label = "Selection") => z.string({ error: `${label} is required.` }).trim().min(1, { error: `${label} is required.` }).max(64);
export const optionalId = z.preprocess(emptyToNull, z.string().trim().max(64).nullable().optional());

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const idList = z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []),
  z.array(z.string().min(1).max(64)).max(500),
);

/** Strong-enough password policy for school accounts. */
export const password = z
  .string({ error: "Password is required." })
  .min(10, { error: "Password must be at least 10 characters." })
  .max(128, { error: "Password must be at most 128 characters." })
  .regex(/[a-z]/, { error: "Password must contain a lowercase letter." })
  .regex(/[A-Z]/, { error: "Password must contain an uppercase letter." })
  .regex(/[0-9]/, { error: "Password must contain a number." });

/**
 * Zod 4 runs object-level refinements even when a field already failed, so cross-field
 * checks must confirm their inputs were parsed before comparing them.
 */
export const isDate = (v: unknown): v is Date => v instanceof Date && !Number.isNaN(v.getTime());
export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
