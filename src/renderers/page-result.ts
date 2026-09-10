/**
 * Per-kind rendering that turns a `FetchedPage` into the `PageResult` by narrowing on the
 * fetched page's kind. HTML runs a single jsdom parse that yields both the headings and the full
 * readable content; every non-HTML kind (plain text, JSON) supplies its pre-extracted text.
 * Both kinds then route their content through the `retrieval` excerpt builder to bound it to the
 * configured budget. Built on the `parsers` extractors and the `retrieval` excerpt builder; sits a
 * layer above `fetchPage`, acquiring, parsing, then rendering.
 */

import { extractHtmlPage } from "../parsers"
import { buildExcerpt } from "../retrieval"

import type { ContentFormat } from "../config"
import type { FetchedPage } from "../page"

/**
 * Rendered result for a fetched page. Optional fields are omitted when empty to keep the
 * payload compact.
 */
export interface PageResult {
  /** URL that was visited, echoed back. */
  url: string
  /** Classified page kind. */
  kind: FetchedPage["kind"]
  /** Effective MIME type reported by the server or sniffed from the payload. */
  mimeType: string
  /** Page title when available (HTML `<title>`, or empty for non-HTML kinds). */
  title?: string
  /** First `<h1>` of an HTML page, omitted for non-HTML kinds. */
  h1?: string
  /** First `<h2>` of an HTML page, omitted for non-HTML kinds. */
  h2?: string
  /** Excerpt of the page content, truncated to the configured character budget. */
  content?: string
  /** Character count of the full extracted content before truncation or windowing. */
  contentLength?: number
}

/**
 * Options controlling how a fetched page is rendered, shared by both excerpt paths (HTML and
 * pre-extracted text).
 */
export interface PageResultOptions {
  /** Character budget for the returned excerpt. */
  contentLimit: number
  /** Optional search terms biasing content selection. */
  findInPage: string[] | undefined
  /** Output format applied to HTML content; the pre-extracted-text path ignores it. */
  contentFormat: ContentFormat
}

/**
 * Render a fetched page into its result, narrowing on the fetched page's kind to select between
 * the HTML jsdom+Readability pipeline and the pre-extracted-text pipeline.
 *
 * @param url - URL that was visited.
 * @param page - Fetched and classified page payload.
 * @param options - Options controlling excerpt selection and formatting.
 * @returns The page result with content and (for HTML) headings populated.
 */
export function renderPageResult(url: string, page: FetchedPage, options: PageResultOptions): PageResult {
  if (page.kind === "html") {
    const { headings, content } = extractHtmlPage(page.html, url, options.contentFormat)
    const excerpt = buildExcerpt(content, options.contentLimit, options.findInPage)

    return assembleResult(url, page.kind, page.mimeType, {
      title: headings.title,
      h1: headings.h1,
      h2: headings.h2,
      content: excerpt.content,
      contentLength: excerpt.totalLength,
    })
  }

  const excerpt = buildExcerpt(page.text, options.contentLimit, options.findInPage)

  return assembleResult(url, page.kind, page.mimeType, {
    title: page.title,
    content: excerpt.content,
    contentLength: excerpt.totalLength,
  })
}

/**
 * Optional fields collected for a page result before empty values are stripped.
 */
interface ResultCandidates {
  /** Candidate title; dropped when empty. */
  title?: string
  /** Candidate first-level heading; dropped when empty. */
  h1?: string
  /** Candidate second-level heading; dropped when empty. */
  h2?: string
  /** Candidate content excerpt; dropped when empty. */
  content?: string
  /** Candidate content length; dropped when zero. */
  contentLength?: number
}

/**
 * Assemble a `PageResult` from required identity fields and a set of optional candidates,
 * dropping empty strings and zero counts so the response stays compact.
 *
 * @param url - URL that was visited.
 * @param kind - Classified page kind.
 * @param mimeType - Effective MIME type.
 * @param candidates - Optional fields whose empty values should be elided.
 * @returns The page result with empty/zero fields removed.
 */
function assembleResult(
  url: string,
  kind: FetchedPage["kind"],
  mimeType: string,
  candidates: ResultCandidates
): PageResult {
  const result: PageResult = { url, kind, mimeType }

  for (const key of ["title", "h1", "h2", "content"] as const) {
    const value = candidates[key]

    if (value !== undefined && value.length > 0) {
      result[key] = value
    }
  }

  if (candidates.contentLength !== undefined && candidates.contentLength > 0) {
    result.contentLength = candidates.contentLength
  }

  return result
}
