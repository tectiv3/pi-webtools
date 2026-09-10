/**
 * Relevance ranking of text chunks against query terms, backed by Fuse.js fuzzy matching. This is
 * the swap point for a future embedding-based retriever. Any ranker matching the
 * `(chunks, terms) => number[]` shape can replace `rankChunksByTerms` without touching the chunker,
 * the chunk selector, or the excerpt orchestrator.
 */

import Fuse from "fuse.js"

/**
 * Maximum Fuse.js relevance score (0 = exact match, 1 = match anything) at
 * which a chunk is considered a fuzzy hit for a search term.
 */
const FUSE_SCORE_THRESHOLD = 0.3

/**
 * Rank chunk indices by the best (lowest) Fuse.js score achieved across any of the supplied terms,
 * discarding chunks that fail the score threshold for every term.
 *
 * @param chunks - Text chunks to match against, in source order.
 * @param terms - Search terms to match against each chunk.
 * @returns Chunk indices ordered from best to worst match.
 */
export function rankChunksByTerms(chunks: string[], terms: string[]): number[] {
  const fuse = new Fuse(chunks, {
    includeScore: true,
    ignoreLocation: true,
    threshold: FUSE_SCORE_THRESHOLD,
  })
  const bestScore = new Map<number, number>()

  for (const term of terms) {
    if (term === "") continue

    for (const { refIndex, score } of fuse.search(term)) {
      if (score === undefined) continue

      const existingScore = bestScore.get(refIndex)

      if (existingScore === undefined || score < existingScore) {
        bestScore.set(refIndex, score)
      }
    }
  }

  return [...bestScore.entries()].toSorted(([, scoreA], [, scoreB]) => scoreA - scoreB).map(([index]) => index)
}
