import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { AdminAuth } from '@lily/api/services/admin/middleware.types'
import { IngestJobNotFoundError } from '@lily/shared/errors/knowledge'
import {
  CreateIngestJobRequest,
  IngestJob,
  KnowledgeStats,
} from '@lily/shared/knowledge'
import { Schema } from 'effect'

const jobIdParam = HttpApiSchema.param('id', Schema.String)

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
    HttpApiEndpoint.get('getKnowledgeStats')`/stats`.addSuccess(KnowledgeStats)
  )
  .prefix('/knowledge')
  .middleware(AdminAuth)
