import { notFound, redirect } from "next/navigation";
import { ForbiddenError, NotFoundError } from "./errors";

/**
 * For Server Component pages: turns service authorization errors into the proper pages —
 * NotFoundError → 404 (never reveals that another family's record exists),
 * ForbiddenError → /forbidden. Anything else bubbles to the error boundary.
 */
export async function load<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError) redirect("/forbidden");
    throw err;
  }
}
