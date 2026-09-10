/**
 * Domain shape of a single DuckDuckGo web-search result. The parser populates the required
 * fields; the optional metadata fields carry output merged in by the web-search enrichment
 * pass and are absent for non-HTML pages or failed extractions.
 */
export interface WebSearchResult {
  /** Human-readable title rendered by DuckDuckGo for the result link. */
  title: string
  /** Destination URL of the result link. */
  url: string
  /** Preview snippet extracted from the DuckDuckGo result block; omitted from the wire shape when snippets are disabled in plugin config. */
  snippet?: string
  /** ISO 8601 page date: the most recent of `article:modified_time` or `article:published_time` per metascraper, when the page exposed one. */
  date?: string
  /** OpenGraph `og:type` value (for example `article`, `website`), when the page declared one. */
  type?: string
  /** Short page description from OpenGraph, standard meta, or JSON-LD, when the page exposed one. */
  description?: string
}
