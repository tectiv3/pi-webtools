/**
 * Build a size-bounded excerpt from a block of text, optionally biasing selection toward query
 * terms. Orchestrates the retrieval pipeline, chunking the text, ranking the chunks by relevance to
 * the terms, then selecting and assembling the chunks that fit the budget, falling back to a leading
 * slice when no terms are supplied or no chunk is relevant.
 */

import { chunkText } from "./chunking"
import { rankChunksByTerms } from "./relevance"
import { selectChunks } from "./selection"

/**
 * Separator placed between selected chunks when assembling the excerpt body.
 */
const CHUNK_SEPARATOR = "\n\n"

/**
 * Result of building an excerpt, holding the (possibly truncated) content and the total length of
 * the full input text before truncation or selection was applied.
 */
export interface Excerpt {
  /** The excerpt actually returned to the caller, already truncated to the requested budget. */
  content: string
  /** Character count of the full input text prior to any truncation or selection. */
  totalLength: number
}

/**
 * Build a size-bounded excerpt from text. When search terms are supplied and the full text exceeds
 * the budget, assemble the most relevant chunks selected via fuzzy matching; otherwise return a
 * leading slice. Also reports the pre-truncation length so callers can detect truncation.
 *
 * @param text - Full text to excerpt.
 * @param contentLimit - Character budget for the returned excerpt.
 * @param searchTerms - Optional search terms biasing excerpt selection.
 * @returns The excerpt and the total length of the full text before truncation.
 */
export function buildExcerpt(text: string, contentLimit: number, searchTerms: string[] | undefined): Excerpt {
  if (contentLimit <= 0) {
    return { content: "", totalLength: text.length }
  }

  const totalLength = text.length

  if (searchTerms !== undefined && searchTerms.length > 0 && contentLimit < totalLength) {
    const selection = selectedContent(text, searchTerms, contentLimit)

    if (selection.length > 0) {
      return { content: selection, totalLength }
    }
  }

  return { content: text.slice(0, contentLimit), totalLength }
}

/**
 * Assemble the query-focused excerpt body by chunking the text, ranking the chunks by relevance to
 * the terms, selecting those that fit the budget, and joining them in source order. Empty when the
 * text yields no chunks or no chunk is relevant, signalling the caller to fall back to a leading slice.
 *
 * @param text - Full text to draw the focused content from.
 * @param terms - Search terms biasing selection.
 * @param limit - Character budget for the assembled content.
 * @returns The assembled relevant content, or an empty string when nothing relevant is found.
 */
function selectedContent(text: string, terms: string[], limit: number): string {
  const chunks = chunkText(text)

  if (chunks.length === 0) return ""

  const selected = selectChunks(rankChunksByTerms(chunks, terms), chunks, limit, CHUNK_SEPARATOR.length)

  return selected
    .map(index => chunks[index])
    .join(CHUNK_SEPARATOR)
    .slice(0, limit)
}
