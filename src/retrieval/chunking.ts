/**
 * Split readable text into paragraph-level chunks for retrieval.
 */

/**
 * Split normalized text into paragraph-level chunks on blank-line boundaries, discarding any
 * empty segments produced by the split.
 *
 * @param text - Full text already normalized to collapse runs of blank lines.
 * @returns Trimmed paragraph chunks in source order.
 */
export function chunkText(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0)
}
