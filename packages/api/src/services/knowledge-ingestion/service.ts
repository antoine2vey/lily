import { createIngestJob } from '@lily/api/services/knowledge-ingestion/endpoints/create-ingest-job'
import { deleteIngestJob } from '@lily/api/services/knowledge-ingestion/endpoints/delete-ingest-job'
import { getIngestJob } from '@lily/api/services/knowledge-ingestion/endpoints/get-ingest-job'
import { getKnowledgeStats } from '@lily/api/services/knowledge-ingestion/endpoints/get-knowledge-stats'
import { listIngestJobs } from '@lily/api/services/knowledge-ingestion/endpoints/list-ingest-jobs'
import { Effect } from 'effect'

export class KnowledgeIngestionService extends Effect.Service<KnowledgeIngestionService>()(
  'KnowledgeIngestionService',
  {
    effect: Effect.succeed({
      createIngestJob,
      listIngestJobs,
      getIngestJob,
      getKnowledgeStats,
      deleteIngestJob,
    }),
  }
) {}
