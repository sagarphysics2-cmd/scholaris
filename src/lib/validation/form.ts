import type { z } from "zod";

/**
 * Converts FormData into a plain object. Repeated keys (multi-selects, checkboxes with
 * the same name) and keys ending in "[]" become arrays. File inputs are skipped — they
 * are read separately by the upload service.
 */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of fd.entries()) {
    if (typeof value !== "string") continue;
    if (rawKey.startsWith("$ACTION")) continue; // React internals
    const isArray = rawKey.endsWith("[]");
    const key = isArray ? rawKey.slice(0, -2) : rawKey;
    if (isArray) {
      out[key] = [...((out[key] as string[]) ?? []), value];
    } else if (key in out) {
      const prev = out[key];
      out[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

export type FieldErrors = Record<string, string[]>;

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export type ParseResult<T> = { success: true; data: T } | { success: false; fieldErrors: FieldErrors };

export function parseWith<S extends z.ZodType>(schema: S, input: FormData | Record<string, unknown>): ParseResult<z.output<S>> {
  const obj = input instanceof FormData ? formToObject(input) : input;
  const res = schema.safeParse(obj);
  if (res.success) return { success: true, data: res.data };
  return { success: false, fieldErrors: zodFieldErrors(res.error) };
}
