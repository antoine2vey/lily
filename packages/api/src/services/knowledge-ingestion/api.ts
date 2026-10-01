import { AdminAuth } from '@lily/api/services/admin/middleware.types'
import {
  EmbeddingError,
  IngestJobNotFoundError,
} from '@lily/shared/errors/knowledge'
import {
  ChunkSearchResult,
  CreateIngestJobRequest,
  IngestJob,
  KnowledgeSearchRequest,
  KnowledgeStats,
} from '@lily/shared/knowledge'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'

const jobIdParam = Schema.String.check(Schema.isGUID())

export const KnowledgeIngestionApi = HttpApiGroup.make('knowledgeIngestion')
  .add(
    HttpApiEndpoint.post('createIngestJob', '/jobs', {
      payload: CreateIngestJobRequest,
      success: IngestJob,
    })
  )
  .add(
    HttpApiEndpoint.get('listIngestJobs', '/jobs', {
      success: Schema.Array(IngestJob),
    })
  )
  .add(
    HttpApiEndpoint.get('getIngestJob', '/jobs/:id', {
      params: { id: jobIdParam },
      success: IngestJob,
      error: IngestJobNotFoundError,
    })
  )
  .add(
    HttpApiEndpoint.delete('deleteIngestJob', '/jobs/:id', {
      params: { id: jobIdParam },
      success: Schema.Void,
      error: IngestJobNotFoundError,
    })
  )
  .add(
    HttpApiEndpoint.get('getKnowledgeStats', '/stats', {
      success: KnowledgeStats,
    })
  )
  .add(
    HttpApiEndpoint.post('searchKnowledge', '/search', {
      payload: KnowledgeSearchRequest,
      success: Schema.Array(ChunkSearchResult),
      error: EmbeddingError,
    })
  )
  .prefix('/knowledge')
  .middleware(AdminAuth)
