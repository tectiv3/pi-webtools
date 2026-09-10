/**
 * Classification of a fetched response into one of the supported content shapes. The declared
 * `Content-Type` header is trusted when it names a recognised MIME type; a generic label
 * (`application/octet-stream` and friends) falls back to magic-number sniffing via `file-type`.
 * A missing header defaults to HTML without sniffing.
 */

import { fileTypeFromBuffer } from "file-type"

import { UnsupportedContentTypeError } from "../errors/unsupported-content-type-error"
import { parseContentTypeSafe } from "../http"

/**
 * Supported content shapes for page classification. Each kind drives a distinct decoding and
 * extraction pipeline.
 */
export type PageKind = "html" | "text" | "json"

/**
 * Paired result of classifying a response, holding the resolved kind and the MIME type the
 * classification is based on.
 */
export interface PageClassification {
  /** Resolved page kind. */
  kind: PageKind
  /** MIME type that informed the kind (declared or sniffed). */
  mimeType: string
}

/**
 * Default MIME type applied when the response omits a `Content-Type` header entirely.
 */
const DEFAULT_MIME = "text/html"

/**
 * Generic MIME labels treated as uninformative; classification falls back to magic-number
 * sniffing for these.
 */
const GENERIC_MIME_TYPES: ReadonlySet<string> = new Set(["application/octet-stream", "binary/octet-stream"])

/**
 * Number of bytes passed to `file-type` for magic-number sniffing.
 */
const SNIFF_BYTES = 4096

/**
 * Classify a response body into a supported kind and effective MIME type, trusting the
 * declared header unless it is generic. A missing header short-circuits to HTML without
 * sniffing (text-based payloads carry no magic-number signature).
 *
 * @param bytes - Raw response body buffered in memory.
 * @param contentTypeHeader - Raw `content-type` header value, or `null` when absent.
 * @param url - Target URL carried on the resulting error for diagnostics.
 * @returns The classified kind and the MIME type the classification is based on.
 * @throws When the effective MIME type maps to no supported kind.
 */
export async function classifyPage(
  bytes: Buffer,
  contentTypeHeader: string | null,
  url: string
): Promise<PageClassification> {
  const declaredMime = parseContentTypeSafe(contentTypeHeader)?.essence

  if (declaredMime === undefined) {
    return { kind: "html", mimeType: DEFAULT_MIME }
  }

  if (!GENERIC_MIME_TYPES.has(declaredMime)) {
    return resolveKind(declaredMime, url)
  }

  const sniffed = await fileTypeFromBuffer(bytes.subarray(0, SNIFF_BYTES))

  if (sniffed !== undefined) {
    return resolveKind(sniffed.mime, url)
  }

  return { kind: "html", mimeType: declaredMime }
}

/**
 * Map a MIME type to a supported page kind, throwing when the type is outside the whitelist.
 *
 * @param mimeType - Normalised MIME type to resolve.
 * @param url - Target URL carried on the resulting error for diagnostics.
 * @returns The kind-and-MIME pair.
 * @throws When the MIME type maps to no supported kind.
 */
function resolveKind(mimeType: string, url: string): PageClassification {
  const kind = mimeToKind(mimeType)

  if (kind === undefined) {
    throw new UnsupportedContentTypeError(mimeType, url)
  }

  return { kind, mimeType }
}

/**
 * Direct MIME-to-kind matches keyed by exact MIME type. Two-token suffix/prefix rules
 * (`*+json`, `text/*`) handle the open-ended families and are applied after this lookup.
 */
const EXACT_MIME_TO_KIND = new Map<string, PageKind>([
  ["text/html", "html"],
  ["application/xhtml+xml", "html"],
  ["application/json", "json"],
  ["text/json", "json"],
])

/**
 * Map a MIME type to a supported page kind, covering the common spellings for each shape.
 *
 * @param mimeType - Lower-cased MIME type.
 * @returns The matching kind, or `undefined` when the type is not supported.
 */
function mimeToKind(mimeType: string): PageKind | undefined {
  const exact = EXACT_MIME_TO_KIND.get(mimeType)

  if (exact !== undefined) {
    return exact
  }

  if (mimeType.endsWith("+json")) {
    return "json"
  }

  if (mimeType.startsWith("text/")) {
    return "text"
  }

  return undefined
}
