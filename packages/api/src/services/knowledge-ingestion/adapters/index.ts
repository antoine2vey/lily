import { fileAdapter } from '@lily/api/services/knowledge-ingestion/adapters/file.adapter'
import { redditAdapter } from '@lily/api/services/knowledge-ingestion/adapters/reddit.adapter'
import type { ISourceAdapter } from '@lily/api/services/knowledge-ingestion/adapters/types'
import { webAdapter } from '@lily/api/services/knowledge-ingestion/adapters/web.adapter'
import { AdapterError } from '@lily/shared/errors/knowledge'
import { Effect, Match, pipe } from 'effect'

export type {
  ISourceAdapter,
  RawDocumentInput,
} from '@lily/api/services/knowledge-ingestion/adapters/types'

export const getAdapter = (
  name: string
): Effect.Effect<ISourceAdapter, AdapterError> =>
  pipe(
    Match.value(name),
    Match.when('reddit', () => Effect.succeed(redditAdapter)),
    Match.when('web', () => Effect.succeed(webAdapter)),
    Match.when('file', () => Effect.succeed(fileAdapter)),
    Match.orElse(() =>
      Effect.fail(
        new AdapterError({
          message: `Unknown adapter: ${name}`,
          adapter: name,
        })
      )
    )
  )
