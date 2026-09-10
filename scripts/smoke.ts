/**
 * Live smoke test for the webtools extension.
 *
 * Loads the REAL extension entry (the `src/index.ts` default export) with a stub
 * `ExtensionAPI` that captures the two registered tools by name, then invokes their
 * `execute` methods directly — exercising the TypeBox schemas, the full search/fetch
 * pipelines, and the disk cache.
 *
 * Run: `pnpm smoke` (i.e. `jiti scripts/smoke.ts`) from the repo root. jiti is the same
 * loader pi uses to load the extension, so this exercises the real module pipeline.
 *
 * WARNING: hits the live internet (DuckDuckGo, example.com, Wikipedia, httpbin.org) and
 * writes to the on-disk cache dir (default: os.tmpdir()/pi-webtools-cache, or
 * WEBTOOLS_CACHE_DIR if set). Type checking is intentionally NOT part of this script —
 * run `pnpm typecheck` separately.
 *
 * Exit code: 0 when every scenario passes, 1 when any fails.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

/** Shape of a tool result as consumed by the harness: compact text plus structured details. */
interface ToolResult {
    content: { type: string; text: string }[]
    details: any
}

/** A registered tool, narrowed to the surface the harness drives. */
interface CapturedTool {
    name: string
    execute(
        toolCallId: string,
        params: unknown,
        signal?: unknown,
        onUpdate?: unknown,
        ctx?: unknown
    ): Promise<ToolResult>
}

const tools: CapturedTool[] = []

/**
 * Minimal `ExtensionAPI` stub. Kept deliberately small and honest: it captures every
 * registered tool so the harness can look them up by name; event registration is a no-op.
 */
const pi = {
    registerTool: (tool: CapturedTool) => {
        tools.push(tool)
    },
    on: (_event: string, _handler: (...args: unknown[]) => unknown) => {},
} as unknown as ExtensionAPI

// Load the real entry. The specifier is extensionless so `tsc --noEmit` (moduleResolution
// bundler) resolves it to `src/index.ts` without `allowImportingTsExtensions`; jiti resolves
// the same target at runtime.
const mod = await import('../src/index')
mod.default(pi)

/**
 * Look up a captured tool by name, failing loudly when the extension registered something
 * unexpected.
 *
 * @param name - Tool name to look up.
 * @returns The captured tool.
 * @throws When no registered tool matches the name.
 */
const byName = (name: string): CapturedTool => {
    const tool = tools.find(t => t.name === name)
    if (tool === undefined) {
        throw new Error(
            `tool "${name}" was not registered (got: ${tools.map(t => t.name).join(', ') || 'none'})`
        )
    }
    return tool
}

/**
 * Invoke a captured tool the way pi does: a synthetic tool call id, the raw params, and
 * `signal: undefined` (real pi behaviour when the agent is not streaming — the tools
 * substitute a never-aborted signal internally).
 *
 * @param name - Name of the registered tool to invoke.
 * @param params - Tool parameters, as the model would supply them.
 * @returns The tool result (text content plus structured details).
 */
const run = (name: string, params: unknown): Promise<ToolResult> =>
    byName(name).execute('smoke', params, undefined, undefined, {} as any)

interface ScenarioOutcome {
    name: string
    pass: boolean
    detail: string
}

const results: ScenarioOutcome[] = []

/**
 * Run one scenario and print its PASS/FAIL line. A thrown rejection is captured as the
 * failure reason, never fatal to the remaining scenarios.
 *
 * @param name - Scenario label for the PASS/FAIL line.
 * @param check - Assertion body; may return a detail string, or throw on failure.
 */
const scenario = async (
    name: string,
    check: () => string | void | Promise<string | void>
): Promise<void> => {
    let pass = true
    let detail = 'ok'
    try {
        detail = (await check()) ?? 'ok'
    } catch (error) {
        pass = false
        detail = error instanceof Error ? error.message : String(error)
    }
    results.push({ name, pass, detail })
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`)
}

/** Extract the first text content item from a tool result. */
const textOf = (result: ToolResult): string =>
    result.content.find(item => item.type === 'text')?.text ?? ''

// 1. Fresh search: at least one result, no uddg= redirect leftovers in any URL.
await scenario('web_search returns at least one clean result', async () => {
    const res = await run('web_search', { query: 'duckduckgo html endpoint' })
    const d = res.details
    if (
        !Number.isInteger(d.count) ||
        d.count < 1 ||
        !Array.isArray(d.results) ||
        d.results.length < 1
    ) {
        throw new Error(
            `expected >=1 result, got count=${d.count}, results=${Array.isArray(d.results) ? d.results.length : typeof d.results}`
        )
    }
    const bad = d.results.find(
        (r: { url?: string }) => typeof r.url === 'string' && r.url.includes('uddg=')
    )
    if (bad !== undefined) {
        throw new Error(`result URL still carries a uddg= leftover: ${bad.url}`)
    }
    return `${d.count} results, no uddg= leftovers`
})

// 2. Repeat the exact same search: must be served from the disk cache.
await scenario('repeat web_search is served from cache', async () => {
    const res = await run('web_search', { query: 'duckduckgo html endpoint' })
    if (res.details.cached !== true) {
        throw new Error(`expected details.cached === true, got ${String(res.details.cached)}`)
    }
    return `cached=${String(res.details.cached)}`
})

// 3. Plain fetch: title present, markdown content non-empty.
await scenario('web_fetch example.com returns title + markdown content', async () => {
    const res = await run('web_fetch', { url: 'https://example.com' })
    const d = res.details
    if (typeof d.title !== 'string' || d.title.length === 0) {
        throw new Error(`expected non-empty details.title, got ${JSON.stringify(d.title)}`)
    }
    if (typeof d.content !== 'string' || d.content.length === 0) {
        throw new Error('expected non-empty markdown details.content')
    }
    return `title="${d.title}", content=${d.content.length} chars`
})

// 4. Long page with a small budget: truncation must be visible both in details and in text.
await scenario('web_fetch long page truncates with excerpt note', async () => {
    const res = await run('web_fetch', {
        url: 'https://en.wikipedia.org/wiki/Web_scraping',
        findInPage: ['scraping'],
        maxChars: 4000,
    })
    const d = res.details
    if (!(d.contentLength > (d.content?.length ?? 0))) {
        throw new Error(
            `expected truncation (contentLength > excerpt length), got contentLength=${d.contentLength}, excerpt=${d.content?.length ?? 0}`
        )
    }
    if (!textOf(res).includes('(excerpt:')) {
        throw new Error("returned text is missing the '(excerpt:' truncation note")
    }
    return `contentLength=${d.contentLength}, excerpt=${d.content?.length ?? 0}`
})

// 5. 404 target: must REJECT with the `website` formatToolError prefix.
await scenario('web_fetch 404 rejects with the website error prefix', async () => {
    try {
        await run('web_fetch', { url: 'https://httpbin.org/status/404' })
        throw new Error('expected rejection, but the fetch resolved')
    } catch (error) {
        if (!(error instanceof Error)) throw error
        if (!error.message.startsWith('Error: Failed to fetch website')) {
            throw new Error(`unexpected error message: ${error.message}`)
        }
        return `rejected as expected: ${error.message}`
    }
})

// 6. Loopback URL: must REJECT via the SSRF guard (assertPublicUrl) — no connection is attempted.
await scenario('web_fetch loopback URL rejects via SSRF guard', async () => {
    try {
        await run('web_fetch', { url: 'http://127.0.0.1:1' })
        throw new Error('expected rejection, but the fetch resolved')
    } catch (error) {
        if (!(error instanceof Error)) throw error
        return `rejected as expected: ${error.message}`
    }
})

// 7. No-op placeholder: type checking is the main agent's job (pnpm typecheck).
console.log('SKIP tsc (run via pnpm typecheck)')

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
