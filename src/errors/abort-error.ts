/**
 * Detection of abort-signal cancellation among thrown values. Lives outside `tool-error.ts`
 * so the latter stays narrowly scoped to user-facing tool-error formatting.
 */

/**
 * Determine whether a thrown value represents an explicit abort (user cancellation), surfaced as a
 * DOM `AbortError`. A timeout elapsing is a distinct DOM `TimeoutError`; see `isTimeoutError`.
 *
 * @param error - Thrown value to inspect.
 * @returns `true` when the value is a DOM abort error.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

/**
 * Determine whether a thrown value represents an `AbortSignal.timeout` elapsing, which the platform
 * surfaces as a DOM `TimeoutError` rather than an `AbortError`.
 *
 * @param error - Thrown value to inspect.
 * @returns `true` when the value is a DOM timeout error.
 */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TimeoutError"
}
