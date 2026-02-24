import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { IngestJobRepositoryLive } from '@lily/api/repositories/ingest-job.repository'
import { ProcessedChunkRepositoryLive } from '@lily/api/repositories/processed-chunk.repository'
import { RawDocumentRepositoryLive } from '@lily/api/repositories/raw-document.repository'
import { AdminAuthLive } from '@lily/api/services/admin/middleware.impl'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { KnowledgeIngestionService } from '@lily/api/services/knowledge-ingestion/service'
import { KnowledgeDrizzleLive } from '@lily/knowledge-db'
import { Effect, Layer } from 'effect'

export const KnowledgeIngestionApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'knowledgeIngestion', (handlers) =>
    Effect.gen(function* () {
      const service = yield* KnowledgeIngestionService

      return handlers
        .handle('createIngestJob', ({ payload }) =>
          service
            .createIngestJob(payload.adapter, payload.config)
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('listIngestJobs', () =>
          service.listIngestJobs.pipe(withInfraErrorsAsDefect)
        )
        .handle('getIngestJob', ({ path: { id } }) =>
          service.getIngestJob(id).pipe(withInfraErrorsAsDefect)
        )
        .handle('getKnowledgeStats', () =>
          service.getKnowledgeStats.pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(KnowledgeIngestionService.Default),
    Layer.provide(IngestJobRepositoryLive),
    Layer.provide(RawDocumentRepositoryLive),
    Layer.provide(ProcessedChunkRepositoryLive),
    Layer.provide(KnowledgeDrizzleLive),
    Layer.provide(AdminAuthLive)
  )
