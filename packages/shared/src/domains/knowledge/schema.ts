import { Schema } from 'effect'
import { PaginatedResponse } from '../common/pagination'

export const IngestJobStatus = Schema.Literal(
  'pending',
  'in_progress',
  'completed',
  'failed'
)

export type IngestJobStatus = typeof IngestJobStatus.Type

export const ContentCategory = Schema.Literal(
  'watering_advice',
  'pest_identification',
  'disease_diagnosis',
  'light_requirements',
  'soil_nutrients',
  'propagation',
  'general_care'
)

export type ContentCategory = typeof ContentCategory.Type

export const RedditAdapterConfig = Schema.Struct({
  type: Schema.Literal('reddit'),
  subreddits: Schema.Array(Schema.String),
  sort: Schema.optionalWith(Schema.Literal('hot', 'top', 'new'), {
    default: () => 'top' as const,
  }),
  timeFilter: Schema.optionalWith(
    Schema.Literal('day', 'week', 'month', 'year', 'all'),
    { default: () => 'year' as const }
  ),
  limit: Schema.optionalWith(
    Schema.Number.pipe(Schema.int(), Schema.between(1, 1000)),
    { default: () => 25 }
  ),
})

export type RedditAdapterConfig = typeof RedditAdapterConfig.Type

export const WebAdapterConfig = Schema.Struct({
  type: Schema.Literal('web'),
  urls: Schema.Array(Schema.String),
})

export type WebAdapterConfig = typeof WebAdapterConfig.Type

export const FileAdapterConfig = Schema.Struct({
  type: Schema.Literal('file'),
  paths: Schema.Array(Schema.String),
})

export type FileAdapterConfig = typeof FileAdapterConfig.Type

export const AdapterConfig = Schema.Union(
  RedditAdapterConfig,
  WebAdapterConfig,
  FileAdapterConfig
)

export type AdapterConfig = typeof AdapterConfig.Type

export const IngestJob = Schema.Struct({
  id: Schema.String,
  adapter: Schema.String,
  config: Schema.Unknown,
  status: IngestJobStatus,
  documentsFetched: Schema.Number,
  chunksCreated: Schema.Number,
  cursor: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

export type IngestJob = typeof IngestJob.Type

export const RawDocument = Schema.Struct({
  id: Schema.String,
  source: Schema.String,
  sourceUrl: Schema.optional(Schema.String),
  sourceId: Schema.optional(Schema.String),
  title: Schema.String,
  content: Schema.String,
  author: Schema.optional(Schema.String),
  score: Schema.optional(Schema.Number),
  metadata: Schema.optional(Schema.Unknown),
  ingestJobId: Schema.String,
  fetchedAt: Schema.Date,
})

export type RawDocument = typeof RawDocument.Type

export const ProcessedChunk = Schema.Struct({
  id: Schema.String,
  documentId: Schema.String,
  parentChunkId: Schema.optional(Schema.String),
  content: Schema.String,
  chunkIndex: Schema.Number,
  source: Schema.String,
  plantType: Schema.optional(Schema.String),
  category: Schema.optional(ContentCategory),
  plantMentions: Schema.optional(Schema.Array(Schema.String)),
  metadata: Schema.optional(Schema.Unknown),
  createdAt: Schema.Date,
})

export type ProcessedChunk = typeof ProcessedChunk.Type

export const ChunkSearchResult = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  source: Schema.String,
  sourceUrl: Schema.optional(Schema.String),
  plantType: Schema.optional(Schema.String),
  category: Schema.optional(ContentCategory),
  metadata: Schema.optional(Schema.Unknown),
  similarity: Schema.Number,
})

export type ChunkSearchResult = typeof ChunkSearchResult.Type

export const CreateIngestJobRequest = Schema.Struct({
  adapter: Schema.String,
  config: AdapterConfig,
})

export type CreateIngestJobRequest = typeof CreateIngestJobRequest.Type

export const IngestJobListResponse = PaginatedResponse(IngestJob)
export type IngestJobListResponse = typeof IngestJobListResponse.Type

export const KnowledgeSearchRequest = Schema.Struct({
  query: Schema.String,
  plantType: Schema.optional(Schema.String),
  limit: Schema.optionalWith(Schema.Number, { default: () => 5 }),
  minSimilarity: Schema.optionalWith(Schema.Number, { default: () => 0.3 }),
})

export type KnowledgeSearchRequest = typeof KnowledgeSearchRequest.Type

export const KnowledgeStats = Schema.Struct({
  totalChunks: Schema.Number,
  totalDocuments: Schema.Number,
  totalJobs: Schema.Number,
  sourceBreakdown: Schema.Array(
    Schema.Struct({
      source: Schema.String,
      count: Schema.Number,
    })
  ),
})

export type KnowledgeStats = typeof KnowledgeStats.Type
