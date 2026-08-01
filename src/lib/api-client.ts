"use client";

/** Tiny fetch wrapper for the JSON API. Client components only. */

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail: ApiError,
  ) {
    super(detail.message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail: ApiError = payload?.error ?? {
      code: "internal_error",
      message: "Something went wrong.",
    };
    throw new ApiRequestError(response.status, detail);
  }
  return payload as T;
}

export const api = {
  get: <T,>(path: string) => request<T>("GET", path),
  post: <T,>(path: string, body?: unknown) => request<T>("POST", path, body),
  del: <T,>(path: string) => request<T>("DELETE", path),
};
