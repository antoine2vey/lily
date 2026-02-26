import { pgEnum } from 'drizzle-orm/pg-core'

export const ingestJobStatusEnum = pgEnum('ingest_job_status', [
  'pending',
  'in_progress',
  'completed',
  'failed',
])

export const contentCategoryEnum = pgEnum('content_category', [
  'watering_advice',
  'pest_identification',
  'disease_diagnosis',
  'light_requirements',
  'soil_nutrients',
  'propagation',
  'general_care',
])
