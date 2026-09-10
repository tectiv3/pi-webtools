/**
 * `p-retry` type alias, retry predicate, status-line observer factory, and the shared
 * `withFetchRetry` wrapper.
 */

import pRetry from "p-retry"

import { FetchError } from "./fetch-error"

import type { Options as PRetryOptions, RetryContext } from "p-retry"

/**
 * Subset of `p-retry` options populated from plugin configuration.
 */
export type RetryOptions = Pick<PRetryOptions, "retries" | "factor" | "minTimeout" | "maxTimeout" | "randomize">

/**
 * HTTP status codes that should trigger a retry when returned by the server.
 */
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

/**
 * Conversion factor from milliseconds to seconds, used when rendering retry delays.
 */
const MS_PER_SECOND = 1000

/**
 * Determine whether a thrown value represents a transient fetch failure that warrants another attempt.
 *
 * @param error - Thrown value caught from a request attempt.
 * @returns `true` when the error is a `FetchError` with either a network-level cause or a retryable HTTP status.
 */
export function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof FetchError)) {
    return false
  }

  if (error.retryable !== undefined) {
    return error.retryable
  }

  if (error.statusCode === undefined) {
    return true
  }

  return RETRYABLE_STATUS_CODES.has(error.statusCode)
}

/**
 * Build an `onFailedAttempt` callback that reports the upcoming retry attempt to a tool status line.
 *
 * The notifier guards on `retriesLeft` to stay quiet when no further attempt will be made,
 * since `p-retry` invokes `onFailedAttempt` on every failure including the terminal one.
 * Announcing a retry that never happens would otherwise mislead the reader.
 *
 * @param status - Status-line callback supplied by the SDK tool context.
 * @param label - Phase name interpolated into the status message, e.g. `"website fetch"`.
 * @returns A `p-retry` `onFailedAttempt` callback bound to the given status line and phase label.
 */
export function createRetryNotifier(
  status: (message: string) => void,
  label: string
): NonNullable<PRetryOptions["onFailedAttempt"]> {
  /**
   * Render the retry message for the next attempt.
   *
   * @param context - Retry context supplied by `p-retry`.
   */
  return ({ attemptNumber, retriesLeft, retryDelay }: RetryContext): void => {
    if (retriesLeft <= 0) return

    status(`Retrying ${label} (attempt ${attemptNumber + 1}) in ${Math.round(retryDelay / MS_PER_SECOND)}s...`)
  }
}

/**
 * Options shared by every retry-wrapped fetch helper.
 */
export interface FetchRetryOptions {
  /** Signal used to abort the in-flight request. Forwarded to `p-retry` as the cancellation source. */
  signal: AbortSignal
  /** Retry policy applied to the request; when omitted, the call is attempted exactly once. */
  retry?: RetryOptions
  /** Observer invoked after each failed attempt, before the backoff sleep. */
  onFailedAttempt?: PRetryOptions["onFailedAttempt"]
}

/**
 * Wrap an async fetch task with the shared retry policy, a single initial attempt by default,
 * extended via the caller's `retry` options, with retries gated on `isRetryableFetchError` so
 * non-transient failures fail fast.
 *
 * @param task - Fetch task to run; invoked once per attempt.
 * @param options - Cancellation, retry policy, and observer hook.
 * @returns The task's resolved value.
 */
export async function withFetchRetry<T>(task: () => Promise<T>, options: FetchRetryOptions): Promise<T> {
  return pRetry(task, {
    retries: 0,
    ...options.retry,
    signal: options.signal,

    /**
     * Gate retries on the `FetchError.statusCode` allowlist so non-transient failures fail fast.
     *
     * @param context - Retry context supplied by `p-retry`; only `error` is consulted.
     * @returns `true` when the error is a transient fetch failure that warrants another attempt.
     */
    shouldRetry: ({ error }) => isRetryableFetchError(error),
    onFailedAttempt: options.onFailedAttempt,
  })
}
