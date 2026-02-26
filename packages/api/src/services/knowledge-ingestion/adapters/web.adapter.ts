import type { ISourceAdapter } from '@lily/api/services/knowledge-ingestion/adapters/types'
import { AdapterError } from '@lily/shared/errors/knowledge'
import { Stream } from 'effect'

export const webAdapter: ISourceAdapter = {
  name: 'web',
  fetch: () =>
    Stream.fail(
      new AdapterError({
        message: 'Web adapter not implemented',
        adapter: 'web',
      })
    ),
}
