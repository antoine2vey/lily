import { Array, pipe } from 'effect'

const TARGET_SIZE = 500
const MAX_SIZE = 700
const MIN_SIZE = 100
const OVERLAP = 75

interface ChunkAccumulator {
  readonly chunks: readonly string[]
  readonly currentChunk: string
}

const joinNonEmpty = (parts: readonly string[], sep: string): string =>
  pipe(
    parts,
    Array.filter((s) => s.length > 0),
    Array.join(sep)
  )

/**
 * Recursively force-split a chunk that exceeds MAX_SIZE.
 */
const forceSplit = (acc: ChunkAccumulator): ChunkAccumulator => {
  if (acc.currentChunk.length <= MAX_SIZE) {
    return acc
  }

  const splitPoint = findSplitPoint(acc.currentChunk, TARGET_SIZE)
  const part = acc.currentChunk.slice(0, splitPoint).trim()
  const overlap = acc.currentChunk.slice(
    Math.max(0, splitPoint - OVERLAP),
    splitPoint
  )
  const remaining = overlap + acc.currentChunk.slice(splitPoint)

  return forceSplit({
    chunks:
      part.length >= MIN_SIZE ? Array.append(acc.chunks, part) : acc.chunks,
    currentChunk: remaining,
  })
}

/**
 * Split content into semantic chunks based on paragraph boundaries,
 * headers, and double newlines. Targets ~500 chars per chunk (max 700)
 * with 75-char overlap between adjacent chunks for context continuity.
 */
export const chunkContent = (content: string): string[] => {
  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return []
  }

  if (trimmed.length <= MAX_SIZE) {
    return trimmed.length >= MIN_SIZE ? [trimmed] : []
  }

  // Split on semantic boundaries (double newlines, headers, horizontal rules)
  const segments = trimmed.split(/\n{2,}|(?=^#{1,3}\s)/m)

  const result = pipe(
    segments,
    Array.reduce(
      { chunks: [], currentChunk: '' } as ChunkAccumulator,
      (acc, segment) => {
        const cleanSegment = segment.trim()
        if (cleanSegment.length === 0) {
          return acc
        }

        const combined = joinNonEmpty([acc.currentChunk, cleanSegment], '\n\n')

        if (combined.length <= MAX_SIZE) {
          return { chunks: acc.chunks, currentChunk: combined }
        }

        // Current chunk is full
        if (acc.currentChunk.length >= MIN_SIZE) {
          const overlapText = acc.currentChunk.slice(-OVERLAP)
          const newCurrent = joinNonEmpty([overlapText, cleanSegment], '\n\n')

          return forceSplit({
            chunks: Array.append(acc.chunks, acc.currentChunk),
            currentChunk: newCurrent,
          })
        }

        // Current chunk too small, merge with segment
        return forceSplit({
          chunks: acc.chunks,
          currentChunk: combined,
        })
      }
    )
  )

  // Push remaining chunk
  const finalChunk = result.currentChunk.trim()
  return (
    finalChunk.length >= MIN_SIZE
      ? Array.append(result.chunks, finalChunk)
      : result.chunks
  ) as string[]
}

/**
 * Find a good split point near the target position,
 * preferring sentence boundaries.
 */
const findSplitPoint = (text: string, target: number): number => {
  // Look for sentence endings near the target
  const searchStart = Math.max(0, target - 200)
  const searchEnd = Math.min(text.length, target + 200)
  const searchRegion = text.slice(searchStart, searchEnd)

  // Find the last sentence boundary in the search region
  const sentenceEnd = searchRegion.lastIndexOf('. ')
  if (sentenceEnd !== -1) {
    return searchStart + sentenceEnd + 2
  }

  // Fall back to newline
  const newlineEnd = searchRegion.lastIndexOf('\n')
  if (newlineEnd !== -1) {
    return searchStart + newlineEnd + 1
  }

  // Fall back to space
  const spaceEnd = searchRegion.lastIndexOf(' ')
  if (spaceEnd !== -1) {
    return searchStart + spaceEnd + 1
  }

  return target
}
