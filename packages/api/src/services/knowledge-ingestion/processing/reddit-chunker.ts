import type { RedditCommentData } from '@lily/api/services/knowledge-ingestion/adapters/reddit.adapter'
import { Array, Option, Order, pipe, String } from 'effect'

const MAX_COMMENTS_PER_THREAD = 5
const FALLBACK_EMBEDDING_BODY_LENGTH = 200

export interface RedditChunkInput {
  readonly title: string
  readonly content: string
  readonly postScore: number
  readonly subreddit: string
  readonly comments: readonly RedditCommentData[]
}

export interface RedditChunk {
  readonly content: string
  readonly embeddingText: string
  readonly metadata: Record<string, unknown>
}

const formatComment = (comment: RedditCommentData): string =>
  `[${comment.score} upvotes] ${comment.body}`

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

const buildFallbackEmbeddingText = (
  title: string,
  selftext: string
): string => {
  const bodyExcerpt = pipe(
    selftext,
    String.slice(0, FALLBACK_EMBEDDING_BODY_LENGTH)
  )
  return pipe(
    Option.fromNullable(
      pipe(bodyExcerpt, String.trim, String.length) > 0
        ? bodyExcerpt
        : undefined
    ),
    Option.match({
      onNone: () => title,
      onSome: (excerpt) => `${title}. ${excerpt}`,
    })
  )
}

export const chunkRedditDocument = (input: RedditChunkInput): RedditChunk => {
  const question = buildQuestionSection(input.title, input.content)

  const sortedComments = pipe(
    input.comments,
    Array.sort(byScoreDesc),
    Array.take(MAX_COMMENTS_PER_THREAD)
  )

  const hasComments = !Array.isEmptyArray(sortedComments)

  const topCommentScore = pipe(
    Array.head(sortedComments),
    Option.map((c) => c.score),
    Option.getOrElse(() => 0)
  )

  const content = pipe(
    Option.fromNullable(hasComments ? sortedComments : undefined),
    Option.match({
      onNone: () => question,
      onSome: (comments) => {
        const formattedComments = pipe(
          comments,
          Array.map(formatComment),
          Array.join('\n\n')
        )
        return `${question}\n\n---\n\nTop answers:\n\n${formattedComments}`
      },
    })
  )

  const chunkType = hasComments ? 'reddit_thread' : 'reddit_question_only'

  return {
    content,
    embeddingText: buildFallbackEmbeddingText(input.title, input.content),
    metadata: {
      chunkType,
      postScore: input.postScore,
      subreddit: input.subreddit,
      commentCount: Array.length(sortedComments),
      topCommentScore,
    },
  }
}
