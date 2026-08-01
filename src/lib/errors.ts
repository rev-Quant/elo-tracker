/**
 * Domain error taxonomy.
 *
 * Services throw these; the HTTP layer maps them to status codes in exactly
 * one place (src/lib/http.ts). Anything that is NOT an AppError is treated as
 * an unexpected 500 and its message is never shown to the user.
 */

export type ErrorCode =
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited";

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  /** Field-level detail for form rendering, keyed by input name. */
  readonly fields?: Record<string, string[]>;

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export class ValidationError extends AppError {
  constructor(message = "That input isn't valid.", fields?: Record<string, string[]>) {
    super("validation_failed", 400, message, fields);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You must be signed in to do that.") {
    super("unauthorized", 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.") {
    super("forbidden", 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super("not_found", 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "That conflicts with something that already exists.") {
    super("conflict", 409, message);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
