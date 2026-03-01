import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
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

const jobIdParam = HttpApiSchema.param('id', Schema.UUID)

export const KnowledgeIngestionApi = HttpApiGroup.make('knowledgeIngestion')
  .add(
    HttpApiEndpoint.post('createIngestJob')`/jobs`
      .setPayload(CreateIngestJobRequest)
      .addSuccess(IngestJob)
  )
  .add(
    HttpApiEndpoint.get('listIngestJobs')`/jobs`.addSuccess(
      Schema.Array(IngestJob)
    )
  )
  .add(
    HttpApiEndpoint.get('getIngestJob')`/jobs/${jobIdParam}`
      .addSuccess(IngestJob)
      .addError(IngestJobNotFoundError, { status: 404 })
  )
  .add(
    HttpApiEndpoint.del('deleteIngestJob')`/jobs/${jobIdParam}`
      .addSuccess(Schema.Void)
      .addError(IngestJobNotFoundError, { status: 404 })
  )
  .add(
    HttpApiEndpoint.get('getKnowledgeStats')`/stats`.addSuccess(KnowledgeStats)
  )
  .add(
    HttpApiEndpoint.post('searchKnowledge')`/search`
      .setPayload(KnowledgeSearchRequest)
      .addSuccess(Schema.Array(ChunkSearchResult))
      .addError(EmbeddingError, { status: 500 })
  )
  .prefix('/knowledge')
  .middleware(AdminAuth)
