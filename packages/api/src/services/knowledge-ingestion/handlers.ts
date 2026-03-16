import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { ProcessedChunkRepository } from '@lily/api/repositories/processed-chunk.repository'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { createIngestJob } from '@lily/api/services/knowledge-ingestion/endpoints/create-ingest-job'
import { deleteIngestJob } from '@lily/api/services/knowledge-ingestion/endpoints/delete-ingest-job'
import { getIngestJob } from '@lily/api/services/knowledge-ingestion/endpoints/get-ingest-job'
import { getKnowledgeStats } from '@lily/api/services/knowledge-ingestion/endpoints/get-knowledge-stats'
import { listIngestJobs } from '@lily/api/services/knowledge-ingestion/endpoints/list-ingest-jobs'
import { embedText } from '@lily/api/services/rag/embedding.service'
import { Effect } from 'effect'

export const KnowledgeIngestionApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'knowledgeIngestion', (handlers) =>
    Effect.gen(function* () {
      const chunkRepo = yield* ProcessedChunkRepository

      return handlers
        .handle('createIngestJob', ({ payload }) =>
          createIngestJob(payload.adapter, payload.config).pipe(
            withInfraErrorsAsDefect
          )
        )
        .handle('listIngestJobs', () =>
          listIngestJobs.pipe(withInfraErrorsAsDefect)
        )
        .handle('getIngestJob', ({ path: { id } }) =>
          getIngestJob(id).pipe(withInfraErrorsAsDefect)
        )
        .handle('deleteIngestJob', ({ path: { id } }) =>
          deleteIngestJob(id).pipe(withInfraErrorsAsDefect)
        )
        .handle('getKnowledgeStats', () =>
          getKnowledgeStats.pipe(withInfraErrorsAsDefect)
        )
        .handle('searchKnowledge', ({ payload }) =>
          Effect.gen(function* () {
            yield* Effect.logInfo('searchKnowledge start', {
              query: payload.query,
            })
            const embedding = yield* embedText(payload.query)
            yield* Effect.logInfo('embedText ok, running search')
            const results = yield* chunkRepo.search({
              embedding,
              queryText: payload.query,
              limit: payload.limit,
              minSimilarity: payload.minSimilarity,
            })
            yield* Effect.logInfo('search ok', { count: results.length })
            return results
          }).pipe(
            Effect.tapDefect((cause) =>
              Effect.logError('searchKnowledge defect', {
                cause: String(cause),
              })
            ),
            withInfraErrorsAsDefect
          )
        )
    })
  )
