/**
 * User-facing error formatting for tool invocations.
 */

import { FetchError } from "../http/fetch-error"

import { isAbortError } from "./abort-error"
import { errorMessage } from "./error-message"
import { NoResultsError } from "./no-results-error"
import { UnsupportedContentTypeError } from "./unsupported-content-type-error"

/**
 * Kinds of tool flows supported by `formatToolError`, used to tailor user-facing messages.
 */
type ToolErrorKind = "web-search" | "website"

/**
 * Tool-kind-specific message templates used by `formatToolError`.
 */
interface ToolErrorTemplates {
  /** Message returned when the caller aborts the flow. */
  aborted: string
  /** Prefix applied to `FetchError` response messages. */
  fetchPrefix: string
}

/**
 * Static mapping from tool kind to its user-facing message templates.
 */
const TOOL_ERROR_TEMPLATES: Record<ToolErrorKind, ToolErrorTemplates> = {
  "web-search": {
    aborted: "Web search aborted by user.",
    fetchPrefix: "Failed to fetch web search results",
  },
  website: {
    aborted: "Website visit aborted by user.",
    fetchPrefix: "Failed to fetch website",
  },
}

/**
 * Map a tool error to a user-facing string.
 *
 * @param error - Error caught during tool execution.
 * @param kind - Tool flow the error originated from, controlling message phrasing.
 * @returns A user-facing error string.
 */
export function formatToolError(error: unknown, kind: ToolErrorKind): string {
  const templates = TOOL_ERROR_TEMPLATES[kind]

  if (isAbortError(error)) {
    return templates.aborted
  }

  if (error instanceof NoResultsError) {
    return error.message
  }

  if (error instanceof UnsupportedContentTypeError) {
    return formatUnsupportedContentType(error, kind)
  }

  if (error instanceof FetchError) {
    return `Error: ${formatFetchError(error, templates.fetchPrefix)}`
  }

  return `Error: ${errorMessage(error)}`
}

/**
 * Render an `UnsupportedContentTypeError` into a tool-specific user-facing message, naming
 * the detected MIME type. Only the tool flow that actually fetches a remote page can
 * surface this error; the search flow never reaches a page classifier, so it is handled
 * by a defensive fallback that preserves diagnostic fidelity if that invariant is ever
 * broken.
 *
 * @param error - The unsupported-content-type error to render.
 * @param kind - Tool flow the error originated from, controlling message phrasing.
 * @returns The formatted user-facing error string.
 */
function formatUnsupportedContentType(error: UnsupportedContentTypeError, kind: ToolErrorKind): string {
  if (kind === "website") {
    return `Error: Cannot read ${error.mimeType} content — this tool can only handle HTML, plain text, and JSON pages.`
  }

  return `Error: Unexpected unsupported-content-type error during ${kind}: ${error.mimeType}.`
}

/**
 * Render a `FetchError` into a single user-facing line built from its structured fields.
 *
 * @param error - The fetch error to render.
 * @param prefix - Tool-kind prefix applied to the line.
 * @returns The formatted line, including status, URL, and any cause.
 */
function formatFetchError(error: FetchError, prefix: string): string {
  const segments: string[] = [`${prefix}: ${error.message}`]

  if (error.url !== undefined) {
    segments.push(`— ${error.url}`)
  }

  return appendCause(segments.join(" "), error.cause)
}

/**
 * Append a `(cause: …)` suffix when a distinct underlying cause message is available.
 *
 * @param line - Base message line.
 * @param cause - Underlying error attached to the outer error, if any.
 * @returns The line with a cause suffix appended when the cause adds new information.
 */
function appendCause(line: string, cause: unknown): string {
  if (!(cause instanceof Error)) {
    return line
  }

  if (cause.message === "" || line.includes(cause.message)) {
    return line
  }

  return `${line} (cause: ${cause.message})`
}
