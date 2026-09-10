# pi-webtools — implementation spec

Port `original-src/` (npacker/web-tools, MIT) into a pi coding-agent extension with two tools:
`web_search` (DuckDuckGo) and `web_fetch` (page → readability → markdown).

Built from `HANDOFF.md` + grill session (2026-07-17). Research notes cite pi source at
`~/code/pi-mono` (v0.85.1+4, matches installed pi).

## Resolved decisions

| # | Decision | Resolution | Why |
|---|---|---|---|
| D1 | Error signaling | **Throw** `new Error(formatToolError(...))` from `execute`; do not return error strings | pi source `packages/agent/src/agent-loop.ts:708-715`: a thrown error → `createErrorToolResult(message)` + `isError: true`, message reported to LLM. A returned value never sets the error flag. `formatToolError()` strings (user-facing, per-kind) are kept verbatim as the thrown messages. Abort case: keep the original "aborted by user" message. |
| D2 | Cache | **Disk**: port `cache/ttl-cache.ts` (cacache) + key builders + payload types **verbatim** | Re-litigated in grill: in-memory worst case was 50 × 5 MB raw HTML = 250 MB in the pi process; disk is the original, battle-tested design and survives `/reload` + pi restarts (pi re-imports extensions on model switch/reload — `agent-session.ts` `_buildRuntime` → resource loader reload; in-memory state is explicitly not valid across reload). Cache-key audit: search key includes query+safeSearch+page+maxResults; page cache stores raw `FetchedPage` keyed by URL only, extraction happens after cache read — no config-staleness risk. |
| D3 | Cache dir | `os.tmpdir()/pi-webtools-cache` with subdirs `search/` and `website/` (user choice); env override `WEBTOOLS_CACHE_DIR` | System /tmp: zero footprint in `~/.pi`, wiped on reboot, fine for a TTL cache. (Alternatives considered: `~/.pi/agent/cache/webtools`, `~/.pi/agent/tmp/` — rejected in grill.) |
| D4 | Install | **Local symlink only**: `ln -s <repo>/src ~/.pi/agent/extensions/webtools`; repo-root `package.json` + `node_modules` (pi: "package.json next to your extension (or in a parent directory)", extensions.md:148; subdirectory `*/index.ts` auto-discovery, extensions.md:118) | Matches user's existing rc/subagent/ask-user-question pattern (all symlinked from `openclient-llm/pi-extensions`). No npm publishing this milestone. |
| D5 | Module format | ESM source (`"type": "module"`), `import`/`export` as in original TS; tsconfig `module: NodeNext` | pi loads extensions via jiti (`loader.ts:17,508` — `createJiti(...).import(path)`), which handles TS + ESM/CJS interop. `file-type` v22 is ESM-only anyway. |
| D6 | Extension lifecycle | Shared state (config, Impit, limiters, caches, retry policy) constructed **once per extension load** in the default-export function; `pi.on("session_shutdown")` tears it down (impit close / limiter pause) | Matches original `tools-provider.ts` per-session construction; pi re-runs the default export on reload (new jiti module instance), so per-load construction is the faithful equivalent. Disk cache survives across loads. |
| D7 | Smoke testability | `scripts/smoke.ts` loads the **real** `src/index.ts` default export with a stub `ExtensionAPI` that captures `registerTool` calls, then invokes the captured `execute(toolCallId, params, signal, onUpdate, ctx)` directly | Exercises the real entry, TypeBox schemas, and execute wiring — not a shadow implementation. |
| D8 | `enrichResults`/enrichment | Fully removed (decision 8 in HANDOFF holds) | metascraper fan-out is the slowest part; `web_search` returns title/url/snippet only. |

## Repo layout (target)

```
src/
  index.ts                 # pi extension entry: default export (pi: ExtensionAPI)
  context.ts               # createWebtoolsContext(config) → {impit, rateLimiter, hostLimiter, searchCache, pageCache, retry}
  config.ts                # env-var config resolution (replaces config-schematics.ts + resolve-config.ts)
  tools/
    web-search-tool.ts     # createWebSearchTool(context) → {name, description, parameters, execute}
    web-fetch-tool.ts      # createFetchWebsiteTool(context) → same shape
  duckduckgo/  http/  page/  parsers/  text/  retrieval/  timing/  errors/  search/  cache/  renderers/
               # (ported from original-src/, see Stripping)
scripts/smoke.ts
tsconfig.json              # NodeNext, ES2023, strict, noEmit
package.json               # seeded + cacache re-added (see D2)
```

## Stripping (from HANDOFF, unchanged)

Delete: `bing/`, `images/`, `enrichment/`, `tools/fetch-images-tool.ts`, `tools/image-search-tool.ts`,
`parsers/pdf-text.ts`, `parsers/image-extensions.ts`, `fs/`, `config/config-schematics.ts`,
`config/auto-sentinel.ts`, PDF/image branches in `page/page-kind.ts` (keep `html`/`text`/`json`).

`@lmstudio/sdk` imports → pi `registerTool` mapping. zod → TypeBox (tool schemas only;
`search/search-page-parameter.ts` and `http/url-schema.ts` converted to runtime guards).
`fetch-images-tool`/`image-search-tool` gone; `visit-website-tool.ts` → `web-fetch-tool.ts`.

Deps after port (package.json): add `cacache ^20.0.4`; keep seeded list. Drop: zod,
metascraper, @metascraper/helpers, unpdf, @opendocsg/pdf2md, @lmstudio/sdk (never seeded).
Dev-deps to add: `@types/cacache`, `@types/html-to-text`, `@types/jsdom`, `@types/mime-types`,
`@types/turndown` (all present in `reference/original-package.json`). No eslint/knip/prettier.

## The two tools

### `web_search`
- Params (TypeBox): `query: string`; `page?: integer 1..100` (default 1).
- Flow (ported from `tools/web-search-tool.ts`, minus enrichment):
  resolve config at load → search-cache lookup (`webSearchCacheKey`, `enrichResults` param dropped)
  → on miss: `searchWeb` via `fetchOrThrow` (shared rate limiter, retry, signal)
  → `NoWebResultsError` when zero → cache set → return.
- Return:
  - `content[0].text`: numbered list, one result per block: `1. <title>\n   <url>\n   <snippet>`
    (snippet line omitted when `includeSnippets` off); header line: `N results for "<query>"` or
    `(cached)` suffix when served from cache.
  - `details`: `{ results: {title,url,snippet?}[], count, cached: boolean }`.

### `web_fetch`
- Params (TypeBox): `url: string`; `findInPage?: string[]`; `maxChars?: integer` (min 100,
  max 100_000; default from `WEBTOOLS_CONTENT_LIMIT`).
- Flow (ported from `tools/visit-website-tool.ts` + `renderers/page-result.ts`):
  page-cache → `fetchPage` (5 MB cap, SSRF on every hop) → `renderPageResult`
  (jsdom once → headings + readability content → `buildExcerpt(content, maxChars, findInPage)`).
- Return:
  - `content[0].text`: `Title: …` / `H1:` / `H2:` lines, then the excerpt; when
    `contentLength` > excerpt length append: `(excerpt: <excerptLen> of <contentLength> chars —
    re-call web_fetch with findInPage to target a section)`.
  - `details`: full `PageResult` (`{url, kind, mimeType, title?, h1?, h2?, content?, contentLength?}`)
    + `cached: boolean`.
- Tool `description` text must mention the truncation contract (model re-calls with `findInPage`).

`promptSnippet` / `promptGuidelines` per tool (one line each, tool name explicit in guidelines —
pi appends guidelines flat without tool prefix).

## Config (env vars, resolved once at extension load)

`WEBTOOLS_BROWSER` (firefox), `WEBTOOLS_MAX_RESULTS` (10), `WEBTOOLS_INCLUDE_SNIPPETS` (true),
`WEBTOOLS_CONTENT_FORMAT` (markdown), `WEBTOOLS_CONTENT_LIMIT` (10000), `WEBTOOLS_MAX_RESPONSE_MB` (5),
`WEBTOOLS_REQUEST_INTERVAL_SECONDS` (5), `WEBTOOLS_MAX_RETRIES` (2),
`WEBTOOLS_RETRY_INITIAL_BACKOFF_SECONDS` (1), `WEBTOOLS_RETRY_MAX_BACKOFF_SECONDS` (30),
`WEBTOOLS_SEARCH_CACHE_TTL_SECONDS` (900), `WEBTOOLS_WEBSITE_CACHE_TTL_SECONDS` (600),
`WEBTOOLS_SAFE_SEARCH` (moderate) — all from HANDOFF table, defaults from `config/config-defaults.ts`.

New: `WEBTOOLS_CACHE_DIR` (default `os.tmpdir()/pi-webtools-cache`).

Cache caps (from `tools-provider.ts`): search 100 entries, pages 50 entries — kept.

## Verification plan (main agent owns all of it)

1. `pnpm install` (repo root). `pnpm typecheck` clean.
2. `pnpm smoke` — live scenarios (no pi):
   - search known query → ≥1 result, clean URLs (no `uddg=` leftovers)
   - re-run same search → `details.cached === true`
   - `web_fetch https://example.com` → markdown, title present
   - `web_fetch` long page + `findInPage` → excerpt contains term, ≤ budget, `contentLength` > excerpt
   - `web_fetch` 404 → thrown error with formatted message (smoke asserts throw + message prefix)
   - `web_fetch http://127.0.0.1:1` → SSRF rejection (thrown error)
3. Install: `ln -s "$(pwd)/src" ~/.pi/agent/extensions/webtools` (after removing any stale entry).
4. Live pi session: both tools appear, real search + fetch, truncation note visible,
   `findInPage` re-call works, SSRF/404 errors flagged as tool errors.
5. `/reload` mid-session → tools still work (cache warm on disk).
6. Commits (main agent only; never push).

## Execution split (subagents, one at a time; main agent checkpoints between)

- **Run 1 — core port.** `pnpm install` deps fix (re-add cacache + @types), tsconfig, port
  `http/ page/ parsers/ text/ retrieval/ timing/ errors/ search/ cache/ config/` into `src/`
  (strip per above; zod→runtime-guard conversions; `config.ts` env resolver). Checkpoint:
  `tsc --noEmit` clean on core.
- **Run 2 — tools + entry + smoke + README.** Port `duckduckgo/ renderers/`, write
  `tools/web-search-tool.ts`, `tools/web-fetch-tool.ts`, `context.ts`, `index.ts` (TypeBox
  schemas, return shapes, throw-on-error, session_shutdown cleanup), `scripts/smoke.ts`,
  README (tools/params/env vars/attribution to npacker/web-tools + Daniel Sig). Checkpoint:
  typecheck + smoke script compiles (live run is main-agent verification).
- **Main agent:** steps 1–6 of verification, git commits between milestones.

## Out of scope

npm publishing; image tools; PDF; per-call config beyond `maxChars`/`findInPage`/`page`;
lint tooling; `pi install npm:` packaging.
