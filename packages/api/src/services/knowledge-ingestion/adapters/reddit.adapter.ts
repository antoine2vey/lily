import type {
  ISourceAdapter,
  RawDocumentInput,
} from '@lily/api/services/knowledge-ingestion/adapters/types'
import { AdapterError } from '@lily/shared/errors/knowledge'
import type { AdapterConfig, RedditAdapterConfig } from '@lily/shared/knowledge'
import {
  Array,
  Duration,
  Effect,
  Option,
  pipe,
  Schedule,
  String as Str,
  Stream,
} from 'effect'

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

export interface RedditCommentData {
  readonly body: string
  readonly author: string
  readonly score: number
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

export const sanitizeText = (text: string): string =>
  text.replace(CONTROL_CHARS_RE, '').replace(NON_BMP_RE, '')

/**
 * Reddit public JSON API allows ~10 requests per minute.
 * 6 seconds between requests keeps us safely under that limit.
 */
const REQUEST_DELAY = '6 seconds'

const DELETED_MARKERS = ['[deleted]', '[removed]']
const BOT_PATTERNS = ['automoderator', 'bot']

const MIN_COMMENT_BODY_LENGTH = 100
const MIN_COMMENT_SCORE = 3
const MIN_POST_SCORE = 5
const MIN_POST_COMMENTS = 2

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
    // Sleep for the server-specified retry-after duration before each retry
    Effect.tapError((e: AdapterError | RateLimitedError) =>
      e._tag === 'RateLimitedError'
        ? Effect.sleep(Duration.seconds(e.retryAfter))
        : Effect.void
    ),
    Effect.retry(
      Schedule.recurs(5).pipe(
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

const REDDIT_PAGE_SIZE = 100

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
    const totalLimit = Option.getOrElse(
      Option.fromNullable(config.limit),
      () => 25
    )
    const pageSize = Math.min(totalLimit, REDDIT_PAGE_SIZE)

    let allPosts: RedditPost[] = []
    let after: string | null = null
    let fetched = 0

    yield* Effect.log(
      `Fetching r/${subreddit}/${sort} (limit=${totalLimit}, t=${timeFilter})`
    )

    while (fetched < totalLimit) {
      const afterParam: string = pipe(
        Option.fromNullable(after),
        Option.match({
          onNone: () => '',
          onSome: (a) => `&after=${a}`,
        })
      )
      const url: string = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sort}.json?t=${timeFilter}&limit=${pageSize}&raw_json=1${afterParam}`

      yield* Effect.sleep(REQUEST_DELAY)
      const response: RedditListing = yield* fetchRedditJson<RedditListing>(url)
      const posts = response.data.children

      if (Array.isEmptyArray(posts)) {
        break
      }

      allPosts = [...allPosts, ...posts]
      fetched = fetched + posts.length
      after = response.data.after

      if (after === null) {
        break
      }
    }

    const qualified = Array.filter(
      allPosts,
      (p) =>
        p.data.selftext.length > 0 &&
        p.data.score >= MIN_POST_SCORE &&
        p.data.num_comments >= MIN_POST_COMMENTS
    )

    yield* Effect.log(
      `r/${subreddit}: ${allPosts.length} posts fetched, ${qualified.length} qualified (score >= ${MIN_POST_SCORE}, comments >= ${MIN_POST_COMMENTS})`
    )

    return qualified
  })

const fetchPostComments = (permalink: string) =>
  Effect.gen(function* () {
    const url = `https://www.reddit.com${permalink}.json?sort=top&limit=10&raw_json=1`

    const response = yield* fetchRedditJson<RedditListing[]>(url).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`Failed to fetch comments for ${permalink}`, {
          error: String(e),
        })
      ),
      Effect.orElseSucceed(() => [] as RedditListing[])
    )

    if (!globalThis.Array.isArray(response)) {
      return [] as RedditCommentData[]
    }

    return pipe(
      Array.get(response, 1),
      Option.match({
        onNone: () => [] as RedditCommentData[],
        onSome: (listing) =>
          pipe(
            (listing as RedditListing).data
              .children as unknown as RedditComment[],
            Array.filter((c) => Boolean(c.data?.body)),
            Array.map(
              (c): RedditCommentData => ({
                body: c.data.body,
                author: c.data.author,
                score: c.data.score,
              })
            ),
            Array.filter(
              (c) =>
                !Array.contains(DELETED_MARKERS, c.body) &&
                !Array.contains(DELETED_MARKERS, c.author) &&
                !Array.some(BOT_PATTERNS, (p) =>
                  pipe(Str.toLowerCase(c.author), Str.includes(p))
                ) &&
                c.body.length >= MIN_COMMENT_BODY_LENGTH &&
                c.score >= MIN_COMMENT_SCORE
            )
          ),
      })
    )
  })

const postToDocument = (
  post: RedditPost,
  comments: RedditCommentData[]
): RawDocumentInput => ({
  source: 'reddit',
  sourceUrl: `https://reddit.com${post.data.permalink}`,
  sourceId: `reddit_${post.data.id}`,
  title: sanitizeText(post.data.title),
  content: sanitizeText(post.data.selftext),
  author: post.data.author,
  score: post.data.score,
  metadata: {
    subreddit: post.data.subreddit,
    numComments: post.data.num_comments,
    postScore: post.data.score,
    comments: Array.map(
      comments,
      (c): RedditCommentData => ({
        body: sanitizeText(c.body),
        author: c.author,
        score: c.score,
      })
    ),
  },
})

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
          Stream.flatMap((posts) => Stream.fromIterable(posts)),
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
