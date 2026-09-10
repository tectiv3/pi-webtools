# pi-webtools

pi coding-agent extension adding `web_search` (DuckDuckGo) and `web_fetch` (readability → markdown),
ported from the MIT-licensed LM Studio plugin `lms-plugin-web-tools`.

## Tools

- **`web_search`** — search the web via DuckDuckGo.
  - Params: `query` (string), `page` (integer, 1–100, default 1).
  - Returns a numbered list of `title` / `URL` / `snippet` blocks. Repeats of the same query
    (same page, within the search TTL) are served from the disk cache and marked `(cached)`.
- **`web_fetch`** — fetch a URL and return its readable content as markdown.
  - Params: `url` (string), `findInPage` (string[], optional — terms that bias excerpt selection),
    `maxChars` (integer, 100–100_000, optional — defaults to `WEBTOOLS_CONTENT_LIMIT`).
  - Returns `Title` / `H1` / `H2` (when present) plus a markdown excerpt bounded to `maxChars`.
    When the full extracted content exceeds the budget, a truncation note is appended telling the
    model to re-call `web_fetch` with `findInPage` terms targeting the section it needs.

## Install

Requires Node >= 22.19 and pnpm.

```sh
git clone https://github.com/tectiv3/pi-webtools
cd pi-webtools
pnpm install
ln -s "$(pwd)/src" ~/.pi/agent/extensions/webtools
```

Node resolves the extension's dependencies from the repo's `node_modules` (pi walks up from the
symlink's real path to the repo root). Remove the symlink to uninstall.

## Configuration

Resolved once per extension load from environment variables:

| Env var | Default | Meaning |
| --- | --- | --- |
| `WEBTOOLS_BROWSER` | `firefox` | impit TLS fingerprint (`firefox` \| `chrome`) |
| `WEBTOOLS_MAX_RESULTS` | `10` | web_search result cap per page |
| `WEBTOOLS_INCLUDE_SNIPPETS` | `true` | include DuckDuckGo snippets in search results |
| `WEBTOOLS_CONTENT_FORMAT` | `markdown` | web_fetch content format (`markdown` \| `text`) |
| `WEBTOOLS_CONTENT_LIMIT` | `10000` | default `maxChars` for web_fetch |
| `WEBTOOLS_MAX_RESPONSE_MB` | `5` | page byte cap for web_fetch |
| `WEBTOOLS_REQUEST_INTERVAL_SECONDS` | `5` | minimum gap between request initiations |
| `WEBTOOLS_MAX_RETRIES` | `2` | per-attempt retry count |
| `WEBTOOLS_RETRY_INITIAL_BACKOFF_SECONDS` | `1` | exponential backoff start |
| `WEBTOOLS_RETRY_MAX_BACKOFF_SECONDS` | `30` | exponential backoff cap |
| `WEBTOOLS_SEARCH_CACHE_TTL_SECONDS` | `900` | disk search cache TTL |
| `WEBTOOLS_WEBSITE_CACHE_TTL_SECONDS` | `600` | disk page cache TTL |
| `WEBTOOLS_SAFE_SEARCH` | `moderate` | DuckDuckGo safe search (`strict` \| `moderate` \| `off`) |
| `WEBTOOLS_CACHE_DIR` | `<tmpdir>/pi-webtools-cache` | on-disk cacache root |

## Development

- `pnpm typecheck` — `tsc --noEmit` over `src/` + `scripts/`.
- `pnpm smoke` — live end-to-end smoke test (`scripts/smoke.ts`): hits the real internet
  (DuckDuckGo, example.com, Wikipedia, httpbin) and writes to the on-disk cache dir.
- Pre-commit hook: auto-formats staged TS with prettier and blocks any commit that is not
  tsc-clean (clean-tree invariant — every committed state typechecks). Enable per clone:
  `git config core.hooksPath scripts` (the hook lives at `scripts/pre-commit`).

## Origin & attribution

Ported from [`lms-plugin-web-tools`](https://github.com/npacker/web-tools) (MIT; the upstream repo
has been deleted. 
(c) 2025 Daniel Sig (original `lms-plugin-duckduckgo` and `lms-plugin-visit-website`)
(c) 2026 Nigel Packer
(c) 2026 tectiv3
