import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, ValidationError, isAppError } from "./errors";

/**
 * The single place where domain errors become HTTP responses.
 *
 * Anything that is not an AppError is logged and reported as a generic 500,
 * so internal messages (SQL text, stack traces) never reach a client.
 */

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string[]> };
}

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof ZodError) {
    const validation = fromZodError(err);
    return NextResponse.json(
      { error: { code: validation.code, message: validation.message, fields: validation.fields } },
      { status: validation.status },
    );
  }

  if (isAppError(err)) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, fields: err.fields } },
      { status: err.status },
    );
  }

  console.error("Unhandled error in route handler:", err);
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

/** Wrap a route handler so thrown domain errors become proper responses. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function fromZodError(err: ZodError): AppError {
  const fields: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  return new ValidationError("Please correct the highlighted fields.", fields);
}

/** Parse a JSON request body against a schema, throwing ValidationError on failure. */
export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw fromZodError(result.error);
  return result.data;
}

/** Parse URL search params against a schema. */
export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) throw fromZodError(result.error);
  return result.data;
}

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}
