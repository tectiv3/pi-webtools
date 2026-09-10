/**
 * Web Search tool factory: queries DuckDuckGo, serves repeats from the disk cache, and returns
 * numbered title/URL/snippet blocks.
 */

import { Type } from 'typebox'

import { Text } from '@earendil-works/pi-tui'

import { webSearchCacheKey } from '../cache'
import { searchWeb, type WebSearchResult } from '../duckduckgo'
import { NoWebResultsError, formatToolError } from '../errors'
import { createRetryNotifier } from '../http'
import { searchPageParameter } from '../search'

import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { WebtoolsConfig } from '../config'
import type { WebtoolsContext } from '../context'

/**
 * Structured details returned by `web_search`, consumed by logs and result rendering.
 */
interface WebSearchToolDetails {
    /** Result records, with `snippet` removed when snippets are disabled. */
    results: WebSearchResult[]
    /** Number of results in `results`. */
    count: number
    /** True when the result was served from the disk cache. */
    cached: boolean
}

/**
 * TypeBox schema for the `web_search` parameters.
 */
const webSearchParams = Type.Object({
    query: Type.String({ description: 'The search query for finding web pages.' }),
    page: searchPageParameter,
})

/**
 * pi passes `signal: undefined` when the agent is not streaming, but the HTTP layer requires a
 * concrete `AbortSignal`; a shared never-aborted signal stands in for "nothing to abort".
 */
const NO_ABORT_SIGNAL = new AbortController().signal

/**
 * Build the Web Search tool.
 *
 * @param ctx - Shared extension runtime state.
 * @param config - Resolved configuration.
 * @returns The configured web search tool.
 */
export function createWebSearchTool(
    ctx: WebtoolsContext,
    config: WebtoolsConfig
): ToolDefinition<typeof webSearchParams, WebSearchToolDetails> {
    /**
     * Remove `snippet` from every record when snippets are disabled.
     *
     * @param results - Records being prepared for the tool response.
     * @returns Records with `snippet` removed when disabled, otherwise unchanged.
     */
    const stripSnippets = (results: WebSearchResult[]): WebSearchResult[] =>
        config.includeSnippets
            ? results
            : results.map(({ snippet: _snippet, ...rest }) => rest)

    return {
        name: 'web_search',
        label: 'Web Search',
        description:
            'Search the web via DuckDuckGo and return a numbered list of results with a title, URL, and snippet for each.',
        promptSnippet: 'Web search (DuckDuckGo) — returns titles, URLs, snippets',
        promptGuidelines: [
            'Use web_search when the user asks about current events, external docs, or anything not in the workspace.',
        ],
        parameters: webSearchParams,

        /**
         * TUI call-line rendering: `web_search "query" (page N)` — pi falls back to a bare bold
         * tool name without this.
         *
         * @param args - Validated tool parameters.
         * @param theme - Active pi theme.
         * @param _context - Render context (state, expansion, last component).
         * @returns The call-line component.
         */
        renderCall(args, theme, _context) {
            const query = args.query.length > 60 ? `${args.query.slice(0, 60)}...` : args.query
            let text =
                theme.fg('toolTitle', theme.bold('web_search ')) +
                theme.fg('accent', `"${query}"`)
            if (args.page !== undefined && args.page > 1) {
                text += theme.fg('muted', ` (page ${args.page})`)
            }

            return new Text(text, 0, 0)
        },

        /**
         * Execute a web search, honouring cached results when available and falling back to a fresh
         * DuckDuckGo search with retry, rate limiting, and disk caching.
         *
         * @param _toolCallId - Unique id for this tool execution.
         * @param params - Validated tool parameters.
         * @param signal - Abort signal for the in-flight request, when the agent is streaming.
         * @param onUpdate - Callback for streaming partial status updates.
         * @param _ctx - Extension context supplied by the runner.
         * @returns The formatted result text plus structured details.
         */
        execute: async (_toolCallId, params, signal, onUpdate, _ctx) => {
            try {
                const { query } = params
                const page = params.page ?? 1

                /**
                 * Report a status line to the tool UI via the partial-update callback.
                 *
                 * @param message - Status text to display.
                 */
                const status = (message: string): void => {
                    if (onUpdate) {
                        onUpdate({
                            content: [{ type: 'text', text: message }],
                            details: { results: [], count: 0, cached: false },
                        })
                    }
                }

                const cacheKey = webSearchCacheKey(
                    query,
                    config.safeSearch,
                    page,
                    config.webMaxResults
                )
                const cached = await ctx.searchCache.get(cacheKey)

                if (cached !== undefined) {
                    return {
                        content: [
                            { type: 'text', text: formatResults(cached.results, query, true) },
                        ],
                        details: {
                            results: stripSnippets(cached.results),
                            count: cached.count,
                            cached: true,
                        },
                    }
                }

                const results = await searchWeb(
                    ctx.impit,
                    {
                        query,
                        pageStride: config.webPageStride,
                        safeSearch: config.safeSearch,
                        page,
                    },
                    config.webMaxResults,
                    {
                        signal: signal ?? NO_ABORT_SIGNAL,
                        retry: ctx.retry,
                        onFailedAttempt: createRetryNotifier(status, 'web search'),
                        limiter: ctx.rateLimiter,
                    }
                )

                if (results.length === 0) {
                    throw new NoWebResultsError(query)
                }

                const payload = { results, count: results.length }

                await ctx.searchCache.set(cacheKey, payload)

                return {
                    content: [{ type: 'text', text: formatResults(results, query, false) }],
                    details: {
                        results: stripSnippets(results),
                        count: results.length,
                        cached: false,
                    },
                }
            } catch (error) {
                throw new Error(formatToolError(error, 'web-search'))
            }
        },
    }
}

/**
 * Render the compact tool text: a header line, then one block per result.
 *
 * @param results - Search results to render.
 * @param query - The query the results answer, echoed in the header.
 * @param cached - Whether the results came from the cache, annotated in the header.
 * @returns The formatted text for the tool's `content` item.
 */
function formatResults(results: WebSearchResult[], query: string, cached: boolean): string {
    const header = `${results.length} results for "${query}"${cached ? ' (cached)' : ''}`
    const blocks = results.map((result, index) => {
        const lines = [`${index + 1}. ${result.title}`, `   ${result.url}`]

        if (result.snippet) {
            lines.push(`   ${result.snippet}`)
        }

        return lines.join('\n')
    })

    return [header, ...blocks].join('\n\n')
}
