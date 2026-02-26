import type { RedditCommentData } from '@lily/api/services/knowledge-ingestion/adapters/reddit.adapter'
import { chunkContent } from '@lily/api/services/knowledge-ingestion/processing/chunker'
import { Array, Option, Order, pipe, String } from 'effect'

const MAX_COMMENTS_PER_THREAD = 5

export interface RedditChunkInput {
  readonly title: string
  readonly content: string
  readonly postScore: number
  readonly subreddit: string
  readonly comments: readonly RedditCommentData[]
}

export interface RedditChunkChild {
  readonly content: string
  readonly metadata: Record<string, unknown>
}

export interface RedditChunkerResult {
  readonly parent?: { content: string; metadata: Record<string, unknown> }
  readonly children: RedditChunkChild[]
}

const byScoreDesc = Order.reverse(
  Order.mapInput(Order.number, (c: RedditCommentData) => c.score)
)

const buildQuestionSection = (title: string, selftext: string): string =>
  pipe(
    Option.fromNullable(
      pipe(selftext, String.trim, String.length) > 0 ? selftext : undefined
    ),
    Option.match({
      onNone: () => `Q: ${title}`,
      onSome: (text) => `Q: ${title}\n\n${text}`,
    })
  )

const formatComment = (comment: RedditCommentData): string =>
  `[${comment.score} upvotes] ${comment.body}`

export const chunkRedditDocument = (
  input: RedditChunkInput
): RedditChunkerResult => {
  const question = buildQuestionSection(input.title, input.content)

  const sortedComments = pipe(
    input.comments,
    Array.sort(byScoreDesc),
    Array.take(MAX_COMMENTS_PER_THREAD)
  )

  const hasComments = !Array.isEmptyArray(sortedComments)

  if (!hasComments) {
    return {
      children: [
        {
          content: question,
          metadata: {
            chunkType: 'reddit_question_only',
            postScore: input.postScore,
            subreddit: input.subreddit,
            commentCount: 0,
            topCommentScore: 0,
          },
        },
      ],
    }
  }

  const topCommentScore = pipe(
    Array.head(sortedComments),
    Option.map((c) => c.score),
    Option.getOrElse(() => 0)
  )

  const formattedComments = pipe(
    sortedComments,
    Array.map(formatComment),
    Array.join('\n\n')
  )

  const parentContent = `${question}\n\n---\n\nTop answers:\n\n${formattedComments}`

  const parentMetadata: Record<string, unknown> = {
    chunkType: 'reddit_thread',
    postScore: input.postScore,
    subreddit: input.subreddit,
    commentCount: Array.length(sortedComments),
    topCommentScore,
  }

  // Split long comment bodies with chunkContent so no single child exceeds
  // the embedding model's token limit (8192 tokens for text-embedding-3-large).
  // Each resulting chunk keeps the question as context prefix.
  const children: RedditChunkChild[] = pipe(
    sortedComments,
    Array.flatMap((comment): RedditChunkChild[] => {
      const bodyChunks: readonly string[] = Array.match(
        chunkContent(comment.body),
        {
          onEmpty: (): readonly string[] => [comment.body],
          onNonEmpty: (chunks) => chunks,
        }
      )

      return Array.map(bodyChunks, (chunk) => ({
        content: `Q: ${input.title}\n\nA: ${chunk}`,
        metadata: {
          chunkType: 'reddit_thread',
          subreddit: input.subreddit,
        },
      }))
    })
  )

  return {
    parent: { content: parentContent, metadata: parentMetadata },
    children,
  }
}
