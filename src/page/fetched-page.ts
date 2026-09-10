/**
 * Shape of a fetched page after classification and per-kind decoding/extraction.
 *
 * Modelled as a discriminated union so the HTML variant carries no stray `title` field:
 * HTML titles are derived from the document at render time, not captured at fetch time.
 */

import type { PageKind } from "./page-kind"

/**
 * HTML page variant carrying the raw HTML string, with no pre-captured title since headings
 * are parsed from the document.
 */
export interface HtmlFetchedPage {
  /** Discriminant identifying an HTML (or XHTML) payload. */
  kind: "html"
  /** Raw, unparsed HTML body. */
  html: string
  /** Effective MIME type used to classify the payload. */
  mimeType: string
}

/**
 * Non-HTML variant carrying text that has already been extracted into its final form
 * (raw text or raw JSON) along with any metadata title captured at fetch time.
 */
export interface NonHtmlFetchedPage {
  /** Discriminant identifying a non-HTML page kind. */
  kind: Exclude<PageKind, "html">
  /** Pre-extracted text payload in its final form. */
  text: string
  /** Effective MIME type used to classify the payload. */
  mimeType: string
  /** Document-level title when the source format exposes one; empty for text and JSON today. */
  title: string
}

/**
 * Discriminated union of the two fetched-page shapes. Consumers narrow via `page.kind`.
 */
export type FetchedPage = HtmlFetchedPage | NonHtmlFetchedPage
