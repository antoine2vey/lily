import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import { Schema } from 'effect'

export const KnowledgeQueryRequest = Schema.Struct({
  question: Schema.String,
  plantName: Schema.optional(Schema.String),
})

export type KnowledgeQueryRequest = typeof KnowledgeQueryRequest.Type

const KnowledgeSource = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
  similarity: Schema.Number,
})

export const KnowledgeQueryResponse = Schema.Struct({
  answer: Schema.String,
  sources: Schema.Array(KnowledgeSource),
})

export type KnowledgeQueryResponse = typeof KnowledgeQueryResponse.Type

/**
 * Knowledge API — RAG-powered plant care question answering.
 * Protected by standard JWT authentication.
 */
export const KnowledgeApi = HttpApiGroup.make('knowledge')
  .add(
    HttpApiEndpoint.post('queryKnowledge')`/query`
      .setPayload(KnowledgeQueryRequest)
      .addSuccess(KnowledgeQueryResponse)
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/knowledge')
  .middleware(Authentication)
