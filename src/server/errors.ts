/**
 * Typed application errors. Services throw these; `runAction` / API handlers translate
 * them into safe, user-friendly responses. Anything else is treated as an internal error
 * and its details are never shown to users.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Please correct the highlighted fields.", fieldErrors?: Record<string, string[]>) {
    super(message, 422, "VALIDATION_ERROR", fieldErrors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Record") {
    super(`${entity} not found.`, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message, 409, "CONFLICT", fieldErrors);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many attempts. Please wait a moment and try again.") {
    super(message, 429, "RATE_LIMITED");
  }
}

type PrismaLikeError = { code?: string; meta?: { target?: unknown; constraint?: unknown; driverAdapterError?: unknown } };

/** Human labels for unique constraints, keyed by a column fragment. */
const UNIQUE_MESSAGES: Array<[string, string, string]> = [
  ["email", "email", "This email address is already in use."],
  ["admission_number", "admissionNumber", "This admission number is already in use."],
  ["admissionNumber", "admissionNumber", "This admission number is already in use."],
  ["student_code", "studentCode", "This student ID is already in use."],
  ["studentCode", "studentCode", "This student ID is already in use."],
  ["employee_id", "employeeId", "This employee ID is already in use."],
  ["employeeId", "employeeId", "This employee ID is already in use."],
  ["roll_number", "rollNumber", "This roll number is already taken in the section."],
  ["rollNumber", "rollNumber", "This roll number is already taken in the section."],
  ["code", "code", "This code is already in use."],
  ["name", "name", "A record with this name already exists."],
];

/** Converts known database errors into AppErrors; returns null for unknown errors. */
export function fromDatabaseError(err: unknown): AppError | null {
  const e = err as PrismaLikeError;
  if (!e || typeof e !== "object" || typeof e.code !== "string") return null;
  if (e.code === "P2002") {
    const target = JSON.stringify(e.meta ?? {});
    for (const [fragment, field, message] of UNIQUE_MESSAGES) {
      if (target.includes(fragment)) return new ConflictError(message, { [field]: [message] });
    }
    return new ConflictError("A record with these details already exists.");
  }
  if (e.code === "P2025") return new NotFoundError();
  if (e.code === "P2003") return new ConflictError("This record is linked to other data and cannot be changed this way.");
  if (e.code === "P2004" || e.code === "P2011") return new ValidationError("The data provided violates a validation rule.");
  return null;
}
