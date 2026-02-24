import type {
  ISourceAdapter,
  RawDocumentInput,
} from '@lily/api/services/knowledge-ingestion/adapters/types'
import { AdapterError } from '@lily/shared/errors/knowledge'
import type { AdapterConfig, RedditAdapterConfig } from '@lily/shared/knowledge'
import { Array, Effect, Option, pipe, Schedule, Stream } from 'effect'

interface RedditPost {
  data: {
    id: string
    title: string
    selftext: string
    author: string
    score: number
    permalink: string
    subreddit: string
    num_comments: number
  }
}

interface RedditComment {
  data: {
    body: string
    author: string
    score: number
  }
}

interface RedditListing {
  data: {
    children: RedditPost[]
    after: string | null
  }
}

class RateLimitedError {
  readonly _tag = 'RateLimitedError'
  constructor(readonly retryAfter: number) {}
}

const USER_AGENT = 'lily-plant-care:v1.0.0 (plant care knowledge base)'

/**
 * Strip characters that cause PostgreSQL UTF-8 encoding issues.
 * Removes surrogate pairs, lone surrogates, and non-BMP characters
 * that can get corrupted during fetch/JSON parsing.
 */
// biome-ignore lint/complexity/useRegexLiterals: using RegExp constructor to avoid noControlCharactersInRegex
const CONTROL_CHARS_RE = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uD800-\\uDFFF\\uFFFE\\uFFFF]',
  'g'
)
// biome-ignore lint/complexity/useRegexLiterals: using RegExp constructor to avoid noControlCharactersInRegex
const NON_BMP_RE = new RegExp('[\\u{10000}-\\u{10FFFF}]', 'gu')

const sanitizeText = (text: string): string =>
  text.replace(CONTROL_CHARS_RE, '').replace(NON_BMP_RE, '')

/**
 * Reddit public JSON API allows ~10 requests per minute.
 * 6 seconds between requests keeps us safely under that limit.
 */
const REQUEST_DELAY = '6 seconds'

/**
 * Fetch JSON from a public Reddit URL with 429 retry handling.
 * Retries up to 5 times with exponential backoff on rate limits.
 */
const fetchRedditJson = <T>(url: string) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
        }),
      catch: (e) =>
        new AdapterError({
          message: `Reddit fetch failed: ${String(e)}`,
          adapter: 'reddit',
        }),
    })

    if (response.status === 429) {
      const retryAfter = parseInt(
        Option.getOrElse(
          Option.fromNullable(response.headers.get('retry-after')),
          () => '10'
        ),
        10
      )
      yield* Effect.logWarning(
        `Reddit 429 rate limited, retry-after: ${retryAfter}s`,
        {
          url,
        }
      )
      return yield* Effect.fail(new RateLimitedError(retryAfter))
    }

    if (!response.ok) {
      return yield* Effect.fail(
        new AdapterError({
          message: `Reddit returned ${response.status}: ${response.statusText}`,
          adapter: 'reddit',
        })
      )
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: (e) =>
        new AdapterError({
          message: `Failed to parse Reddit JSON: ${String(e)}`,
          adapter: 'reddit',
        }),
    })

    return json
  }).pipe(
    Effect.retry(
      Schedule.exponential('5 seconds').pipe(
        Schedule.intersect(Schedule.recurs(5)),
        Schedule.whileInput(
          (e: AdapterError | RateLimitedError) => e._tag === 'RateLimitedError'
        )
      )
    ),
    Effect.mapError((e) =>
      e._tag === 'RateLimitedError'
        ? new AdapterError({
            message: 'Reddit rate limit exceeded after retries',
            adapter: 'reddit',
          })
        : e
    )
  )

const fetchSubredditPosts = (subreddit: string, config: RedditAdapterConfig) =>
  Effect.gen(function* () {
    const sort = Option.getOrElse(
      Option.fromNullable(config.sort),
      () => 'top' as const
    )
    const timeFilter = Option.getOrElse(
      Option.fromNullable(config.timeFilter),
      () => 'year' as const
    )
    const limit = Option.getOrElse(Option.fromNullable(config.limit), () => 25)

    const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?t=${timeFilter}&limit=${limit}&raw_json=1`

    yield* Effect.log(
      `Fetching r/${subreddit}/${sort} (limit=${limit}, t=${timeFilter})`
    )

    const response = yield* fetchRedditJson<RedditListing>(url)
    const posts = response.data.children
    const withText = pipe(
      posts,
      Array.filter((p) => p.data.selftext.length > 0),
      Array.length
    )

    yield* Effect.log(
      `r/${subreddit}: ${posts.length} posts fetched, ${withText} with text content`
    )

    return posts
  })

const fetchPostComments = (permalink: string) =>
  Effect.gen(function* () {
    const url = `https://www.reddit.com${permalink}.json?sort=top&limit=5&raw_json=1`

    const response = yield* fetchRedditJson<RedditListing[]>(url).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`Failed to fetch comments for ${permalink}`, {
          error: String(e),
        })
      ),
      Effect.orElseSucceed(() => [] as RedditListing[])
    )

    if (!globalThis.Array.isArray(response)) {
      return []
    }

    return pipe(
      Array.get(response, 1),
      Option.match({
        onNone: () => [] as string[],
        onSome: (listing) =>
          pipe(
            (listing as RedditListing).data
              .children as unknown as RedditComment[],
            Array.filter((c) => Boolean(c.data?.body)),
            Array.map((c) => c.data.body),
            Array.take(5)
          ),
      })
    )
  })

const postToDocument = (
  post: RedditPost,
  comments: string[]
): RawDocumentInput => {
  const commentText = pipe(
    comments,
    Array.map((comment, i) => `Comment ${i + 1}: ${sanitizeText(comment)}`),
    Array.join('\n\n')
  )

  const content = pipe(
    [sanitizeText(post.data.selftext), commentText],
    Array.filter((s) => s.length > 0),
    Array.join('\n\n---\n\n')
  )

  return {
    source: 'reddit',
    sourceUrl: `https://reddit.com${post.data.permalink}`,
    sourceId: `reddit_${post.data.id}`,
    title: sanitizeText(post.data.title),
    content,
    author: post.data.author,
    score: post.data.score,
    metadata: {
      subreddit: post.data.subreddit,
      numComments: post.data.num_comments,
    },
  }
}

export const redditAdapter: ISourceAdapter = {
  name: 'reddit',
  fetch: (config: AdapterConfig) => {
    if (config.type !== 'reddit') {
      return Stream.fail(
        new AdapterError({
          message: 'Invalid config type for reddit adapter',
          adapter: 'reddit',
        })
      )
    }

    return pipe(
      Stream.fromIterable(config.subreddits),
      Stream.flatMap((subreddit) =>
        pipe(
          // Fetch subreddit posts (with rate-limit delay)
          Stream.fromEffect(
            Effect.gen(function* () {
              yield* Effect.sleep(REQUEST_DELAY)
              return yield* fetchSubredditPosts(subreddit, config)
            })
          ),
          // Flatten posts into individual items
          Stream.flatMap((posts) =>
            Stream.fromIterable(
              Array.filter(posts, (p) => p.data.selftext.length > 0)
            )
          ),
          // Fetch comments and convert each post to a document
          Stream.mapEffect((post) =>
            Effect.gen(function* () {
              yield* Effect.sleep(REQUEST_DELAY)
              const comments = yield* fetchPostComments(post.data.permalink)
              return postToDocument(post, comments)
            })
          )
        )
      )
    )
  },
}
