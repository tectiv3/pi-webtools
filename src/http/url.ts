/**
 * Generic URL value helpers: resolving a possibly-relative reference against a base, and
 * classifying a URL's scheme. Kept separate from the request transport so any layer can reason
 * about URLs without depending on the fetch stack.
 */

/**
 * Resolve a possibly-relative URL against a base URL, returning `undefined` when either is invalid.
 *
 * @param rawUrl - URL to resolve; may be absolute or relative.
 * @param baseUrl - Absolute URL used as the resolution base.
 * @returns The parsed absolute URL, or `undefined` when resolution fails.
 */
export function resolveUrl(rawUrl: string, baseUrl: string): URL | undefined {
  try {
    return new URL(rawUrl, baseUrl)
  } catch {
    return undefined
  }
}

/**
 * Report whether a URL uses the `http` or `https` scheme.
 *
 * @param url - Parsed URL to test.
 * @returns `true` when the URL is fetchable over HTTP(S).
 */
export function isHttpUrl(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:"
}
