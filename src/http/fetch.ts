/**
 * Shared `impit` GET helper that throws on non-2xx responses and retries transient failures via `p-retry`.
 */

import { withFetchRetry } from "./fetch-retry"
import { followRedirects } from "./redirects"

import type { FetchRetryOptions } from "./fetch-retry"
import type { Impit, ImpitResponse } from "impit"

/**
 * Default wall-clock ceiling applied to each request attempt, in milliseconds. The timeout covers
 * the entire redirect chain of a single attempt; a fresh budget is granted on each retry. Without
 * it a stalled or slow-loris server would hold the request open until the caller's own signal
 * (if any) aborted.
 */
const REQUEST_TIMEOUT_MS = 20_000

/**
 * Minimal limiter surface awaited before each outbound request. Satisfied by the shared
 * `RateLimiter`, which ignores the URL argument.
 */
export interface RequestLimiter {
  /** Resolves once the caller is cleared to issue a request toward `url`. */
  wait: (url: string) => Promise<void>
}

/**
 * Options passed to every outbound request, primarily to support cancellation and retries.
 */
export interface RequestOptions extends FetchRetryOptions {
  /** Extra request headers layered onto the `impit` browser-impersonation defaults. */
  headers?: Record<string, string>

  /** Wall-clock ceiling per request attempt, in milliseconds. Defaults to 20 seconds. */
  timeoutMs?: number

  /**
   * Limiter awaited once before the outbound request runs (before the retry wrapper). Callers
   * that gate behind a cache (e.g. `fetchPage`) only pay this cost on a cache miss because they
   * only invoke `fetchOrThrow` on miss.
   */
  limiter?: RequestLimiter
}

/**
 * Issue a GET request through the shared `impit` client, throwing `FetchError` on failure or non-2xx.
 *
 * @param impit - Shared HTTP client used for the request.
 * @param url - Target URL to fetch.
 * @param options - Options controlling the outbound request.
 * @returns The successful response.
 * @throws When the transport fails or the response carries a non-2xx status.
 */
export async function fetchOrThrow(impit: Impit, url: string, options: RequestOptions): Promise<ImpitResponse> {
  await options.limiter?.wait(url)

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS

  return withFetchRetry(async () => {
    const fetchSignal = AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])

    return followRedirects(impit, url, {
      signal: options.signal,
      fetchSignal,
      timeoutMessage: `Request timed out after ${timeoutMs}ms`,
      headers: options.headers,
    })
  }, options)
}
