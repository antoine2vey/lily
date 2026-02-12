import { Schema } from 'effect'
import { PaginatedResponse } from '../common/pagination'

export const DiagnosisSeverity = Schema.Union(
  Schema.Literal('LOW'),
  Schema.Literal('MODERATE'),
  Schema.Literal('HIGH'),
  Schema.Literal('CRITICAL')
)

export type DiagnosisSeverity = typeof DiagnosisSeverity.Type

export const DiagnosisStatus = Schema.Union(
  Schema.Literal('ACTIVE'),
  Schema.Literal('RESOLVED')
)

export type DiagnosisStatus = typeof DiagnosisStatus.Type

export const Diagnosis = Schema.Struct({
  id: Schema.String,
  plantId: Schema.String,
  userId: Schema.String,
  chatMessageId: Schema.optional(Schema.String),
  diseaseName: Schema.String,
  severity: DiagnosisSeverity,
  confidence: Schema.Number,
  symptoms: Schema.Array(Schema.String),
  treatmentSteps: Schema.Array(Schema.String),
  preventionTips: Schema.optional(Schema.Array(Schema.String)),
  imageUrl: Schema.optional(Schema.String),
  status: DiagnosisStatus,
  resolvedAt: Schema.optional(Schema.Date),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

export type Diagnosis = typeof Diagnosis.Type

export const DiagnosisListResponse = PaginatedResponse(Diagnosis)
export type DiagnosisListResponse = typeof DiagnosisListResponse.Type
