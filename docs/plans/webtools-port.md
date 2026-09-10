# pi-webtools — implementation spec (self-contained)

Port `original-src/` (npacker/web-tools, MIT — repo deleted, source recovered, kept
unmodified) into a pi coding-agent extension with two tools: `web_search` (DuckDuckGo)
and `web_fetch` (page → readability → markdown, query-ranked excerpt selection).

This document is the single source of truth for the port. It supersedes `HANDOFF.md`
(which is deleted after this revision). Attribution: keep `LICENSE` as-is (MIT,
© Daniel Sig / Nigel Packer) and note origin in README.

## Porting rules

- **Fork & strip, don't rewrite.** The original is battle-tested (DDG `uddg=` redirect
  unwrap, pagination stride, retrieval budget math are subtle). Copy files, then trim.
  `original-src/` is the diff target: every changed file should have a deliberate,
  explainable delta.
- **Original conventions carry over**: ESM `import`/`export` (no CJS `require`),
  JSDoc on every export, domain-noun filenames, barrel `index.ts` per module.
- **Keep `impit`** (browser TLS fingerprinting) as the HTTP client — anti-bot layers
  require browser-like TLS fingerprints + header ordering; do not swap for `fetch`.
  `followRedirects: false` is deliberate (every hop re-validates through the SSRF guard).
- **Never push to remote.** Commits only by the main agent.

## Resolved decisions

| # | Decision | Resolution | Rationale (verified against pi 0.85.1 docs at the pnpm store + pi source at ~/code/pi-mono) |
|---|---|---|---|
| D1 | Error signaling | Tools **throw** `new Error(formatToolError(...))` from `execute`; never return error strings | pi: "To mark a tool execution as failed (sets `isError: true` …), throw an error from `execute`. Returning a value never sets the error flag." (extensions.md; `agent-loop.ts:708-715` wraps the throw in `createErrorToolResult(message)` + `isError: true`, message reaches the LLM). Original `formatToolError()` per-kind message templates are kept verbatim as the thrown messages, incl. the abort case. |
| D2 | Cache | **Disk**: port `cache/ttl-cache.ts` (cacache) + `search-cache-key.ts` + payload types | In-memory worst case is 50 × 5 MB raw HTML = 250 MB inside the pi process, and pi re-imports extensions on model switch/reload (`agent-session.ts` `_buildRuntime` → resource-loader reload; in-memory state explicitly not valid across reload), so a 15-min search cache would die on every reload. Disk cache is the original, battle-tested design and survives reload/restart. Staleness audit: search key includes query+safeSearch+page+maxResults; page cache stores raw `FetchedPage` keyed by URL only and extraction happens after cache read — config changes never serve stale rendered output. |
| D3 | Cache dir | `os.tmpdir()/pi-webtools-cache`, subdirs `search/` and `website/` (as in original `tools-provider.ts`), env override `WEBTOOLS_CACHE_DIR` | User decision. Wiped on reboot — fine for a TTL cache. |
| D4 | Install | **Local symlink only**: `ln -s <repo>/src ~/.pi/agent/extensions/webtools`; repo-root `package.json` + `node_modules` | pi auto-discovers `~/.pi/agent/extensions/*/index.ts` (extensions.md:118) and resolves deps from "a `package.json` next to your extension (or in a parent directory)" (extensions.md:148). Matches the user's existing rc/subagent/ask-user-question symlink pattern. No npm publishing this milestone. |
| D5 | Module format | ESM source (`"type": "module"`); `tsconfig` `module: NodeNext`, `target: ES2023`, `strict`, `noEmit` | pi loads extensions via jiti (`loader.ts`: `createJiti(...).import(path)`), which handles TS + ESM/CJS interop. `file-type` v22 is ESM-only, so ESM is the natural fit. |
| D6 | Lifecycle | Shared state (config, Impit, limiters, caches, retry) constructed **once per extension load** in the default-export function; `pi.on("session_shutdown")` hook performs **best-effort** teardown — the ported `RateLimiter`/`PerHostRateLimiter` expose only `wait`/`schedule` (no pause/drain) and `Impit.close()` is unverified, so teardown is a no-op unless an API exists (check impit's types after install; add a close call only if it exists). Original code never tears down. | Matches original per-session construction in `tools-provider.ts`; pi re-runs the default export on reload (new jiti module instance). Disk cache survives across loads. |
| D7 | Smoke testability | `scripts/smoke.ts` loads the **real** `src/index.ts` default export with a stub `ExtensionAPI` (records `registerTool` + `on` calls), then invokes the captured `execute(toolCallId, params, signal, onUpdate, ctx)` directly | Exercises the real entry, TypeBox schemas, and execute wiring — no shadow implementation. |

## pi extension API (verified against pi 0.85.1)

Entry: `src/index.ts` default-export function taking `ExtensionAPI` (type-only import from
`@earendil-works/pi-coding-agent` — erased at runtime by jiti/tsx, used only for
typecheck). Mapping from the original LM Studio surface:

| Original (`@lmstudio/sdk`) | pi |
|---|---|
| `tool({name, description, parameters: zod, implementation})` | `pi.registerTool({name, label, description, promptSnippet, promptGuidelines, parameters: TypeBox, execute})` |
| `context.status(msg)` | `onUpdate?.({ content: [{ type: "text", text: msg }] })` |
| `context.signal` | `signal` (4th-arg `AbortSignal`) |
| `resolveConfig(ctl)` per call | module-load config from env vars |
| `ctl.getPluginConfig` / schematics | dropped (env vars) |
| tool return `{results, count}` / `PageResult` | same shapes in `details` + compact `content[0].text` |

`promptGuidelines` bullets are appended flat (no tool-name prefix) — each bullet must
name the tool explicitly.

## Repo layout (target)

```
src/
  index.ts                 # pi extension entry: default export (pi: ExtensionAPI)
  context.ts               # createWebtoolsContext(config) → shared runtime state
  config.ts                # env-var config resolution (replaces config-schematics.ts + resolve-config.ts)
  tools/
    web-search-tool.ts     # createWebSearchTool(context)
    web-fetch-tool.ts      # createFetchWebsiteTool(context)
  duckduckgo/  http/  page/  parsers/  text/  retrieval/  timing/  errors/  search/  cache/  renderers/
              # ported from original-src/ (see Stripping)
scripts/smoke.ts
tsconfig.json              # NodeNext, ES2023, strict, noEmit
package.json
```

## Stripping (complete list)

Delete wholesale:

| Path (under original-src/) | Why |
|---|---|
| `bing/` (all) | Image search only |
| `images/` (all) | Image download tool |
| `enrichment/` (all) | metascraper fan-out; `web_search` returns title/url/snippet only |
| `tools/fetch-images-tool.ts`, `tools/image-search-tool.ts` | image tools |
| `parsers/pdf-text.ts`, `parsers/image-extensions.ts`, `parsers/page-images.ts` | PDF/image kinds |
| `cache/image-search-results-payload.ts` | imports stripped `bing/` |
| `config/config-schematics.ts`, `config/auto-sentinel.ts` | LM Studio UI schematics |
| `fs/` (all) | LM Studio home dir + image output paths |
| `renderers/image-results.ts` | image rendering |

Keep with edits (barrel + branch trimming — the "missing-module" chains):

- `cache/index.ts`: drop re-exports of `imageSearchCacheKey` + `ImageSearchResultsPayload`.
- `cache/search-cache-key.ts`: keep `webSearchCacheKey` but **drop the `enriched` 5th param**
  (enrichment gone; cache dir is fresh so the key-format change is safe). Keep
  `imageSearchCacheKey` deleted along with its payload file (it's in the same file —
  remove both exports).
- `errors/index.ts`: drop `NoImageResultsError` re-export.
- `errors/no-results-error.ts`: drop `NoImageResultsError` class.
- `errors/tool-error.ts`: `ToolErrorKind` → `"web-search" | "website"`; drop
  image-search/image-download templates; **drop the `context.warn` param** (original
  signature `formatToolError(error, context: {warn}, kind)` — LM Studio logger has no
  pi equivalent; warnings were diagnostic-only, drop them).
- `parsers/index.ts`: drop re-exports of `extractPdfContent`, `extractPageImages`,
  all `image-extensions` exports.
- `renderers/index.ts`: drop `renderImageResults` + `ImageSubject` re-exports
  (only `page-result.ts` survives).
- `page/fetch-page.ts`: `decodeFetchedPage()` has a `kind === "pdf"` branch importing
  `extractPdfContent` — remove the branch (PDF kind is stripped from `page-kind.ts`).
- `page/page-kind.ts`: drop `pdf` + `image` kinds; keep `html` / `text` / `json`.
- **zod → TypeBox** (zod is dropped as a dep; these are the only two kept modules using it
  besides the four tool files, which are rewritten anyway):
  - `search/search-page-parameter.ts`: convert the zod schema to
    `searchPageParameter = Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: ... }))`;
    the `page ?? 1` default is applied in the tool (TypeBox has no runtime `.default()` like
    zod). Keep the MIN/MAX/DEFAULT constants.
  - `http/url-schema.ts`: convert to `httpUrlSchema = Type.String({ description: ... })`.
    TypeBox does not runtime-validate URL format, so the http(s) rejection moves to the
    tool's `execute`: `new URL(url)` + `isHttpUrl(url)` guard (http/url.ts:28 — takes a
    URL, protocol check; NOT a replacement for the schema, just the predicate) throwing the
    same "URL must use http or https" message as the original.
- `tools-provider.ts` → replaced by `context.ts` + `index.ts` (do not port directly).
- `config/resolve-config.ts` → replaced by `config.ts` (env vars; see Config below).

Everything else ports verbatim or near-verbatim: `duckduckgo/` (all 5 files),
`http/` (all 13), `page/` (3), `parsers/page-text.ts` + `parse-html.ts`, `text/` (all 6),
`retrieval/` (all 5), `timing/` (all 3), `search/` (all 3), `errors/` (6),
`cache/ttl-cache.ts` + `search-cache-key.ts` + `web-search-results-payload.ts`.

Deps: `mime-types`, `raw-body` (in `http/response-body.ts` / `page/page-kind.ts`),
`file-type` (magic-number sniffing in `page/page-kind.ts`) survive.

## Dependencies (package.json)

Keep seeded list; **add**: `cacache ^20.0.4` (D2 reverted the in-memory decision),
dev: `@earendil-works/pi-coding-agent` pinned to the installed pi version (`0.85.1` —
typecheck-only, `import type`), plus `@types/cacache`, `@types/html-to-text`,
`@types/jsdom`, `@types/mime-types`, `@types/turndown` (versions from
`reference/original-package.json`). Not seeded, never add: zod, metascraper,
@metascraper/helpers, unpdf, @opendocsg/pdf2md, @lmstudio/sdk, eslint/knip/prettier.

## Config — `src/config.ts` (replaces resolve-config.ts)

Env vars, resolved once at extension load, defaults from `config/config-defaults.ts`:

| Env var | Default | Meaning |
|---|---|---|
| `WEBTOOLS_BROWSER` | `firefox` | impit fingerprint (`"firefox" \| "chrome"`) |
| `WEBTOOLS_MAX_RESULTS` | `10` | web_search cap per page |
| `WEBTOOLS_INCLUDE_SNIPPETS` | `true` | include DDG snippets |
| `WEBTOOLS_CONTENT_FORMAT` | `markdown` | `markdown` \| `text` for web_fetch |
| `WEBTOOLS_CONTENT_LIMIT` | `10000` | default maxChars for web_fetch |
| `WEBTOOLS_MAX_RESPONSE_MB` | `5` | page byte cap |
| `WEBTOOLS_REQUEST_INTERVAL_SECONDS` | `5` | min gap between request initiations |
| `WEBTOOLS_MAX_RETRIES` | `2` | per-attempt retry count |
| `WEBTOOLS_RETRY_INITIAL_BACKOFF_SECONDS` | `1` | exponential backoff start |
| `WEBTOOLS_RETRY_MAX_BACKOFF_SECONDS` | `30` | backoff cap |
| `WEBTOOLS_SEARCH_CACHE_TTL_SECONDS` | `900` | disk search cache TTL |
| `WEBTOOLS_WEBSITE_CACHE_TTL_SECONDS` | `600` | disk page cache TTL |
| `WEBTOOLS_SAFE_SEARCH` | `moderate` | `strict` \| `moderate` \| `off` (DDG `p=` param) |
| `WEBTOOLS_CACHE_DIR` | `os.tmpdir()/pi-webtools-cache` | cacache root (new) |

`config.ts` must also export the **derived** values the original computed in
`resolveConfig` (critic issue: the stride math lives in `resolve-config.ts`, NOT in
`search/`):

- `webMaxResults` (the cap; env sets it directly, no "limit" toggle — no Infinity mode)
- `webPageStride = WEBTOOLS_MAX_RESULTS` when capped, else `30`
  (`WEB_NATIVE_PAGE_SIZE`; DDG html endpoint returns ~30/page)
- `maxResponseBytes = WEBTOOLS_MAX_RESPONSE_MB * 1024 * 1024`
- `retryPolicy: RetryOptions` (maxRetries, backoff seconds)
- TTLs in ms, `requestIntervalMs`

## Shared context — `src/context.ts`

Constructed once per extension load (mirrors `tools-provider.ts`):

- `impit = createImpit(browser)` — `new Impit({ browser, followRedirects: false, maxRedirects: 0 })`
  (verbatim from `http/impit-client.ts`).
- `rateLimiter` — shared `RateLimiter` (5 s min-interval default) for search + fetch.
- `searchCache` — `TTLCache<WebSearchResultsPayload>` (subdir `search`, 100 entries,
  search TTL).
- `pageCache` — `TTLCache<FetchedPage>` (subdir `website`, 50 entries, page TTL).
- `retry` — the resolved `RetryOptions`.
- **No `hostLimiter`** — `PerHostRateLimiter` existed only for the enrichment fan-out;
  with enrichment stripped it is unused. Port `timing/per-host-rate-limiter.ts` **out**
  (delete it), keep `timing/rate-limiter.ts`.

`createWebtoolsContext(config)` returns `{ impit, rateLimiter, searchCache, pageCache, retry }`.
Both tool factories take this context. `src/index.ts` builds config → context, registers
tools, and hooks `pi.on("session_shutdown", …)` (best-effort/no-op teardown per D6).

## The two tools

### `web_search`
- `name: "web_search"`, `label: "Web Search"`.
- Params (TypeBox): `query: Type.String()`;
  `page: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))` (default 1).
- Flow (ported from `tools/web-search-tool.ts`, enrichment stripped):
  search-cache lookup (`webSearchCacheKey` 4-arg form) → on miss `searchWeb` via
  `fetchOrThrow` (shared rate limiter, retry, `signal`, `onFailedAttempt:
  createRetryNotifier(...)`) → `NoWebResultsError` when zero → cache set → return.
  `stripSnippets` kept (env-driven).
- Return:
  - `content[0].text`: header `N results for "<query>"` (append `(cached)` when served
    from cache), then one block per result:
    `1. <title>\n   <url>\n   <snippet>` (snippet line omitted when disabled).
  - `details`: `{ results: {title, url, snippet?}[], count, cached: boolean }`.
- `description`: search the web via DuckDuckGo, returns title/URL/snippet lists.
- `promptSnippet`: one line, e.g. "Web search (DuckDuckGo) — returns titles, URLs, snippets".
- `promptGuidelines`: `["Use web_search when the user asks about current events, external
  docs, or anything not in the workspace."]`.

### `web_fetch`
- `name: "web_fetch"`, `label: "Fetch Page"`.
- Params (TypeBox): `url: Type.String()`; `findInPage: Type.Optional(Type.Array(Type.String()))`;
  `maxChars: Type.Optional(Type.Integer({ minimum: 100, maximum: 100_000 }))`.
- Flow (ported from `tools/visit-website-tool.ts` + `renderers/page-result.ts`):
  `fetchPage(impit, pageCache, url, {signal, retry, onFailedAttempt, maxBytes, limiter})`
  → `renderPageResult(url, page, {contentLimit: params.maxChars ?? config, findInPage,
  contentFormat})`.
- **`cached` flag** (original surface has none — `fetchPage` swallows the lookup):
  change `fetchPage` to return `{ page, cached }` (D2-faithful alternative rejected:
  pre-checking `pageCache.get` before `fetchPage` would double the lookup and drift from
  the original limiter-wait semantics, which are awaited only inside `fetchOrThrow`).
  `details`: full `PageResult` + `cached: boolean`.
- `content[0].text`: `Title: …` / `H1:` / `H2:` lines (omit empties), then the excerpt;
  when `contentLength` > excerpt length append
  `(excerpt: <excerptLen> of <contentLength> chars — re-call web_fetch with findInPage
  to target a section)`.
- `description`: fetch a URL, return readable content as markdown, bounded to maxChars;
  mention the truncation contract.
- `promptSnippet`: one line, e.g. "Fetch a page as markdown; findInPage biases the excerpt".
- `promptGuidelines`: `["Use web_fetch to read a URL (e.g. from web_search); when the
  result is truncated, re-call web_fetch with findInPage terms targeting the section you need."]`.

## Smoke plan — `scripts/smoke.ts` (live, no pi)

Loads `src/index.ts` default export with a stub `ExtensionAPI`; captures the two
registered tools; invokes `execute` with a stub ctx. Scenarios (main agent runs it):

1. `web_search "duckduckgo html endpoint"` → ≥1 result, URLs clean (no `uddg=` leftovers).
2. Repeat same search → `details.cached === true`.
3. `web_fetch https://example.com` → markdown, `title` present.
4. `web_fetch` on a long page (pick a stable long article, e.g. a Wikipedia page) with
   `findInPage` term taken from the page → excerpt contains the term, length ≤ budget,
   `contentLength` > excerpt length.
5. `web_fetch https://example.com/definitely-404-path-xyz` (404 target: use
   `https://httpbin.org/status/404` — stable, purpose-built; fall back to a real 404 if
   httpbin is down) → **throws**, message matches the `website` error prefix
   (`formatToolError` output).
6. `web_fetch http://127.0.0.1:1` → **throws** (SSRF rejection via `assertPublicUrl`,
   no connection attempted).
7. `tsc --noEmit` clean (via `pnpm typecheck`) before smoke.

## Verification plan (main agent owns all steps; subagents never deploy/test-remote/commit)

1. `pnpm install` (repo root; impit is a native darwin-arm64 module — pinned to this
   platform). `pnpm typecheck` clean.
2. `pnpm smoke` — all scenarios above pass.
3. Install: remove any stale entry, then
   `ln -s "$(pwd)/src" ~/.pi/agent/extensions/webtools`.
4. Live pi session: both tools appear; real search + fetch; truncation note visible;
   `findInPage` re-call works; 404/SSRF show as tool errors (`isError`), not crashes.
5. `/reload` mid-session → tools still work; repeat search served from disk cache.
6. Git commits between milestones (main agent only; never push).

## Execution split (subagents, strictly one at a time; main agent checkpoints between)

- **Run 1 — core port.** Fix `package.json` (add `cacache`, `@types/*`,
  `@earendil-works/pi-coding-agent@0.85.1` dev pin); add `tsconfig.json`; port
  `http/ page/ parsers/ text/ retrieval/ timing/ errors/ search/ cache/` **and
  `duckduckgo/`** (duckduckgo moved into run 1: `cache/web-search-results-payload.ts`
  imports its `WebSearchResult` type, so cache/ cannot typecheck without it) **and
  `renderers/page-result.ts`** (keeps the ported set self-consistent;
  `renderers/index.ts` trimmed to the one surviving export). `config.ts` + `context.ts`
  are run 2 (they exist to serve the tools). Checkpoint: `tsc --noEmit` clean over the
  ported tree (no dangling imports — the stripping list above is exhaustive for
  missing-module errors).
- **Run 2 — tools + entry + smoke + README.** Write `config.ts`, `context.ts`,
  `tools/web-search-tool.ts`, `tools/web-fetch-tool.ts`, `src/index.ts` (TypeBox
  schemas, return shapes per The-two-tools, throw-on-error, `session_shutdown` hook),
  apply the `fetchPage` → `{ page, cached }` change, write `scripts/smoke.ts` and
  `README.md` (tools, params, env vars, origin/attribution). Checkpoint: typecheck
  clean; smoke script compiles (live run is main-agent step 2).
- **Main agent:** verification steps 1–6, commits between milestones.

## Out of scope

npm publishing; image tools; PDF; per-call config beyond `maxChars`/`findInPage`/`page`;
lint tooling; `pi install npm:` packaging; per-host rate limiter (enrichment-only).

## Open risks (name, don't block)

- **Tool rebind on session switch**: after `session_shutdown` (new/fork), whether pi
  replaces same-named tool registrations or double-registers is unverified in docs;
  step-5 verification covers `/reload`; observe duplicate-tool symptoms in a live
  session (model switch) and add a guard if seen.
- **jiti + symlinked extension dir**: node_modules resolution walks up from the *real*
  path (repo root) with default `preserveSymlinks=false`; matches the user's existing
  symlinked extensions, but the first live load is the proof.
- **`Impit.close()`**: unverified; D6 teardown stays no-op unless the API exists
  (check after `pnpm install`).
- **Live smoke targets**: internet-dependent; scenario 5 target pinned above, scenario 4
  target chosen at run time (must be a stable long page).
