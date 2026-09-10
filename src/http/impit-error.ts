/**
 * Handling of transport failures thrown by the `impit` client. `classifyImpitError` maps a thrown
 * value onto a concise, user-facing summary and a retry-eligibility flag using `impit`'s exported
 * error-class hierarchy rather than parsing error text; `wrapImpitError` builds the `FetchError`
 * that callers ultimately throw. Both leave the raw message and diagnostic detail intact for
 * values that are not `impit` errors.
 */

import {
  ConnectError,
  DecodingError,
  ImpitError,
  NetworkError,
  ProtocolError,
  TimeoutError,
  TransportError,
  UnsupportedProtocol,
} from "impit"

import { errorMessage } from "../errors"

import { FetchError } from "./fetch-error"

/**
 * Concise summary and retry hint derived from an `impit` error's class.
 */
export interface ImpitErrorClassification {
  /** Short, user-facing description of the failure. */
  summary: string

  /** Whether the failure is transient and therefore worth retrying. */
  retryable: boolean
}

/**
 * Classify a thrown value as an `impit` transport failure, mapping its error class onto a concise
 * summary and a retry-eligibility flag. Subclasses are tested before the base classes they extend
 * (`ConnectError` before `NetworkError`, the leaf transport classes before `TransportError`) so the
 * most specific summary wins. Transient failures are flagged retryable; deterministic ones (a
 * malformed response, a decode failure, an unsupported scheme) are not.
 *
 * @param error - Thrown value caught from a call into the `impit` client.
 * @returns The classification, or `undefined` when the value is not an `impit` error.
 */
export function classifyImpitError(error: unknown): ImpitErrorClassification | undefined {
  if (error instanceof TimeoutError) {
    return { summary: "request timed out", retryable: true }
  }

  if (error instanceof ConnectError) {
    return { summary: "could not connect to server", retryable: true }
  }

  if (error instanceof NetworkError) {
    return { summary: "connection failed before the response completed", retryable: true }
  }

  if (error instanceof ProtocolError) {
    return { summary: "server returned a malformed HTTP response", retryable: false }
  }

  if (error instanceof DecodingError) {
    return { summary: "could not decode the server response", retryable: false }
  }

  if (error instanceof UnsupportedProtocol) {
    return { summary: "unsupported URL scheme", retryable: false }
  }

  if (error instanceof TransportError) {
    return { summary: "transport error", retryable: true }
  }

  if (error instanceof ImpitError) {
    return { summary: "an unexpected transport error occurred", retryable: false }
  }

  return undefined
}

/**
 * Wrap a transport failure thrown by `impit.fetch` into a `FetchError`. The message and retry hint
 * come from `classifyImpitError`; a recognised `impit` error contributes a concise summary and the
 * cryptic original is dropped from `cause`, while an unrecognised value falls back to its raw
 * message and keeps the original as `cause`. Abort and timeout errors are not the concern of this
 * function and should be discriminated by the caller before delegating here.
 *
 * @param error - Thrown value caught from the `impit.fetch` call.
 * @param url - URL fetched when the failure occurred, attached to the resulting error.
 * @returns A `FetchError` describing the transport failure.
 */
export function wrapImpitError(error: unknown, url: string): FetchError {
  const classification = classifyImpitError(error)
  const message = classification?.summary ?? errorMessage(error)
  const cause = classification === undefined ? error : undefined

  return new FetchError(`Request failed: ${message}`, undefined, url, {
    cause,
    retryable: classification?.retryable,
  })
}
