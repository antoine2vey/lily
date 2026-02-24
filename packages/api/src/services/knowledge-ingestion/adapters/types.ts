import type { AdapterError } from '@lily/shared/errors/knowledge'
import type { AdapterConfig } from '@lily/shared/knowledge'
import type { Stream } from 'effect'

export interface RawDocumentInput {
  readonly source: string
  readonly sourceUrl?: string
  readonly sourceId?: string
  readonly title: string
  readonly content: string
  readonly author?: string
  readonly score?: number
  readonly metadata?: unknown
}

export interface ISourceAdapter {
  readonly name: string
  readonly fetch: (
    config: AdapterConfig
  ) => Stream.Stream<RawDocumentInput, AdapterError>
}
