// client.ts — the one place in the frontend that calls fetch().
//
// Every hook in src/api/*.ts goes through `apiGet` / `apiPost`, so error handling,
// JSON parsing and (later) headers such as a confirm token live in exactly one file.
//
// Types come from schema.d.ts, which is GENERATED from the .NET OpenAPI document
// (`pnpm gen:api`). Never edit schema.d.ts by hand: change the C# record, regenerate.

import type { components } from './schema'

/** Shorthand: `Schema<'PingResponse'>` is the TS type of the C# PingResponse record. */
export type Schema<T extends keyof components['schemas']> = components['schemas'][T]

/**
 * Shape of an RFC 7807 "problem details" body — what ASP.NET Core returns for every
 * error thanks to AddProblemDetails() in Program.cs. Thrown as ApiError below.
 */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  traceId?: string
  /** Validation errors: { "loginName": ["The loginName field is required."] } */
  errors?: Record<string, string[]>
}

/** Error thrown for any non-2xx response; carries the parsed ProblemDetails when present. */
export class ApiError extends Error {
  // Fields declared explicitly (not as constructor "parameter properties") because the
  // template enables TypeScript's `erasableSyntaxOnly`: only syntax that can be stripped
  // without emitting code is allowed, which keeps the TS → JS step a pure type erasure.
  readonly status: number
  readonly problem: ProblemDetails | undefined

  constructor(status: number, problem: ProblemDetails | undefined) {
    super(problem?.title ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

/** Internal: performs the request, parses JSON, converts failures into ApiError. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })

  if (!response.ok) {
    // ASP.NET Core sends application/problem+json; if the body isn't JSON we still fail cleanly.
    const problem = (await response.json().catch(() => undefined)) as ProblemDetails | undefined
    throw new ApiError(response.status, problem)
  }

  // 204 No Content has no body to parse.
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** GET a JSON resource. Relative URLs work in dev (Vite proxy) and prod (same origin). */
export function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  return request<T>(url, { signal })
}

/** POST a JSON body and receive JSON back. */
export function apiPost<TResponse, TBody = unknown>(
  url: string,
  body: TBody,
  signal?: AbortSignal,
): Promise<TResponse> {
  return request<TResponse>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}
