import type { ISourceAdapter } from '@lily/api/services/knowledge-ingestion/adapters/types'
import { AdapterError } from '@lily/shared/errors/knowledge'
import { Stream } from 'effect'

export const fileAdapter: ISourceAdapter = {
  name: 'file',
  fetch: () =>
    Stream.fail(
      new AdapterError({
        message: 'File adapter not implemented',
        adapter: 'file',
      })
    ),
}
