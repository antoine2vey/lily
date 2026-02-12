import {
  type CreateDiagnosisData,
  DiagnosisRepository,
  type IDiagnosisRepository,
} from '@lily/api/repositories/diagnosis.repository'
import type { diagnoses } from '@lily/db'
import { paginate } from '@lily/shared'
import type { Diagnosis } from '@lily/shared/diagnosis'
import { Array, Effect, Layer, Option, pipe } from 'effect'

type DiagnosisRecord = typeof diagnoses.$inferSelect

const mapToDiagnosis = (row: DiagnosisRecord): Diagnosis => ({
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
  imageUrl: Option.getOrUndefined(Option.fromNullable(row.imageUrl)),
  status: row.status,
  resolvedAt: Option.getOrUndefined(Option.fromNullable(row.resolvedAt)),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const createMockDiagnosisRepository = (
  data: DiagnosisRecord[]
): Layer.Layer<DiagnosisRepository> => {
  const diagnosesData = Array.map(data, (d) => ({ ...d }))

  const repo: IDiagnosisRepository = {
    create: (createData: CreateDiagnosisData) => {
      const newRecord: DiagnosisRecord = {
        id: `diagnosis-${crypto.randomUUID()}`,
        plantId: createData.plantId,
        userId: createData.userId,
        chatMessageId: createData.chatMessageId ?? null,
        diseaseName: createData.diseaseName,
        severity: createData.severity,
        confidence: createData.confidence,
        symptoms: createData.symptoms,
        treatmentSteps: createData.treatmentSteps,
        preventionTips: createData.preventionTips ?? null,
        imageUrl: createData.imageUrl ?? null,
        status: 'ACTIVE',
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      diagnosesData.push(newRecord)
      return Effect.succeed(mapToDiagnosis(newRecord))
    },

    findByPlantId: (params) => {
      const page = pipe(
        Option.fromNullable(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullable(params.limit),
        Option.getOrElse(() => 20)
      )
      const offset = (page - 1) * limit

      const filtered = Array.filter(
        diagnosesData,
        (d) => d.plantId === params.plantId && d.userId === params.userId
      )

      const sorted = [...filtered].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )

      const total = sorted.length
      const items = sorted.slice(offset, offset + limit)

      return Effect.succeed(
        paginate(Array.map(items, mapToDiagnosis), total, page, limit)
      )
    },

    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(diagnosesData, (d) => d.id === id),
          Option.map(mapToDiagnosis),
          Option.getOrNull
        )
      ),

    linkChatMessage: (diagnosisId: string, chatMessageId: string) => {
      const idx = diagnosesData.findIndex((d) => d.id === diagnosisId)
      if (idx !== -1) {
        const existing = diagnosesData[idx]
        if (existing) {
          diagnosesData[idx] = {
            ...existing,
            chatMessageId,
          }
        }
      }
      return Effect.void
    },

    markResolved: (id: string, userId: string) => {
      const idx = diagnosesData.findIndex(
        (d) => d.id === id && d.userId === userId
      )
      if (idx === -1) return Effect.succeed(null)

      const existing = diagnosesData[idx]
      if (!existing) return Effect.succeed(null)

      const updated = {
        ...existing,
        status: 'RESOLVED' as const,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      }
      diagnosesData[idx] = updated
      return Effect.succeed(mapToDiagnosis(updated))
    },
  }

  return Layer.succeed(DiagnosisRepository, repo)
}
