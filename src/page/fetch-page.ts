/**
 * Fetch arbitrary pages, classify the response into one of the supported content kinds,
 * and return a discriminated `FetchedPage`. Cached on disk by URL with TTL.
 */

import { decodeBytes, fetchOrThrow, readLimitedBytes } from "../http"

import { classifyPage, type PageKind } from "./page-kind"

import type { TTLCache } from "../cache"
import type { RequestOptions } from "../http"
import type { FetchedPage } from "./fetched-page"
import type { Impit } from "impit"

/**
 * Options controlling an outbound page fetch.
 */
interface FetchPageOptions extends RequestOptions {
  /** Hard upper bound on the response payload, in bytes. */
  maxBytes: number
}

/**
 * Fetch the page at `url`, returning a cached payload when one is available. The response
 * is buffered as bytes, classified by declared or sniffed MIME type, and decoded into the
 * kind-specific variant of `FetchedPage`. The limiter, when supplied, is awaited only on
 * cache misses so warm reads do not pay rate-limit waits.
 *
 * @param impit - Shared HTTP client used for the request.
 * @param cache - Cache holding recent fetched pages keyed by URL.
 * @param url - Target URL to fetch.
 * @param options - Options controlling the outbound request.
 * @returns The structured, classified page payload paired with a flag set when served from cache.
 * @throws When the response carries a non-2xx status or exceeds the size cap.
 * @throws When the response's content type is outside the whitelist.
 */
export async function fetchPage(
  impit: Impit,
  cache: TTLCache<FetchedPage>,
  url: string,
  options: FetchPageOptions
): Promise<{ page: FetchedPage; cached: boolean }> {
  const cached = await cache.get(url)

  if (cached !== undefined) return { page: cached, cached: true }

  const response = await fetchOrThrow(impit, url, options)
  const bytes = await readLimitedBytes(response, options.maxBytes, url)
  const contentTypeHeader = response.headers.get("content-type")
  const { kind, mimeType } = await classifyPage(bytes, contentTypeHeader, url)
  const page = await decodeFetchedPage(kind, mimeType, bytes, contentTypeHeader)

  await cache.set(url, page)

  return { page, cached: false }
}

/**
 * Dispatch on the resolved kind to produce the corresponding `FetchedPage` variant:
 * HTML is decoded into a raw string, and text/JSON fall through a shared charset-aware
 * decode path.
 *
 * @param kind - Resolved page kind.
 * @param mimeType - Effective MIME type that informed the kind.
 * @param bytes - Raw response body.
 * @param contentTypeHeader - Raw `content-type` header value, or `null` when absent.
 * @returns The kind-specific fetched-page record.
 */
async function decodeFetchedPage(
  kind: PageKind,
  mimeType: string,
  bytes: Buffer,
  contentTypeHeader: string | null
): Promise<FetchedPage> {
  if (kind === "html") {
    return { kind, html: decodeBytes(bytes, contentTypeHeader), mimeType }
  }

  return { kind, text: decodeBytes(bytes, contentTypeHeader), mimeType, title: "" }
}
