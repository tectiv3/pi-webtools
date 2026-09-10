/**
 * Environment-variable configuration resolution. Replaces the original
 * `config/resolve-config.ts` + `config/config-defaults.ts` pair: the surviving defaults are
 * inlined here and resolved once per extension load from `process.env`.
 */

import os from "node:os"
import path from "node:path"

import type { RetryOptions } from "./http"
import type { SafeSearch } from "./search"
import type { Browser } from "impit"

/**
 * Output format for extracted page content.
 */
export type ContentFormat = "markdown" | "text"

/**
 * Fully resolved configuration shared by both tools.
 */
export interface WebtoolsConfig {
  /** Browser fingerprint impit should impersonate. */
  browser: Browser
  /** Upper bound on web-search results returned per page. */
  webMaxResults: number
  /** Stride used to compute the `s=` offset for web-search pagination. */
  webPageStride: number
  /** Safe-search mode to apply to the request. */
  safeSearch: SafeSearch
  /** Whether web search results should include preview snippets. */
  includeSnippets: boolean
  /** Visible-text character budget for web_fetch. */
  contentLimit: number
  /** Output format for web_fetch's `content` field. */
  contentFormat: ContentFormat
  /** Hard upper bound on the HTML payload fetched by web_fetch, in bytes. */
  maxResponseBytes: number
  /** Minimum interval between outbound request initiations, in milliseconds. */
  requestIntervalMs: number
  /** TTL for the search result cache, in milliseconds. */
  searchCacheTtlMs: number
  /** TTL for the page HTML cache, in milliseconds. */
  pageCacheTtlMs: number
  /** Retry policy applied to every outbound request. */
  retryPolicy: RetryOptions
  /** Root directory for the on-disk cacache stores. */
  cacheDir: string
}

/**
 * Conversion factor from seconds to milliseconds.
 */
const MS_PER_SECOND = 1000

/**
 * Conversion factor from megabytes to bytes.
 */
const BYTES_PER_MB = 1024 * 1024

/**
 * Default safe-search mode.
 */
const DEFAULT_SAFE_SEARCH: SafeSearch = "moderate"

/**
 * Valid values for `WEBTOOLS_BROWSER`.
 */
const BROWSER_VALUES: readonly Browser[] = ["firefox", "chrome"]

/**
 * Valid values for `WEBTOOLS_SAFE_SEARCH`.
 */
const SAFE_SEARCH_VALUES: readonly SafeSearch[] = ["strict", "moderate", "off"]

/**
 * Valid values for `WEBTOOLS_CONTENT_FORMAT`.
 */
const CONTENT_FORMAT_VALUES: readonly ContentFormat[] = ["markdown", "text"]

/**
 * Read an environment variable, treating unset and empty values as absent.
 *
 * @param name - Environment variable name.
 * @returns The raw string value, or `undefined` when the variable is unset or empty.
 */
function readEnv(name: string): string | undefined {
  const raw = process.env[name]

  if (raw === undefined || raw === "") {
    return undefined
  }

  return raw
}

/**
 * Resolve a numeric environment variable, falling back to the default when unset.
 *
 * @param name - Environment variable name.
 * @param defaultValue - Value used when the variable is unset or empty.
 * @param min - Lower bound (inclusive); values below it are rejected.
 * @param integral - Whether the value must be a whole number.
 * @returns The parsed number, or the default.
 * @throws When the value is not finite, below the bound, or (for integral fields) not a whole number.
 */
function readNumberEnv(name: string, defaultValue: number, min: number, integral: boolean): number {
  const raw = readEnv(name)

  if (raw === undefined) {
    return defaultValue
  }

  const value = Number(raw)
  const bound = integral ? "an integer" : "a number"

  if (!Number.isFinite(value) || value < min || (integral && !Number.isInteger(value))) {
    throw new Error(`${name}: ${raw} is invalid (expected ${bound} >= ${min})`)
  }

  return value
}

/**
 * Resolve a boolean environment variable, falling back to the default when unset.
 *
 * @param name - Environment variable name.
 * @param defaultValue - Value used when the variable is unset or empty.
 * @returns `true` for `"1"`/`"true"` (case-insensitive), `false` for `"0"`/`"false"`, or the default.
 * @throws When the value is not a recognised boolean literal.
 */
function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = readEnv(name)

  if (raw === undefined) {
    return defaultValue
  }

  const lowered = raw.toLowerCase()

  if (lowered === "1" || lowered === "true") {
    return true
  }

  if (lowered === "0" || lowered === "false") {
    return false
  }

  throw new Error(`${name}: ${raw} is invalid (expected "1"/"true" or "0"/"false")`)
}

/**
 * Resolve a bounded-enum environment variable, falling back to the default when unset.
 *
 * @param name - Environment variable name.
 * @param valid - The set of accepted values.
 * @param defaultValue - Value used when the variable is unset or empty.
 * @returns The validated value, or the default.
 * @throws When the value is not in the valid set.
 */
function readEnumEnv<T extends string>(name: string, valid: readonly T[], defaultValue: T): T {
  const raw = readEnv(name)

  if (raw === undefined) {
    return defaultValue
  }

  if (!valid.includes(raw as T)) {
    throw new Error(`${name}: ${raw} is invalid (expected one of: ${valid.join(" | ")})`)
  }

  return raw as T
}

/**
 * Resolve the full configuration from environment variables.
 *
 * Reads `process.env` at call time; the extension load site is expected to call this exactly
 * once per load. Invalid values throw immediately (fail fast) rather than silently falling
 * back to defaults.
 *
 * @returns The fully resolved configuration.
 * @throws When any set environment variable fails validation.
 */
export function resolveConfig(): WebtoolsConfig {
  const maxResults = readNumberEnv("WEBTOOLS_MAX_RESULTS", 10, 1, true)
  const contentLimit = readNumberEnv("WEBTOOLS_CONTENT_LIMIT", 10000, 1, true)
  const maxResponseMb = readNumberEnv("WEBTOOLS_MAX_RESPONSE_MB", 5, 1, false)
  const requestIntervalSeconds = readNumberEnv("WEBTOOLS_REQUEST_INTERVAL_SECONDS", 5, 0, false)
  const maxRetries = readNumberEnv("WEBTOOLS_MAX_RETRIES", 2, 0, true)
  const retryInitialBackoffSeconds = readNumberEnv("WEBTOOLS_RETRY_INITIAL_BACKOFF_SECONDS", 1, 0, false)
  const retryMaxBackoffSeconds = readNumberEnv("WEBTOOLS_RETRY_MAX_BACKOFF_SECONDS", 30, 0, false)
  const searchCacheTtlSeconds = readNumberEnv("WEBTOOLS_SEARCH_CACHE_TTL_SECONDS", 900, 0, false)
  const pageCacheTtlSeconds = readNumberEnv("WEBTOOLS_WEBSITE_CACHE_TTL_SECONDS", 600, 0, false)

  return {
    browser: readEnumEnv("WEBTOOLS_BROWSER", BROWSER_VALUES, "firefox"),
    webMaxResults: maxResults,
    // Flat stride: the original's uncapped 30-result fallback is a dead branch without the
    // limit toggle, so the stride always equals the cap.
    webPageStride: maxResults,
    safeSearch: readEnumEnv("WEBTOOLS_SAFE_SEARCH", SAFE_SEARCH_VALUES, DEFAULT_SAFE_SEARCH),
    includeSnippets: readBooleanEnv("WEBTOOLS_INCLUDE_SNIPPETS", true),
    contentLimit,
    contentFormat: readEnumEnv("WEBTOOLS_CONTENT_FORMAT", CONTENT_FORMAT_VALUES, "markdown"),
    maxResponseBytes: maxResponseMb * BYTES_PER_MB,
    requestIntervalMs: requestIntervalSeconds * MS_PER_SECOND,
    searchCacheTtlMs: searchCacheTtlSeconds * MS_PER_SECOND,
    pageCacheTtlMs: pageCacheTtlSeconds * MS_PER_SECOND,
    retryPolicy: {
      retries: maxRetries,
      factor: 2,
      minTimeout: retryInitialBackoffSeconds * MS_PER_SECOND,
      maxTimeout: retryMaxBackoffSeconds * MS_PER_SECOND,
      randomize: true,
    },
    cacheDir: readEnv("WEBTOOLS_CACHE_DIR") ?? path.join(os.tmpdir(), "pi-webtools-cache"),
  }
}
