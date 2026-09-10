/**
 * Select which ranked chunks to include within a character budget. Grows the selection outward from
 * the best-matching chunks through their neighbours until the budget is filled, then returns the
 * chosen chunk indices in source order; assembling them into text is the caller's concern. The
 * join-separator width is factored into the budget so the assembled text fits the same limit.
 */

/**
 * Select the chunks around the ranked matches that fit a character budget, in source order. Expands
 * outward from the matches through their neighbours, admitting each candidate that fits the
 * remaining budget and skipping those that would overshoot. The top-ranked chunk is admitted
 * unconditionally so an oversized match still yields a non-empty selection.
 *
 * @param rankedIndices - Chunk indices ordered from best to worst match.
 * @param chunks - Text chunks, indexed in source order.
 * @param limit - Total character budget the assembled chunks must fit within.
 * @param separatorLength - Character width of the separator the caller joins the chunks with.
 * @returns The selected chunk indices in source order; empty when nothing can be selected.
 */
export function selectChunks(
  rankedIndices: number[],
  chunks: string[],
  limit: number,
  separatorLength: number
): number[] {
  if (rankedIndices.length === 0 || limit <= 0) {
    return []
  }

  return [...growSelection(rankedIndices, chunks, limit, separatorLength)].toSorted((a, b) => a - b)
}

/**
 * Grow a selection outward from the ranked matches in priority order (matches first, then ±1
 * neighbours, ±2, and so on), admitting each candidate that fits the remaining budget and skipping
 * those that would overshoot. The top-ranked chunk is admitted unconditionally so an oversized
 * match still yields a non-empty selection.
 *
 * @param rankedIndices - Chunk indices ordered from best to worst fuzzy match.
 * @param chunks - Text chunks, indexed in source order.
 * @param limit - Character budget to fill, accounting for separators between chunks.
 * @param separatorLength - Character width of the separator that will join adjacent chunks.
 * @returns Set of chunk indices chosen for inclusion, unordered.
 */
function growSelection(rankedIndices: number[], chunks: string[], limit: number, separatorLength: number): Set<number> {
  const selected = new Set<number>()
  let total = 0

  for (const candidate of prioritizedCandidates(rankedIndices, chunks.length)) {
    if (total >= limit) break

    if (selected.has(candidate)) continue

    const separatorCost = selected.size > 0 ? separatorLength : 0
    const projected = total + separatorCost + chunks[candidate].length

    if (selected.size > 0 && projected > limit) continue

    selected.add(candidate)
    total = projected
  }

  return selected
}

/**
 * Enumerate chunk indices in priority order for symmetric neighbourhood expansion. The matches
 * themselves come first, then their ±1 neighbours (iterated across all matches), then ±2, and so on
 * out to the document edges. Duplicate indices are emitted when multiple matches share a neighbour,
 * and the caller is expected to deduplicate. Lazy so callers that fill their budget early avoid
 * materializing the tail of the sequence.
 *
 * @param rankedIndices - Chunk indices ordered from best to worst fuzzy match.
 * @param chunkCount - Total number of chunks in the source document.
 * @yields Candidate chunk indices in emission order.
 */
function* prioritizedCandidates(rankedIndices: number[], chunkCount: number): Generator<number> {
  const lastIndex = chunkCount - 1

  yield* rankedIndices

  let maxReach = 0

  for (const matchIndex of rankedIndices) {
    const reach = Math.max(matchIndex, lastIndex - matchIndex)

    if (reach > maxReach) maxReach = reach
  }

  for (let radius = 1; radius <= maxReach; radius++) {
    for (const matchIndex of rankedIndices) {
      const left = matchIndex - radius
      const right = matchIndex + radius

      if (left >= 0) yield left

      if (right <= lastIndex) yield right
    }
  }
}
