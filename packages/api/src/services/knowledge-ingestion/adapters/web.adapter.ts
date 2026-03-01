import { createHash } from 'node:crypto'
import {
  sanitizeText,
  USER_AGENT,
} from '@lily/api/services/knowledge-ingestion/adapters/reddit.adapter'
import type {
  ISourceAdapter,
  RawDocumentInput,
} from '@lily/api/services/knowledge-ingestion/adapters/types'
import { nowAsIsoString } from '@lily/shared'
import { AdapterError } from '@lily/shared/errors/knowledge'
import type { AdapterConfig } from '@lily/shared/knowledge'
import { Readability } from '@mozilla/readability'
import { Effect, Option, pipe, Stream } from 'effect'
import { parseHTML } from 'linkedom'

const REQUEST_DELAY = '2 seconds'
const MIN_CONTENT_LENGTH = 200

const hashUrl = (url: string): string =>
  `web_${createHash('sha256').update(url).digest('hex').slice(0, 12)}`

const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

const fetchWebPage = (
  url: string
): Effect.Effect<RawDocumentInput, AdapterError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(30_000),
        }),
      catch: (e) =>
        new AdapterError({
          message: `Web fetch failed for ${url}: ${String(e)}`,
          adapter: 'web',
        }),
    })

    if (!response.ok) {
      return yield* Effect.fail(
        new AdapterError({
          message: `Web page returned ${response.status}: ${response.statusText} for ${url}`,
          adapter: 'web',
        })
      )
    }

    const html = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (e) =>
        new AdapterError({
          message: `Failed to read response body for ${url}: ${String(e)}`,
          adapter: 'web',
        }),
    })

    const { document } = parseHTML(html)
    const reader = new Readability(document)
    const article = reader.parse()

    if (article === null) {
      return yield* Effect.fail(
        new AdapterError({
          message: `Readability could not extract article from ${url}`,
          adapter: 'web',
        })
      )
    }

    const rawText = pipe(
      Option.fromNullable(article.textContent),
      Option.getOrElse(() => '')
    )
    const content = sanitizeText(rawText.trim())

    if (content.length < MIN_CONTENT_LENGTH) {
      return yield* Effect.fail(
        new AdapterError({
          message: `Content too short (${content.length} chars) for ${url}`,
          adapter: 'web',
        })
      )
    }

    const title = pipe(
      Option.fromNullable(article.title),
      Option.filter((t) => t.trim().length > 0),
      Option.getOrElse(() => url)
    )

    return {
      source: 'web',
      sourceUrl: url,
      sourceId: hashUrl(url),
      title: sanitizeText(title),
      content,
      metadata: {
        domain: extractDomain(url),
        contentLength: content.length,
        fetchedAt: nowAsIsoString(),
      },
    } satisfies RawDocumentInput
  })

export const webAdapter: ISourceAdapter = {
  name: 'web',
  fetch: (config: AdapterConfig) => {
    if (config.type !== 'web') {
      return Stream.fail(
        new AdapterError({
          message: 'Invalid config type for web adapter',
          adapter: 'web',
        })
      )
    }

    return pipe(
      Stream.fromIterable(config.urls),
      Stream.mapEffect((url) =>
        Effect.gen(function* () {
          yield* Effect.sleep(REQUEST_DELAY)
          return yield* fetchWebPage(url)
        }).pipe(Effect.option)
      ),
      Stream.filterMap((opt) => opt)
    )
  },
}
