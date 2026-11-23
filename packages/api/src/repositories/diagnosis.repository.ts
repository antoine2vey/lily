import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { chatConversations, diagnoses } from '@lily/db/schema'
import { paginate } from '@lily/shared'
import type { Diagnosis, DiagnosisListResponse } from '@lily/shared/diagnosis'
import type { StoredObjectRef } from '@lily/shared/services/file/stored-object'
import { and, count, desc, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface FindDiagnosesParams {
  plantId: string
  author: Option.Option<string>
  page?: number
  limit?: number
}

export interface CreateDiagnosisData {
  plantId: string
  userId: string
  chatMessageId?: string
  diseaseName: string
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
  confidence: number
  symptoms: string[]
  treatmentSteps: string[]
  preventionTips?: string[]
  imageKey?: StoredObjectRef
}

const mapToDiagnosis = (row: typeof diagnoses.$inferSelect): Diagnosis => ({
  id: row.id,
  plantId: row.plantId,
  userId: row.userId,
  chatMessageId: Option.getOrUndefined(Option.fromNullishOr(row.chatMessageId)),
  diseaseName: row.diseaseName,
  severity: row.severity,
  confidence: row.confidence,
  symptoms: row.symptoms,
  treatmentSteps: row.treatmentSteps,
  preventionTips: Option.getOrUndefined(
    Option.fromNullishOr(row.preventionTips)
  ),
  imageUrl: Option.getOrUndefined(Option.fromNullishOr(row.imageKey)),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export interface IDiagnosisRepository {
  /**
   * Locks the conversation against deletion until the transaction ends, and
   * tells whether it is still there. A diagnosis that shows a photo of the
   * conversation is written under this lock. A deletion of the conversation
   * then waits for the diagnosis and keeps the photo, or has already
   * committed, and the diagnosis is written without the photo.
   */
  readonly holdConversation: (
    conversationId: string
  ) => Effect.Effect<boolean, SqlError>
  readonly create: (
    data: CreateDiagnosisData
  ) => Effect.Effect<Diagnosis, SqlError>
  readonly findByPlantId: (
    params: FindDiagnosesParams
  ) => Effect.Effect<DiagnosisListResponse, SqlError>
  readonly findById: (id: string) => Effect.Effect<Diagnosis | null, SqlError>
  readonly linkChatMessage: (
    diagnosisId: string,
    chatMessageId: string
  ) => Effect.Effect<void, SqlError>
}

export class DiagnosisRepository extends Context.Service<
  DiagnosisRepository,
  IDiagnosisRepository
>()('DiagnosisRepository') {}

export const DiagnosisRepositoryLive = Layer.effect(
  DiagnosisRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      holdConversation: Effect.fn('DiagnosisRepository.holdConversation')(
        function* (conversationId: string) {
          const rows = yield* db
            .select({ id: chatConversations.id })
            .from(chatConversations)
            .where(eq(chatConversations.id, conversationId))
            .for('key share')
          return Array.isArrayNonEmpty(rows)
        }
      ),

      create: Effect.fn('DiagnosisRepository.create')(function* (
        data: CreateDiagnosisData
      ) {
        const rows = yield* db
          .insert(diagnoses)
          .values({
            plantId: data.plantId,
            userId: data.userId,
            chatMessageId: Option.getOrNull(
              Option.fromNullishOr(data.chatMessageId)
            ),
            diseaseName: data.diseaseName,
            severity: data.severity,
            confidence: data.confidence,
            symptoms: data.symptoms,
            treatmentSteps: data.treatmentSteps,
            preventionTips: Option.getOrNull(
              Option.fromNullishOr(data.preventionTips)
            ),
            imageKey: Option.getOrNull(Option.fromNullishOr(data.imageKey)),
          })
          .returning()

        return pipe(
          Array.head(rows),
          Option.map(mapToDiagnosis),
          Option.getOrThrow
        )
      }),

      findByPlantId: Effect.fn('DiagnosisRepository.findByPlantId')(function* (
        params: FindDiagnosesParams
      ) {
        const { page, limit, offset } = getPaginationParams(params)

        const filterConditions = and(
          eq(diagnoses.plantId, params.plantId),
          ...Option.match(params.author, {
            onNone: () => [],
            onSome: (userId) => [eq(diagnoses.userId, userId)],
          })
        )

        const countResult = yield* db
          .select({ value: count() })
          .from(diagnoses)
          .where(filterConditions)
        const total = extractCount(countResult)

        const rows = yield* db
          .select()
          .from(diagnoses)
          .where(filterConditions)
          .offset(offset)
          .limit(limit)
          .orderBy(desc(diagnoses.createdAt))

        return paginate(Array.map(rows, mapToDiagnosis), total, page, limit)
      }),

      findById: Effect.fn('DiagnosisRepository.findById')(function* (
        id: string
      ) {
        const rows = yield* db
          .select()
          .from(diagnoses)
          .where(eq(diagnoses.id, id))

        return pipe(
          Array.head(rows),
          Option.map(mapToDiagnosis),
          Option.getOrNull
        )
      }),

      linkChatMessage: Effect.fn('DiagnosisRepository.linkChatMessage')(
        function* (diagnosisId: string, chatMessageId: string) {
          yield* db
            .update(diagnoses)
            .set({ chatMessageId })
            .where(eq(diagnoses.id, diagnosisId))
        }
      ),
    }
  })
)
