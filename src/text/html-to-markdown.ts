/**
 * HTML to Markdown conversion.
 */

import TurndownService from "turndown"

import { normalizeBlankLines } from "./normalize-blank-lines"

/**
 * Shared Turndown service, built once at module load.
 */
const service = createService()

/**
 * Convert an HTML fragment to Markdown, preserving headings, lists, code blocks,
 * emphasis, inline links, and inline images.
 *
 * @param html - HTML fragment to convert.
 * @returns The markdown representation, with runs of blank lines collapsed and trailing whitespace trimmed.
 */
export function htmlToMarkdown(html: string): string {
  return normalizeBlankLines(service.turndown(html))
}

/**
 * Build the shared Turndown service with project-wide formatting preferences.
 *
 * @returns The configured service instance.
 */
function createService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  })

  turndown.remove(["script", "style", "noscript", "template"])

  return turndown
}
