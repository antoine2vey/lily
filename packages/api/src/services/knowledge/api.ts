import { Authentication } from '@lily/api/services/auth/middleware.types'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

export const KnowledgeQueryRequest = Schema.Struct({
  question: Schema.String,
  plantName: Schema.optional(Schema.String),
})

export type KnowledgeQueryRequest = typeof KnowledgeQueryRequest.Type

const KnowledgeSource = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
  similarity: Schema.Finite,
})

export const KnowledgeQueryResponse = Schema.Struct({
  answer: Schema.String,
  sources: Schema.Array(KnowledgeSource),
})

export type KnowledgeQueryResponse = typeof KnowledgeQueryResponse.Type

export const KnowledgeApi = HttpApiGroup.make('knowledge')
  .add(
    HttpApiEndpoint.post('queryKnowledge', '/query', {
      payload: KnowledgeQueryRequest,
      success: KnowledgeQueryResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .prefix('/knowledge')
  .middleware(Authentication)
