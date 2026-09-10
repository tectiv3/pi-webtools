# AGENTS.md — pi-webtools

Port of the MIT-licensed `npacker/web-tools` LM Studio plugin (repo deleted; original source
recovered at `original-src/`, kept unmodified) into a lightweight pi coding-agent extension with
two tools: `web_search` (DuckDuckGo) and `web_fetch` (readability → markdown).

**Read `docs/plans/webtools-port.md` first.** It is the single source of truth: resolved design
decisions (D1–D7), the complete strip/keep file map, the pi `registerTool` mapping, config env
vars, return shapes, and the smoke + verification plans. The global AGENTS.md rules apply:
subagents for implementation (~30-50 turn bounded deliverables, one at a time), main agent owns
verification and all git commits, never push, `pnpm` not npm, `uv` not pip.

Project specifics:

- `original-src/` is the reference implementation — **port from it, diff against it, never edit it**.
- `reference/` holds the original package.json/README/CLAUDE.md for context.
- `src/` is the port. `src/index.ts` is the pi extension entry (default-export function taking
  `ExtensionAPI`).
- Keep `impit` (TLS fingerprinting) — it is load-bearing for real-site fetches; do not swap for
  `fetch`.
- Tool params are TypeBox (`"typebox"`), not zod.
- Verification is live: `npx tsx scripts/smoke.ts` for the harness test, then a real pi session
  with the extension installed in `~/.pi/agent/extensions/webtools/`.
