/**
 * Shared runtime state for the webtools extension: HTTP client, rate limiter, disk caches,
 * and retry policy. Replaces the original `tools-provider.ts` construction, minus the
 * enrichment/image-only pieces (metascraper, per-host limiter, image concurrency limiter).
 */

import path from "node:path"

import { TTLCache } from "./cache"
import { createImpit } from "./http"
import { RateLimiter } from "./timing"

import type { WebtoolsConfig } from "./config"
import type { WebSearchResultsPayload } from "./cache"
import type { RetryOptions } from "./http"
import type { FetchedPage } from "./page"
import type { Impit } from "impit"

/** Cache subdirectory for web search results. */
const SEARCH_CACHE_SUBDIR = "search"

/** Maximum web search result entries retained in the search cache. */
const SEARCH_CACHE_MAX_SIZE = 100

/** Cache subdirectory for fetched page HTML payloads. */
const PAGE_CACHE_SUBDIR = "website"

/** Maximum fetched-page HTML payloads retained in the page cache. */
const PAGE_CACHE_MAX_SIZE = 50

/**
 * Shared runtime state constructed once per extension load and handed to both tool factories.
 */
export interface WebtoolsContext {
  /** Shared impit client for all outbound requests. */
  impit: Impit
  /** Rate limiter enforcing the minimum gap between request initiations. */
  rateLimiter: RateLimiter
  /** Disk-backed cache for web search results. */
  searchCache: TTLCache<WebSearchResultsPayload>
  /** Disk-backed cache for fetched page payloads. */
  pageCache: TTLCache<FetchedPage>
  /** Retry policy applied to every outbound request. */
  retry: RetryOptions
}

/**
 * Construct the shared extension state from the resolved configuration.
 *
 * @param config - The fully resolved environment configuration.
 * @returns The shared state consumed by `createWebSearchTool` and `createWebFetchTool`.
 */
export function createWebtoolsContext(config: WebtoolsConfig): WebtoolsContext {
  const impit = createImpit(config.browser)
  const rateLimiter = new RateLimiter({ minIntervalMs: config.requestIntervalMs })
  const searchCache = new TTLCache<WebSearchResultsPayload>(
    path.join(config.cacheDir, SEARCH_CACHE_SUBDIR),
    config.searchCacheTtlMs,
    SEARCH_CACHE_MAX_SIZE
  )
  const pageCache = new TTLCache<FetchedPage>(
    path.join(config.cacheDir, PAGE_CACHE_SUBDIR),
    config.pageCacheTtlMs,
    PAGE_CACHE_MAX_SIZE
  )

  return {
    impit,
    rateLimiter,
    searchCache,
    pageCache,
    retry: config.retryPolicy,
  }
}
