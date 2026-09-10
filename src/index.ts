/**
 * pi extension entry for webtools: resolves environment config, builds the shared runtime
 * state, and registers the `web_search` and `web_fetch` tools.
 */

import { resolveConfig } from "./config"
import { createWebtoolsContext } from "./context"
import { createWebFetchTool } from "./tools/web-fetch-tool"
import { createWebSearchTool } from "./tools/web-search-tool"

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

/**
 * Extension factory, invoked by pi once per extension load (and again on reload).
 *
 * @param pi - The pi extension API.
 */
export default function webtoolsExtension(pi: ExtensionAPI): void {
  const config = resolveConfig()
  const ctx = createWebtoolsContext(config)

  pi.registerTool(createWebSearchTool(ctx, config))
  pi.registerTool(createWebFetchTool(ctx, config))

  pi.on("session_shutdown", () => {
    /* no-op teardown: RateLimiter has no pause/drain and Impit.close() is unverified —
       nothing to release (D6) */
  })
}
