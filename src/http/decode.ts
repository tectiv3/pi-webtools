/**
 * Charset-aware byte-to-string decoding for response bodies decoded after the body has been
 * buffered, rather than at read time.
 */

import { parseContentTypeSafe } from "./parse-content-type"

/**
 * Decode a response body buffer to a string, honouring the `charset` advertised on the
 * `content-type` header when it names a WHATWG encoding label. Falls back to UTF-8 so
 * exotic or missing encodings cannot wedge the caller; invalid byte sequences decode to
 * U+FFFD rather than throwing.
 *
 * @param buffer - Raw response bytes.
 * @param contentType - Raw `content-type` header value, or `null` when absent.
 * @returns The decoded body as a string.
 */
export function decodeBytes(buffer: Buffer, contentType: string | null): string {
  return resolveDecoder(contentType).decode(buffer)
}

/**
 * Resolve the decoder for the declared charset, falling back to UTF-8 when the charset is
 * missing or not a recognised WHATWG encoding label.
 *
 * @param contentType - Raw `content-type` header value, or `null` when absent.
 * @returns A decoder for the effective charset.
 */
function resolveDecoder(contentType: string | null): TextDecoder {
  const charset = parseContentTypeSafe(contentType)?.params.get("charset")

  if (charset === undefined || charset === null) return new TextDecoder()

  try {
    return new TextDecoder(charset)
  } catch {
    return new TextDecoder()
  }
}
