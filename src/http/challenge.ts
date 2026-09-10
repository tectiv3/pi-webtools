/**
 * Cloudflare WAF response reasoning, kept separate from the generic redirect-following logic
 * so the rest of the HTTP layer stays unaware of any one provider's anti-bot quirks.
 */

import type { ImpitResponse } from "impit"

/**
 * Response header Cloudflare sets when its WAF takes mitigation action on a request.
 * `cf-mitigated: challenge` accompanies a `403` whose body is a JS challenge page
 * ("Just a moment..."); these are non-deterministic and worth retrying since the same
 * fingerprint may pass on a subsequent attempt.
 */
const CF_MITIGATED_HEADER = "cf-mitigated"

/**
 * Value of the `cf-mitigated` header indicating a transient JS challenge, the only
 * mitigation kind we treat as retryable. Other values (`block`, `dns_filtering`) reflect
 * deliberate site rules and should fail fast.
 */
const CF_MITIGATED_CHALLENGE_VALUE = "challenge"

/**
 * Detect a Cloudflare JS-challenge response, identified by the `cf-mitigated: challenge`
 * header Cloudflare sets alongside the `403`. The challenge is non-deterministic, since the
 * same fingerprint that gets challenged once may pass on retry, so the caller flags the
 * underlying `FetchError` retryable.
 *
 * @param response - Response to inspect.
 * @returns `true` when the response is a Cloudflare JS challenge.
 */
export function isCloudflareChallenge(response: ImpitResponse): boolean {
  return response.headers.get(CF_MITIGATED_HEADER) === CF_MITIGATED_CHALLENGE_VALUE
}
