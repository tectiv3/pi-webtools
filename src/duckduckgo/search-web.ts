/**
 * DuckDuckGo web-search entry point.
 */

import { fetchOrThrow } from "../http"

import { buildWebSearchUrl } from "./build-urls"
import { parseDuckDuckGoResults } from "./parse-results"

import type { RequestOptions } from "../http"
import type { SearchParameters } from "./build-urls"
import type { WebSearchResult } from "./web-search-result"
import type { Impit } from "impit"

/**
 * Perform a DuckDuckGo web search and return the parsed result records.
 *
 * @param impit - Shared HTTP client used for the request.
 * @param parameters - Query and pagination parameters for the search.
 * @param maxResults - Upper bound on the number of parsed results returned; `Infinity` for no cap.
 * @param options - Options controlling the outbound request.
 * @returns The parsed search results, ready for enrichment.
 */
export async function searchWeb(
  impit: Impit,
  parameters: SearchParameters,
  maxResults: number,
  options: RequestOptions
): Promise<WebSearchResult[]> {
  const url = buildWebSearchUrl(parameters).toString()
  const response = await fetchOrThrow(impit, url, options)
  const html = await response.text()

  return parseDuckDuckGoResults(html, maxResults)
}
