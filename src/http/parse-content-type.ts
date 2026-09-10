/**
 * Defensive wrapper around the WHATWG `MIMEType` parser that absorbs the `null`/malformed cases.
 */

import { MIMEType } from "node:util"

/**
 * Parse a `Content-Type` header value, returning the structured `MIMEType` or `undefined`
 * when the header is absent or malformed.
 *
 * @param header - Raw header value, or `null` when absent.
 * @returns The parsed MIME type, or `undefined` when the header cannot be parsed.
 */
export function parseContentTypeSafe(header: string | null): MIMEType | undefined {
  if (header === null) return undefined

  try {
    return new MIMEType(header)
  } catch {
    return undefined
  }
}
