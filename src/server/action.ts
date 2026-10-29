import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { parseWith, type FieldErrors } from "@/lib/validation/form";
import { AppError, ValidationError, fromDatabaseError } from "./errors";

/** Shape returned by every server action to `useActionState`. */
export type ActionState<T = unknown> = {
  ok: boolean;
  message?: string;
  fieldErrors?: FieldErrors;
  data?: T;
  redirectTo?: string;
  /** Changes on every response so clients can react to repeated identical results. */
  ts: number;
} | null;

/** Validates input with a Zod schema or throws a ValidationError carrying field errors. */
export function parseInput<S extends z.ZodType>(schema: S, input: FormData | Record<string, unknown>): z.output<S> {
  const res = parseWith(schema, input);
  if (!res.success) throw new ValidationError(undefined, res.fieldErrors);
  return res.data;
}

/**
 * Wraps a server action: converts known errors into safe messages and logs unknown ones
 * without leaking internals (stack traces, SQL) to the browser.
 */
export async function runAction<T>(
  fn: () => Promise<Omit<NonNullable<ActionState<T>>, "ts">>,
): Promise<ActionState<T>> {
  try {
    return { ...(await fn()), ts: Date.now() };
  } catch (err) {
    unstable_rethrow(err); // let Next.js redirects / notFound propagate
    const known = err instanceof AppError ? err : fromDatabaseError(err);
    if (known) {
      return { ok: false, message: known.message, fieldErrors: known.fieldErrors, ts: Date.now() };
    }
    console.error("[action] unexpected error", err);
    return { ok: false, message: "Something went wrong on our side. Please try again.", ts: Date.now() };
  }
}
