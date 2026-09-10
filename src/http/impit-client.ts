/**
 * Factory for the shared `impit` HTTP client.
 *
 * Do not replace `impit` with `fetch`: the search providers' anti-bot layers require
 * browser-like TLS fingerprints and header ordering that a bare `fetch` does not supply.
 *
 * Automatic redirect following is disabled here so that every hop can be re-validated through
 * the SSRF guard.
 */

import { Impit } from "impit"

import type { Browser } from "impit"

/**
 * Create a new `impit` client configured with the given browser fingerprint and manual redirect handling.
 *
 * @param browser - Browser fingerprint impit should impersonate.
 * @returns A fresh `Impit` instance.
 */
export function createImpit(browser: Browser): Impit {
  return new Impit({ browser, followRedirects: false, maxRedirects: 0 })
}
