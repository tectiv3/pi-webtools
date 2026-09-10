/**
 * Cache-key helpers for search-result caching.
 */

import type { SafeSearch } from "../search"

/**
 * Build the cache key for a web-search result lookup or insertion. The result cap is part of
 * the key because the stored payload is sliced to it, so a raised cap re-fetches instead of
 * serving the smaller slice.
 *
 * @param query - Search query string.
 * @param safeSearch - Safe-search mode that produced the entry.
 * @param page - One-based page number of the entry.
 * @param maxResults - Result cap the stored payload was sliced to; `Infinity` when uncapped.
 * @returns Canonical cache key for the given parameters.
 */
export function webSearchCacheKey(
  query: string,
  safeSearch: SafeSearch,
  page: number,
  maxResults: number
): string {
  return `web:${query}:${safeSearch}:${page}:${maxResults}`
}
