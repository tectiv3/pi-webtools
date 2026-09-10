/**
 * Web Fetch tool factory: fetches a URL, classifies and extracts its content, and returns a
 * query-ranked excerpt bounded to a character budget.
 */

import { Type } from "typebox"

import { formatToolError } from "../errors"
import { createRetryNotifier, isHttpUrl } from "../http"
import { fetchPage } from "../page"
import { renderPageResult } from "../renderers"

import type { ToolDefinition } from "@earendil-works/pi-coding-agent"
import type { WebtoolsConfig } from "../config"
import type { WebtoolsContext } from "../context"
import type { PageResult } from "../renderers/page-result"

/**
 * Structured details returned by `web_fetch`: the full rendered page result plus a cache flag.
 */
type WebFetchToolDetails = PageResult & {
  /** True when the page payload was served from the disk cache. */
  cached: boolean
}

/**
 * pi passes `signal: undefined` when the agent is not streaming, but the HTTP layer requires a
 * concrete `AbortSignal`; a shared never-aborted signal stands in for "nothing to abort".
 */
const NO_ABORT_SIGNAL = new AbortController().signal

/**
 * TypeBox schema for the `web_fetch` parameters.
 */
const webFetchParams = Type.Object({
  url: Type.String({ description: "The URL of the website to fetch." }),
  findInPage: Type.Optional(
    Type.Array(Type.String(), { description: "Search terms to narrow the returned page content." })
  ),
  maxChars: Type.Optional(
    Type.Integer({
      minimum: 100,
      maximum: 100_000,
      description: "Maximum characters of content to return.",
    })
  ),
})

/**
 * Build the Web Fetch tool.
 *
 * @param ctx - Shared extension runtime state.
 * @param config - Resolved configuration.
 * @returns The configured web fetch tool.
 */
export function createWebFetchTool(
  ctx: WebtoolsContext,
  config: WebtoolsConfig
): ToolDefinition<typeof webFetchParams, WebFetchToolDetails> {
  return {
    name: "web_fetch",
    label: "Fetch Page",
    description:
      "Fetch a URL and return its readable content as markdown, bounded to maxChars. When the content is truncated (an excerpt note is appended), re-call with findInPage terms targeting the section you need.",
    promptSnippet: "Fetch a page as markdown; findInPage biases the excerpt",
    promptGuidelines: [
      "Use web_fetch to read a URL (e.g. from web_search); when the result is truncated, re-call web_fetch with findInPage terms targeting the section you need.",
    ],
    parameters: webFetchParams,

    /**
     * Execute a page fetch: validate the URL, fetch (with cache, retry, rate limiting), then
     * render the readable content excerpt.
     *
     * @param _toolCallId - Unique id for this tool execution.
     * @param params - Validated tool parameters.
     * @param signal - Abort signal for the in-flight request, when the agent is streaming.
     * @param onUpdate - Callback for streaming partial status updates.
     * @param _ctx - Extension context supplied by the runner.
     * @returns The formatted page text plus structured details.
     */
    execute: async (_toolCallId, params, signal, onUpdate, _ctx) => {
      try {
        let parsed: URL
        try {
          parsed = new URL(params.url)
        } catch {
          // Re-thrown through the outer catch so the message gets exactly one formatToolError wrap.
          throw new Error("URL must be a valid URL.")
        }

        if (!isHttpUrl(parsed)) {
          throw new Error("URL must use http or https.")
        }

        /**
         * Report a status line to the tool UI via the partial-update callback.
         *
         * @param message - Status text to display.
         */
        const status = (message: string): void => {
          if (onUpdate) {
            onUpdate({
              content: [{ type: "text", text: message }],
              details: { url: params.url, kind: "html", mimeType: "", cached: false },
            })
          }
        }

        const { page, cached } = await fetchPage(ctx.impit, ctx.pageCache, params.url, {
          signal: signal ?? NO_ABORT_SIGNAL,
          retry: ctx.retry,
          onFailedAttempt: createRetryNotifier(status, "website fetch"),
          maxBytes: config.maxResponseBytes,
          limiter: ctx.rateLimiter,
        })

        const result = renderPageResult(params.url, page, {
          contentLimit: params.maxChars ?? config.contentLimit,
          findInPage: params.findInPage,
          contentFormat: config.contentFormat,
        })

        return {
          content: [{ type: "text", text: formatPage(result) }],
          details: { ...result, cached },
        }
      } catch (error) {
        throw new Error(formatToolError(error, "website"))
      }
    },
  }
}

/**
 * Render the compact tool text: `Title:` / `H1:` / `H2:` lines (empty fields omitted), a blank
 * line, the content excerpt, and a truncation note when the excerpt is shorter than the full
 * extracted content.
 *
 * @param result - The rendered page result to format.
 * @returns The formatted text for the tool's `content` item.
 */
function formatPage(result: PageResult): string {
  const headerLines = [
    result.title ? `Title: ${result.title}` : "",
    result.h1 ? `H1: ${result.h1}` : "",
    result.h2 ? `H2: ${result.h2}` : "",
  ].filter((line) => line.length > 0)

  const parts = [...headerLines, result.content ?? ""]

  if (result.contentLength !== undefined && result.contentLength > (result.content?.length ?? 0)) {
    parts.push(
      `(excerpt: ${result.content?.length ?? 0} of ${result.contentLength} chars — re-call web_fetch with findInPage to target a section)`
    )
  }

  return parts.join("\n\n")
}
