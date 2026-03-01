import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import { diagnoses } from '@lily/db/schema'
import { nowAsDate, paginate } from '@lily/shared'
import type { Diagnosis, DiagnosisListResponse } from '@lily/shared/diagnosis'
import { and, count, desc, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

export interface FindDiagnosesParams {
  plantId: string
  userId: string
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
  imageKey?: string
}

const mapToDiagnosis = (row: typeof diagnoses.$inferSelect): Diagnosis => ({
  id: row.id,
  plantId: row.plantId,
  userId: row.userId,
  chatMessageId: Option.getOrUndefined(Option.fromNullable(row.chatMessageId)),
  diseaseName: row.diseaseName,
  severity: row.severity,
  confidence: row.confidence,
  symptoms: row.symptoms,
  treatmentSteps: row.treatmentSteps,
  preventionTips: Option.getOrUndefined(
    Option.fromNullable(row.preventionTips)
  ),
  imageUrl: Option.getOrUndefined(Option.fromNullable(row.imageKey)),
  status: row.status,
  resolvedAt: Option.getOrUndefined(Option.fromNullable(row.resolvedAt)),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export interface IDiagnosisRepository {
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
  readonly markResolved: (
    id: string,
    userId: string
  ) => Effect.Effect<Diagnosis | null, SqlError>
}

export class DiagnosisRepository extends Context.Tag('DiagnosisRepository')<
  DiagnosisRepository,
  IDiagnosisRepository
>() {}

export const DiagnosisRepositoryLive = Layer.effect(
  DiagnosisRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: (data: CreateDiagnosisData) =>
        Effect.gen(function* () {
          const rows = yield* db
            .insert(diagnoses)
            .values({
              plantId: data.plantId,
              userId: data.userId,
              chatMessageId: Option.getOrNull(
                Option.fromNullable(data.chatMessageId)
              ),
              diseaseName: data.diseaseName,
              severity: data.severity,
              confidence: data.confidence,
              symptoms: data.symptoms,
              treatmentSteps: data.treatmentSteps,
              preventionTips: Option.getOrNull(
                Option.fromNullable(data.preventionTips)
              ),
              imageKey: Option.getOrNull(Option.fromNullable(data.imageKey)),
            })
            .returning()

          return pipe(
            Array.head(rows),
            Option.map(mapToDiagnosis),
            Option.getOrThrow
          )
        }).pipe(Effect.withSpan('DiagnosisRepository.create')),

      findByPlantId: (params: FindDiagnosesParams) =>
        Effect.gen(function* () {
          const { page, limit, offset } = getPaginationParams(params)

          const filterConditions = and(
            eq(diagnoses.plantId, params.plantId),
            eq(diagnoses.userId, params.userId)
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
        }).pipe(Effect.withSpan('DiagnosisRepository.findByPlantId')),

      findById: (id: string) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(diagnoses)
            .where(eq(diagnoses.id, id))

          return pipe(
            Array.head(rows),
            Option.map(mapToDiagnosis),
            Option.getOrNull
          )
        }).pipe(Effect.withSpan('DiagnosisRepository.findById')),

      linkChatMessage: (diagnosisId: string, chatMessageId: string) =>
        Effect.gen(function* () {
          yield* db
            .update(diagnoses)
            .set({ chatMessageId })
            .where(eq(diagnoses.id, diagnosisId))
        }).pipe(Effect.withSpan('DiagnosisRepository.linkChatMessage')),

      markResolved: (id: string, userId: string) =>
        Effect.gen(function* () {
          const rows = yield* db
            .update(diagnoses)
            .set({
              status: 'RESOLVED',
              resolvedAt: nowAsDate(),
            })
            .where(and(eq(diagnoses.id, id), eq(diagnoses.userId, userId)))
            .returning()

          return pipe(
            Array.head(rows),
            Option.map(mapToDiagnosis),
            Option.getOrNull
          )
        }).pipe(Effect.withSpan('DiagnosisRepository.markResolved')),
    }
  })
)
